/**
 * Vault withdraw command
 * Withdraws assets from a Lista Lending vault
 * After success, re-queries position on-chain
 */

import { getSDK, getChainId, SUPPORTED_CHAINS } from "../sdk.js";
import { executeSteps } from "../executor.js";
import {
  loadContext,
  OperationStatus,
  OperationType,
  TargetType,
  updatePosition,
  type UserPosition,
} from "../context.js";
import type { ParsedArgs, StepParam } from "../types.js";
import { mapVaultUserPosition } from "../utils/position.js";
import { InputValidationError, parsePositiveUnits } from "../utils/validators.js";
import {
  requireAmountOrAll,
  resolveVaultContext,
} from "./shared/context.js";
import { printJson, printDebug, exitWithCode } from "./shared/output.js";
import {
  buildExecutionFailureOutput,
  buildPendingExecutionOutput,
  ensureStepsGenerated,
} from "./shared/tx.js";
import { recordOperation } from "./shared/operation.js";
import { buildSdkErrorOutput } from "./shared/errors.js";

export async function cmdWithdraw(args: ParsedArgs): Promise<void> {
  const ctx = loadContext();
  let operationContext:
    | {
        vaultAddress: string;
        chain: string;
        amount: string;
      }
    | undefined;

  try {
    requireAmountOrAll(args.amount, args.withdrawAll, "--withdraw-all");
    const { vaultAddress, chain, walletAddress, walletTopic } = resolveVaultContext(
      args,
      ctx,
      { supportedChains: SUPPORTED_CHAINS }
    );
    const chainId = getChainId(chain);
    const sdk = getSDK();

    // 1. Get vault info
    printDebug({ action: "fetching_vault_info", vault: vaultAddress, chain });
    const vaultInfo = await sdk.getVaultInfo(chainId, vaultAddress);

    // 2. Get user data (required for withdraw-all)
    printDebug({ action: "fetching_user_data", wallet: walletAddress });
    const userData = await sdk.getVaultUserData(
      chainId,
      vaultAddress,
      walletAddress,
      vaultInfo
    );

    if (args.withdrawAll && (!userData.shares || userData.shares.isZero())) {
      printJson({
        status: "error",
        reason: "no_position",
        message: "No shares to withdraw from this vault",
      });
      exitWithCode(1);
    }

    // 3. Parse amount (SDK uses assetInfo)
    const assetInfo = vaultInfo.assetInfo;
    const decimals = assetInfo.decimals;
    let assets: bigint | undefined;

    if (args.amount) {
      assets = parsePositiveUnits(args.amount, decimals, "amount");
    }

    const operationAmount = args.amount || "all";
    operationContext = {
      vaultAddress,
      chain,
      amount: operationAmount,
    };
    const operationRecord = {
      type: OperationType.Withdraw,
      targetType: TargetType.Vault,
      targetId: vaultAddress,
      chain,
      amount: operationAmount,
      symbol: assetInfo.symbol,
    };

    printDebug({
      action: "building_withdraw",
      vault: vaultAddress,
      chain,
      asset: assetInfo.symbol,
      amount: args.amount,
      withdrawAll: args.withdrawAll,
    });

    // 4. Build withdraw steps
    const steps = ensureStepsGenerated(
      await sdk.buildVaultWithdrawParams({
        chainId,
        vaultAddress,
        assets,
        withdrawAll: args.withdrawAll,
        walletAddress,
        vaultInfo,
        userData,
      })
    );

    printDebug({
      action: "executing_steps",
      count: steps.length,
      types: steps.map((s: StepParam) => s.step),
    });

    // 5. Execute steps via lista-wallet-connect
    const results = await executeSteps(steps, {
      topic: walletTopic!,
      chain,
    });

    // 6. Check result
    const lastResult = results[results.length - 1];

    if (lastResult.status === "pending") {
      recordOperation(operationRecord, OperationStatus.Pending, lastResult.txHash);

      printJson(buildPendingExecutionOutput(lastResult, results, steps.length));
      exitWithCode(0);
    }

    if (lastResult.status === "sent") {
      // 7. Re-query position on-chain after successful withdraw
      printDebug({ action: "refreshing_position" });

      // Re-fetch vault info to get fresh state after withdraw
      const freshVaultInfo = await sdk.getVaultInfo(chainId, vaultAddress);
      const newUserData = await sdk.getVaultUserData(
        chainId,
        vaultAddress,
        walletAddress,
        freshVaultInfo
      );

      const mappedPosition = mapVaultUserPosition(newUserData);

      printDebug({
        action: "position_debug",
        userShares: mappedPosition.shares,
        vaultBalance: mappedPosition.assets,
        walletBalance: mappedPosition.walletBalance,
        totalAssets: freshVaultInfo.totalAssets?.toFixed(8),
        totalSupply: freshVaultInfo.totalSupply?.toFixed(8),
      });

      const newPosition: UserPosition = mappedPosition.position;

      // Update context if this is the selected vault
      if (ctx.selectedVault?.address === vaultAddress) {
        updatePosition(newPosition);
      }

      recordOperation(operationRecord, OperationStatus.Success, lastResult.txHash);

      printJson({
        status: "success",
        vault: vaultAddress,
        chain,
        asset: assetInfo.symbol,
        withdrawn: operationAmount,
        txHash: lastResult.txHash,
        explorer: lastResult.explorer,
        balance: mappedPosition.walletBalance,
        vaultBalance: newPosition.assets,
        position: {
          balance: newPosition.assets,
          assets: newPosition.assets,
          walletBalance: mappedPosition.walletBalance,
          assetSymbol: assetInfo.symbol,
          remaining: newPosition.assets !== "0",
        },
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
        targetType: TargetType.Vault,
        targetId: operationContext?.vaultAddress,
        insufficientReason: "insufficient_assets",
        insufficientMessage: "Withdrawal amount exceeds your vault balance",
        insufficientKeywords: ["insufficient", "exceeds balance"],
      })
    );

    if (operationContext) {
      recordOperation(
        {
          type: OperationType.Withdraw,
          targetType: TargetType.Vault,
          targetId: operationContext.vaultAddress,
          chain: operationContext.chain,
          amount: operationContext.amount,
        },
        OperationStatus.Failed
      );
    }
    exitWithCode(1);
  }
}
