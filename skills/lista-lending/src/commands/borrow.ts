/**
 * Market borrow command
 * Borrow loan tokens from a Lista Lending market
 *
 * Features:
 * - --simulate: Show max borrowable without executing
 * - --amount: Borrow specific amount
 * - --simulate-supply: Show max borrowable AFTER a hypothetical supply
 */

import type { StepParam } from "@lista-dao/moolah-lending-sdk";
import { getSDK, getChainId, SUPPORTED_CHAINS } from "../sdk.js";
import { executeSteps } from "../executor.js";
import {
  loadContext,
  OperationStatus,
  OperationType,
  TargetType,
} from "../context.js";
import type { ParsedArgs } from "../types.js";
import { mapMarketUserPosition } from "../utils/position.js";
import { InputValidationError, parsePositiveUnits } from "../utils/validators.js";
import { resolveMarketContext } from "./shared/context.js";
import { printJson, printDebug, exitWithCode } from "./shared/output.js";
import {
  buildExecutionFailureOutput,
  buildPendingExecutionOutput,
  ensureStepsGenerated,
} from "./shared/tx.js";
import { recordOperation } from "./shared/operation.js";
import { buildSdkErrorOutput } from "./shared/errors.js";
import { buildMarketPositionPayload } from "./shared/market.js";

interface BorrowOperationContext {
  marketId: string;
  chain: string;
  amount: string;
}

interface BorrowRuntime {
  sdk: ReturnType<typeof getSDK>;
  marketId: string;
  chain: string;
  chainId: number;
  walletAddress: string;
  walletTopic: string | null;
  marketInfo: Awaited<ReturnType<ReturnType<typeof getSDK>["getWriteConfig"]>>;
  userData: Awaited<ReturnType<ReturnType<typeof getSDK>["getMarketUserData"]>>;
}

export async function cmdBorrow(args: ParsedArgs): Promise<void> {
  const ctx = loadContext();
  let operationContext: BorrowOperationContext | undefined;

  try {
    if (!args.simulate && !args.amount) {
      throw new InputValidationError("--amount or --simulate required");
    }

    const { marketId, chain, walletAddress, walletTopic } = resolveMarketContext(
      args,
      ctx,
      {
        supportedChains: SUPPORTED_CHAINS,
        requireWalletTopic: !args.simulate,
      }
    );

    const chainId = getChainId(chain);
    const sdk = getSDK();

    printDebug({ action: "fetching_market_info", market: marketId, chain });
    const marketInfo = await sdk.getWriteConfig(chainId, marketId);
    const userData = await sdk.getMarketUserData(chainId, marketId, walletAddress);

    const runtime: BorrowRuntime = {
      sdk,
      marketId,
      chain,
      chainId,
      walletAddress,
      walletTopic,
      marketInfo,
      userData,
    };

    if (args.simulate) {
      handleBorrowSimulation(args, runtime);
      exitWithCode(0);
    }

    const amount = args.amount as string;
    operationContext = {
      marketId,
      chain,
      amount,
    };
    await executeBorrowTransaction(runtime, amount);
    exitWithCode(0);
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
        insufficientReason: "insufficient_collateral",
        insufficientMessage: "Borrow amount exceeds available collateral capacity",
      })
    );

    if (operationContext) {
      recordOperation(
        {
          type: OperationType.Borrow,
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

function handleBorrowSimulation(
  args: ParsedArgs,
  runtime: BorrowRuntime
): void {
  const { marketId, chain, marketInfo, userData } = runtime;
  const currentLoanable = userData.loanable;
  let afterSupplyLoanable = currentLoanable;

  if (args.simulateSupply) {
    const supplyAmount = parseFloat(args.simulateSupply);
    if (Number.isNaN(supplyAmount) || supplyAmount <= 0) {
      throw new InputValidationError("--simulate-supply must be a positive number");
    }
    afterSupplyLoanable = userData._computeLoanable(supplyAmount);
  }

  const mappedPosition = mapMarketUserPosition(userData, {
    collateralPrice: 0,
    loanPrice: 0,
  });
  const safeBorrow = afterSupplyLoanable.mul(0.95);

  printJson({
    status: "success",
    action: "simulate",
    market: marketId,
    chain,
    collateral: {
      symbol: marketInfo.collateralInfo.symbol,
      deposited: mappedPosition.collateral,
      walletBalance: mappedPosition.walletCollateralBalance,
    },
    loan: {
      symbol: marketInfo.loanInfo.symbol,
      borrowed: mappedPosition.borrowed,
      walletBalance: mappedPosition.walletLoanBalance,
    },
    position: {
      ltv: mappedPosition.ltv,
      lltv: mappedPosition.lltv,
      health: mappedPosition.health,
    },
    borrowable: {
      max: currentLoanable.toFixed(8),
      safe: safeBorrow.toFixed(8),
      afterSupply: args.simulateSupply
        ? {
            supplyAmount: args.simulateSupply,
            maxBorrow: afterSupplyLoanable.toFixed(8),
            safeBorrow: afterSupplyLoanable.mul(0.95).toFixed(8),
          }
        : undefined,
    },
    hint: currentLoanable.gt(0)
      ? `You can safely borrow up to ${safeBorrow.toFixed(4)} ${marketInfo.loanInfo.symbol} (95% of max: ${currentLoanable.toFixed(4)})`
      : "No borrowing capacity. Supply collateral first.",
  });
}

async function executeBorrowTransaction(
  runtime: BorrowRuntime,
  amount: string
): Promise<void> {
  const { marketId, chain, chainId, walletAddress, walletTopic, marketInfo, userData } =
    runtime;
  const loanInfo = marketInfo.loanInfo;

  const assets = parsePositiveUnits(amount, loanInfo.decimals, "amount");
  const requestedAmount = parseFloat(amount);
  if (userData.loanable.lt(requestedAmount)) {
    printJson({
      status: "error",
      reason: "insufficient_collateral",
      message: `Cannot borrow ${amount} ${loanInfo.symbol}. Max borrowable: ${userData.loanable.toFixed(4)} ${loanInfo.symbol}`,
      maxBorrowable: userData.loanable.toFixed(8),
      hint: "Supply more collateral or reduce borrow amount",
    });
    exitWithCode(1);
  }

  const operationRecord = {
    type: OperationType.Borrow,
    targetType: TargetType.Market,
    targetId: marketId,
    chain,
    amount,
    symbol: loanInfo.symbol,
  };

  printDebug({
    action: "building_borrow",
    market: marketId,
    chain,
    loan: loanInfo.symbol,
    amount,
    decimals: loanInfo.decimals,
    rawAmount: assets.toString(),
  });

  const { sdk } = runtime;
  const steps = ensureStepsGenerated(
    await sdk.buildBorrowParams({
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

  const results = await executeSteps(steps, {
    topic: walletTopic!,
    chain,
  });
  const lastResult = results[results.length - 1];

  if (lastResult.status === "pending") {
    recordOperation(operationRecord, OperationStatus.Pending, lastResult.txHash);
    printJson(buildPendingExecutionOutput(lastResult, results, steps.length));
    exitWithCode(0);
  }

  if (lastResult.status === "sent") {
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
      lltv: mappedPosition.lltv,
      health: mappedPosition.health,
    });

    recordOperation(operationRecord, OperationStatus.Success, lastResult.txHash);
    printJson({
      status: "success",
      market: marketId,
      chain,
      loan: loanInfo.symbol,
      borrowed: amount,
      txHash: lastResult.txHash,
      explorer: lastResult.explorer,
      position: buildMarketPositionPayload(mappedPosition, {
        loanable: newUserData.loanable?.toFixed(8) || "0",
      }),
      warning:
        parseFloat(mappedPosition.health) < 1.2
          ? "Health factor is low. Consider repaying some debt to avoid liquidation."
          : undefined,
    });
    return;
  }

  recordOperation(operationRecord, OperationStatus.Failed);
  printJson(buildExecutionFailureOutput(results, steps.length));
  exitWithCode(1);
}
