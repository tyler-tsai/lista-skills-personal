/**
 * Market supply command
 * Supply collateral to a Lista Lending market
 * After success, shows updated position and max borrowable
 */

import { getSDK, getChainId, SUPPORTED_CHAINS } from "../sdk.js";
import { executeSteps } from "../executor.js";
import {
  loadContext,
  OperationStatus,
  OperationType,
  TargetType,
} from "../context.js";
import type { ParsedArgs, StepParam } from "../types.js";
import { mapMarketUserPosition } from "../utils/position.js";
import { InputValidationError, parsePositiveUnits } from "../utils/validators.js";
import {
  requireAmount,
  resolveMarketContext,
} from "./shared/context.js";
import { printJson, printDebug, exitWithCode } from "./shared/output.js";
import {
  buildExecutionFailureOutput,
  buildPendingExecutionOutput,
  ensureStepsGenerated,
} from "./shared/tx.js";
import { recordOperation } from "./shared/operation.js";
import { buildSdkErrorOutput } from "./shared/errors.js";
import { buildMarketPositionPayload } from "./shared/market.js";

export async function cmdSupply(args: ParsedArgs): Promise<void> {
  const ctx = loadContext();
  let operationContext:
    | {
        marketId: string;
        chain: string;
        amount: string;
      }
    | undefined;

  try {
    const amount = requireAmount(args.amount);
    const { marketId, chain, walletAddress, walletTopic } = resolveMarketContext(
      args,
      ctx,
      { supportedChains: SUPPORTED_CHAINS }
    );
    const chainId = getChainId(chain);
    const sdk = getSDK();

    // 1. Get market info for collateral decimals
    printDebug({ action: "fetching_market_info", market: marketId, chain });
    const marketInfo = await sdk.getWriteConfig(chainId, marketId);
    const collateralInfo = marketInfo.collateralInfo;
    const decimals = collateralInfo.decimals;

    // 2. Parse amount with correct decimals
    const assets = parsePositiveUnits(amount, decimals, "amount");
    operationContext = { marketId, chain, amount };
    const operationRecord = {
      type: OperationType.Supply,
      targetType: TargetType.Market,
      targetId: marketId,
      chain,
      amount,
      symbol: collateralInfo.symbol,
    };

    printDebug({
      action: "building_supply",
      market: marketId,
      chain,
      collateral: collateralInfo.symbol,
      amount,
      decimals,
      rawAmount: assets.toString(),
    });

    // 3. Build supply steps (may include approve step)
    const steps = ensureStepsGenerated(
      await sdk.buildSupplyParams({
        chainId,
        marketId,
        assets,
        walletAddress,
        marketInfo,
      })
    );

    printDebug({
      action: "executing_steps",
      count: steps.length,
      types: steps.map((s: StepParam) => s.step),
    });

    // 4. Execute steps via lista-wallet-connect
    const results = await executeSteps(steps, {
      topic: walletTopic!,
      chain,
    });

    // 5. Check result
    const lastResult = results[results.length - 1];

    if (lastResult.status === "pending") {
      recordOperation(operationRecord, OperationStatus.Pending, lastResult.txHash);

      printJson(buildPendingExecutionOutput(lastResult, results, steps.length));
      exitWithCode(0);
    }

    if (lastResult.status === "sent") {
      // 6. Re-query position on-chain after successful supply
      printDebug({ action: "refreshing_position" });

      const userData = await sdk.getMarketUserData(chainId, marketId, walletAddress);
      const mappedPosition = mapMarketUserPosition(userData, {
        collateralPrice: 0,
        loanPrice: 0,
      });

      printDebug({
        action: "position_debug",
        collateral: mappedPosition.collateral,
        borrowed: mappedPosition.borrowed,
        ltv: mappedPosition.ltv,
        lltv: mappedPosition.lltv,
        loanable: userData.loanable?.toFixed(8),
      });

      recordOperation(operationRecord, OperationStatus.Success, lastResult.txHash);

      printJson({
        status: "success",
        market: marketId,
        chain,
        collateral: collateralInfo.symbol,
        supplied: amount,
        steps: results.length,
        txHash: lastResult.txHash,
        explorer: lastResult.explorer,
        position: buildMarketPositionPayload(mappedPosition, {
          loanable: userData.loanable?.toFixed(8) || "0",
        }),
        hint: userData.loanable?.gt(0)
          ? `You can now borrow up to ${userData.loanable.toFixed(4)} ${userData.loanInfo.symbol}`
          : undefined,
      });
      exitWithCode(0);
    }

    recordOperation(operationRecord, OperationStatus.Failed);

    printJson(buildExecutionFailureOutput(results, steps.length));
    exitWithCode(1);
  } catch (err) {
    if (err instanceof InputValidationError) {
      printJson({
        status: "error",
        reason: err.message,
      });
      exitWithCode(1);
    }

    const message = (err as Error).message || String(err);

    printJson(
      buildSdkErrorOutput(message, {
        targetType: TargetType.Market,
        targetId: operationContext?.marketId,
      })
    );

    if (operationContext) {
      recordOperation(
        {
          type: OperationType.Supply,
          targetType: TargetType.Market,
          targetId: operationContext.marketId,
          chain: operationContext.chain,
          amount: operationContext.amount,
        },
        OperationStatus.Failed
      );
    }
    exitWithCode(1);
  }
}
