/**
 * Vault deposit command
 * Deposits assets into a Lista Lending vault
 * After success, re-queries position on-chain
 */

import type { ParsedArgs, StepParam } from "../types.js";
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
import { mapVaultUserPosition } from "../utils/position.js";
import { InputValidationError, parsePositiveUnits } from "../utils/validators.js";
import {
  resolveVaultContext,
  requireAmount,
} from "./shared/context.js";
import { printJson, printDebug, exitWithCode } from "./shared/output.js";
import {
  buildExecutionFailureOutput,
  buildPendingExecutionOutput,
  ensureStepsGenerated,
} from "./shared/tx.js";
import { recordOperation } from "./shared/operation.js";
import { buildSdkErrorOutput } from "./shared/errors.js";

export async function cmdDeposit(args: ParsedArgs): Promise<void> {
  const ctx = loadContext();
  let operationContext:
    | {
        vaultAddress: string;
        chain: string;
        amount: string;
      }
    | undefined;

  try {
    const amount = requireAmount(args.amount);
    const { vaultAddress, chain, walletAddress, walletTopic } = resolveVaultContext(
      args,
      ctx,
      { supportedChains: SUPPORTED_CHAINS }
    );
    const chainId = getChainId(chain);
    const sdk = getSDK();
    operationContext = {
      vaultAddress,
      chain,
      amount,
    };

    // 1. Get vault info to determine asset decimals
    printDebug({ action: "fetching_vault_info", vault: vaultAddress, chain });
    const vaultInfo = await sdk.getVaultInfo(chainId, vaultAddress);

    // 2. Parse amount with correct decimals (SDK uses assetInfo)
    const assetInfo = vaultInfo.assetInfo;
    const decimals = assetInfo.decimals;
    const assets = parsePositiveUnits(amount, decimals, "amount");
    const operationRecord = {
      type: OperationType.Deposit,
      targetType: TargetType.Vault,
      targetId: vaultAddress,
      chain,
      amount,
      symbol: assetInfo.symbol,
    };

    printDebug({
      action: "building_deposit",
      vault: vaultAddress,
      chain,
      asset: assetInfo.symbol,
      amount,
      decimals,
      rawAmount: assets.toString(),
    });

    // 3. Build deposit steps (may include approve step)
    const steps = ensureStepsGenerated(
      await sdk.buildVaultDepositParams({
        chainId,
        vaultAddress,
        assets,
        walletAddress,
        vaultInfo,
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
      // 6. Re-query position on-chain after successful deposit
      printDebug({ action: "refreshing_position" });

      // Re-fetch vault info to get fresh state after deposit
      const freshVaultInfo = await sdk.getVaultInfo(chainId, vaultAddress);
      const userData = await sdk.getVaultUserData(
        chainId,
        vaultAddress,
        walletAddress,
        freshVaultInfo
      );

      const mappedPosition = mapVaultUserPosition(userData);

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
        deposited: amount,
        steps: results.length,
        txHash: lastResult.txHash,
        explorer: lastResult.explorer,
        balance: mappedPosition.walletBalance,
        vaultBalance: newPosition.assets,
        position: {
          balance: newPosition.assets,
          assets: newPosition.assets,
          walletBalance: mappedPosition.walletBalance,
          assetSymbol: assetInfo.symbol,
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
      })
    );

    if (operationContext) {
      recordOperation(
        {
          type: OperationType.Deposit,
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
