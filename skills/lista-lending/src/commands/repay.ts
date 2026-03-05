/**
 * Market repay command
 * Repay borrowed loan tokens to a Lista Lending market
 *
 * Features:
 * - --amount: Repay specific amount
 * - --repay-all: Repay entire debt
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
  requireAmountOrAll,
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
import {
  buildMarketPositionPayload,
  buildRepayHint,
  getRepayNoDebtError,
} from "./shared/market.js";

export async function cmdRepay(args: ParsedArgs): Promise<void> {
  const ctx = loadContext();
  let operationContext:
    | {
        marketId: string;
        chain: string;
        amount: string;
      }
    | undefined;

  try {
    requireAmountOrAll(args.amount, args.repayAll, "--repay-all");
    const { marketId, chain, walletAddress, walletTopic } = resolveMarketContext(
      args,
      ctx,
      { supportedChains: SUPPORTED_CHAINS }
    );
    const chainId = getChainId(chain);
    const sdk = getSDK();

    // 1. Get market info and user data
    printDebug({ action: "fetching_market_info", market: marketId, chain });
    const marketInfo = await sdk.getWriteConfig(chainId, marketId);
    const userData = await sdk.getMarketUserData(chainId, marketId, walletAddress);
    const loanInfo = marketInfo.loanInfo;

    // Check if user has debt to repay
    if (userData.borrowed.isZero()) {
      printJson(getRepayNoDebtError());
      exitWithCode(1);
    }

    // 2. Parse amount (if not repay-all)
    const decimals = loanInfo.decimals;
    let assets: bigint | undefined;
    if (args.amount) {
      assets = parsePositiveUnits(args.amount, decimals, "amount");
    }

    const operationAmount = args.amount || "all";
    operationContext = {
      marketId,
      chain,
      amount: operationAmount,
    };
    const operationRecord = {
      type: OperationType.Repay,
      targetType: TargetType.Market,
      targetId: marketId,
      chain,
      amount: operationAmount,
      symbol: loanInfo.symbol,
    };

    printDebug({
      action: "building_repay",
      market: marketId,
      chain,
      loan: loanInfo.symbol,
      amount: args.amount,
      repayAll: args.repayAll,
      currentDebt: userData.borrowed.toFixed(8),
    });

    // 3. Build repay steps (may include approve step)
    const steps = ensureStepsGenerated(
      await sdk.buildRepayParams({
        chainId,
        marketId,
        assets,
        repayAll: args.repayAll,
        walletAddress,
        marketInfo,
        userData,
      })
    );

    printDebug({
      action: "executing_steps",
      count: steps.length,
      types: steps.map((s: StepParam) => s.step),
    });

    // 4. Execute steps via wallet-connect
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
      // 6. Re-query position on-chain after successful repay
      printDebug({ action: "refreshing_position" });

      const newUserData = await sdk.getMarketUserData(chainId, marketId, walletAddress);
      const mappedPosition = mapMarketUserPosition(newUserData, {
        collateralPrice: 0,
        loanPrice: 0,
      });

      printDebug({
        action: "position_debug",
        collateral: mappedPosition.collateral,
        borrowed: mappedPosition.borrowed,
        ltv: mappedPosition.ltv,
        withdrawable: newUserData.withdrawable?.toFixed(8),
      });

      recordOperation(operationRecord, OperationStatus.Success, lastResult.txHash);

      printJson({
        status: "success",
        market: marketId,
        chain,
        loan: loanInfo.symbol,
        repaid: operationAmount,
        txHash: lastResult.txHash,
        explorer: lastResult.explorer,
        position: buildMarketPositionPayload(mappedPosition, {
          withdrawable: newUserData.withdrawable?.toFixed(8) || "0",
          remainingDebt: mappedPosition.borrowed !== "0",
        }),
        hint: buildRepayHint(newUserData),
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
        insufficientReason: "insufficient_balance",
        insufficientMessage: "Insufficient loan token balance in wallet to repay",
      })
    );

    if (operationContext) {
      recordOperation(
        {
          type: OperationType.Repay,
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
