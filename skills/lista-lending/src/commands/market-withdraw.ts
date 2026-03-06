/**
 * Market withdraw command
 * Withdraw collateral from a Lista Lending market
 *
 * Features:
 * - --amount: Withdraw specific amount
 * - --withdraw-all: Withdraw all collateral (only if no debt)
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
  getExceedsWithdrawableError,
  getWithdrawAllHasDebtError,
  getWithdrawNoCollateralError,
} from "./shared/market.js";

export async function cmdMarketWithdraw(args: ParsedArgs): Promise<void> {
  const ctx = loadContext();
  let operationContext:
    | {
        marketId: string;
        chain: string;
        amount: string;
      }
    | undefined;

  try {
    requireAmountOrAll(args.amount, args.withdrawAll, "--withdraw-all");
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
    const collateralInfo = marketInfo.collateralInfo;

    // Check if user has collateral to withdraw
    if (userData.collateral.isZero()) {
      printJson(getWithdrawNoCollateralError());
      exitWithCode(1);
    }

    // Check if user can withdraw all (only if no debt)
    if (args.withdrawAll && !userData.borrowed.isZero()) {
      printJson(getWithdrawAllHasDebtError(userData));
      exitWithCode(1);
    }

    // 2. Parse amount (if not withdraw-all)
    const decimals = collateralInfo.decimals;
    let assets: bigint | undefined;
    if (args.amount) {
      assets = parsePositiveUnits(args.amount, decimals, "amount");

      // Check if withdraw amount exceeds withdrawable
      const requestedAmount = parseFloat(args.amount);
      if (userData.withdrawable.lt(requestedAmount)) {
        printJson(
          getExceedsWithdrawableError(args.amount, userData, collateralInfo.symbol)
        );
        exitWithCode(1);
      }
    }

    const operationAmount = args.amount || "all";
    operationContext = {
      marketId,
      chain,
      amount: operationAmount,
    };
    const operationRecord = {
      type: OperationType.MarketWithdraw,
      targetType: TargetType.Market,
      targetId: marketId,
      chain,
      amount: operationAmount,
      symbol: collateralInfo.symbol,
    };

    printDebug({
      action: "building_withdraw",
      market: marketId,
      chain,
      collateral: collateralInfo.symbol,
      amount: args.amount,
      withdrawAll: args.withdrawAll,
      currentCollateral: userData.collateral.toFixed(8),
      withdrawable: userData.withdrawable.toFixed(8),
    });

    // 3. Build withdraw steps
    const steps = ensureStepsGenerated(
      await sdk.buildWithdrawParams({
        chainId,
        marketId,
        assets,
        withdrawAll: args.withdrawAll,
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
      // 6. Re-query position on-chain after successful withdraw
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
        collateral: collateralInfo.symbol,
        withdrawn: operationAmount,
        txHash: lastResult.txHash,
        explorer: lastResult.explorer,
        position: buildMarketPositionPayload(mappedPosition, {
          withdrawable: newUserData.withdrawable?.toFixed(8) || "0",
          remainingCollateral: mappedPosition.collateral !== "0",
        }),
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
        insufficientReason: "exceeds_withdrawable",
        insufficientMessage: "Withdraw amount exceeds available withdrawable collateral",
      })
    );

    if (operationContext) {
      recordOperation(
        {
          type: OperationType.MarketWithdraw,
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
