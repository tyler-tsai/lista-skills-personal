/**
 * Select command - select a vault or market and persist context
 * Shows user's balance and position after selection
 */

import type { Address } from "viem";
import { getSDK, getChainId, SUPPORTED_CHAINS } from "../sdk.js";
import {
  OperationStatus,
  OperationType,
  TargetType,
  setSelectedVault,
  setSelectedMarket,
  loadContext,
  clearContext,
  setLastOperation,
  type SelectedVault,
  type SelectedMarket,
} from "../context.js";
import { mapVaultUserPosition, mapMarketUserPosition } from "../utils/position.js";
import {
  isSupportedChain,
  isValidAddress,
  isValidMarketId,
} from "../utils/validators.js";

// Zone constants for filtering
const ZONE_SMART_LENDING = 3;

export interface SelectArgs {
  vault?: string;
  market?: string;
  chain?: string;
  walletTopic?: string;
  walletAddress?: string;
  clear?: boolean;
  show?: boolean;
}

export async function cmdSelect(args: SelectArgs): Promise<void> {
  // Clear context
  if (args.clear) {
    clearContext();
    console.log(
      JSON.stringify({
        status: "success",
        action: "cleared",
        message: "Selection cleared",
      })
    );
    return;
  }

  // Show current context
  if (args.show) {
    const ctx = loadContext();
    if (!ctx.selectedVault && !ctx.selectedMarket) {
      console.log(
        JSON.stringify({
          status: "success",
          selected: null,
          selectedMarket: null,
          message: "No position selected. Use 'select --vault <address>' or 'select --market <id>'.",
        })
      );
    } else {
      const position = ctx.selectedVault && ctx.userPosition
        ? {
            assets: ctx.userPosition.assets,
            balance: ctx.userPosition.assets,
            assetsUsd: ctx.userPosition.assetsUsd,
          }
        : null;

      console.log(
        JSON.stringify({
          status: "success",
          selected: ctx.selectedVault,
          selectedMarket: ctx.selectedMarket,
          userAddress: ctx.userAddress,
          walletTopic: ctx.walletTopic,
          position,
          lastOperation: ctx.lastOperation,
          lastFilters: ctx.lastFilters,
          lastUpdated: ctx.lastUpdated,
        })
      );
    }
    return;
  }

  // Validate: need either vault or market
  if (!args.vault && !args.market) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: "--vault or --market required (or use --show to see current selection)",
      })
    );
    process.exit(1);
  }

  if (args.vault && args.market) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: "Cannot select both --vault and --market at the same time",
      })
    );
    process.exit(1);
  }

  // Select a market
  if (args.market) {
    await selectMarket(args);
    return;
  }

  // Select a vault (existing logic below)

  if (!args.walletTopic) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: "--wallet-topic required",
      })
    );
    process.exit(1);
  }

  if (!args.walletAddress) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: "--wallet-address required",
      })
    );
    process.exit(1);
  }

  const chain = args.chain || "eip155:56";

  if (!isSupportedChain(chain, SUPPORTED_CHAINS)) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: `Unsupported chain: ${chain}. Supported: ${SUPPORTED_CHAINS.join(", ")}`,
      })
    );
    process.exit(1);
  }

  // At this point args.vault is guaranteed to exist (checked above, and args.market returns early)
  if (!isValidAddress(args.vault!)) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: `Invalid vault address: ${args.vault}`,
      })
    );
    process.exit(1);
  }

  if (!isValidAddress(args.walletAddress!)) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: `Invalid wallet address: ${args.walletAddress}`,
      })
    );
    process.exit(1);
  }

  const vaultAddress: Address = args.vault;
  const walletAddress: Address = args.walletAddress;
  const chainId = getChainId(chain);

  try {
    const sdk = getSDK();

    // 1. Get vault info
    console.error(
      JSON.stringify({ action: "fetching_vault_info", vault: vaultAddress })
    );
    const vaultInfo = await sdk.getVaultInfo(chainId, vaultAddress);

    // 2. Get user position
    console.error(
      JSON.stringify({ action: "fetching_user_position", address: walletAddress })
    );
    const userData = await sdk.getVaultUserData(
      chainId,
      vaultAddress,
      walletAddress,
      vaultInfo
    );

    // 3. Format vault for storage (SDK uses assetInfo, not asset)
    const assetInfo = vaultInfo.assetInfo;
    const selectedVault: SelectedVault = {
      address: vaultAddress,
      name: `${assetInfo.symbol} Vault`,
      asset: {
        symbol: assetInfo.symbol,
        address: assetInfo.address,
        decimals: assetInfo.decimals,
      },
      chain,
    };

    const mappedPosition = mapVaultUserPosition(userData);

    // Debug: log raw values
    console.error(
      JSON.stringify({
        action: "position_debug",
        userShares: mappedPosition.shares,
        vaultBalance: mappedPosition.assets,
        walletBalance: mappedPosition.walletBalance,
        totalAssets: vaultInfo.totalAssets?.toFixed(8),
        totalSupply: vaultInfo.totalSupply?.toFixed(8),
      })
    );

    // 5. Save context
    setSelectedVault(
      selectedVault,
      walletAddress,
      args.walletTopic!,
      mappedPosition.position
    );

    setLastOperation({
      type: OperationType.SelectVault,
      targetType: TargetType.Vault,
      targetId: selectedVault.address,
      chain,
      status: OperationStatus.Success,
      at: new Date().toISOString(),
    });

    // 6. Output result
    console.log(
      JSON.stringify({
        status: "success",
        action: "selected",
        vault: selectedVault,
        userAddress: walletAddress,
        balance: mappedPosition.walletBalance,
        vaultBalance: mappedPosition.position.assets,
        position: {
          assets: mappedPosition.position.assets,
          balance: mappedPosition.position.assets,
          walletBalance: mappedPosition.walletBalance,
          assetSymbol: assetInfo.symbol,
          hasPosition: mappedPosition.hasPosition,
        },
        message: mappedPosition.hasPosition
          ? `Selected ${selectedVault.name}. You have ${mappedPosition.position.assets} ${assetInfo.symbol} deposited. Wallet balance: ${mappedPosition.walletBalance} ${assetInfo.symbol}.`
          : `Selected ${selectedVault.name}. No existing position.`,
      })
    );
  } catch (err) {
    const message = (err as Error).message || String(err);

    if (message.includes("vault not found") || message.includes("invalid")) {
      console.log(
        JSON.stringify({
          status: "error",
          reason: "invalid_vault",
          message: `Vault ${vaultAddress} not found or invalid on ${chain}`,
        })
      );
    } else {
      console.log(
        JSON.stringify({
          status: "error",
          reason: "sdk_error",
          message,
        })
      );
    }
    process.exit(1);
  }
}

/**
 * Select a market and persist context
 */
async function selectMarket(args: SelectArgs): Promise<void> {
  if (!args.walletTopic) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: "--wallet-topic required",
      })
    );
    process.exit(1);
  }

  if (!args.walletAddress) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: "--wallet-address required",
      })
    );
    process.exit(1);
  }

  const chain = args.chain || "eip155:56";

  if (!isSupportedChain(chain, SUPPORTED_CHAINS)) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: `Unsupported chain: ${chain}. Supported: ${SUPPORTED_CHAINS.join(", ")}`,
      })
    );
    process.exit(1);
  }

  if (!isValidMarketId(args.market!)) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: `Invalid market ID: ${args.market}`,
      })
    );
    process.exit(1);
  }

  if (!isValidAddress(args.walletAddress)) {
    console.log(
      JSON.stringify({
        status: "error",
        reason: `Invalid wallet address: ${args.walletAddress}`,
      })
    );
    process.exit(1);
  }

  const marketId: Address = args.market! as Address;
  const walletAddress: Address = args.walletAddress;
  const chainId = getChainId(chain);

  try {
    const sdk = getSDK();

    // 1. Get market extra info
    console.error(
      JSON.stringify({ action: "fetching_market_info", market: marketId })
    );
    const marketExtraInfo = await sdk.getMarketExtraInfo(chainId, marketId);

    // Check if it's a SmartLending market (zone=3)
    if (marketExtraInfo.zone === ZONE_SMART_LENDING) {
      console.log(
        JSON.stringify({
          status: "error",
          reason: "unsupported_market_type",
          message: "SmartLending markets are not supported. Use regular markets only.",
        })
      );
      process.exit(1);
    }

    // 2. Get user position
    console.error(
      JSON.stringify({ action: "fetching_user_position", address: walletAddress })
    );
    const userData = await sdk.getMarketUserData(chainId, marketId, walletAddress);

    // 3. Format market for storage
    const selectedMarket: SelectedMarket = {
      marketId,
      chain,
      collateralSymbol: userData.collateralInfo.symbol,
      loanSymbol: userData.loanInfo.symbol,
      zone: marketExtraInfo.zone,
    };

    // 4. Map position data
    // Note: We don't have prices here, so use 0 for USD values
    const mappedPosition = mapMarketUserPosition(userData, {
      collateralPrice: 0,
      loanPrice: 0,
    });

    // Debug: log raw values
    console.error(
      JSON.stringify({
        action: "position_debug",
        collateral: mappedPosition.collateral,
        borrowed: mappedPosition.borrowed,
        ltv: mappedPosition.ltv,
        lltv: mappedPosition.lltv,
        health: mappedPosition.health,
        loanable: userData.loanable?.toFixed(8),
        withdrawable: userData.withdrawable?.toFixed(8),
        walletCollateral: mappedPosition.walletCollateralBalance,
        walletLoan: mappedPosition.walletLoanBalance,
      })
    );

    // 5. Save context
    setSelectedMarket(selectedMarket, walletAddress, args.walletTopic!);

    setLastOperation({
      type: OperationType.SelectMarket,
      targetType: TargetType.Market,
      targetId: marketId,
      chain,
      status: OperationStatus.Success,
      at: new Date().toISOString(),
    });

    // 6. Output result
    console.log(
      JSON.stringify({
        status: "success",
        action: "selected",
        market: selectedMarket,
        userAddress: walletAddress,
        position: {
          collateral: mappedPosition.collateral,
          borrowed: mappedPosition.borrowed,
          ltv: mappedPosition.ltv,
          lltv: mappedPosition.lltv,
          health: mappedPosition.health,
          loanable: userData.loanable?.toFixed(8) || "0",
          withdrawable: userData.withdrawable?.toFixed(8) || "0",
          walletCollateralBalance: mappedPosition.walletCollateralBalance,
          walletLoanBalance: mappedPosition.walletLoanBalance,
          hasPosition: mappedPosition.hasPosition,
        },
        message: mappedPosition.hasPosition
          ? `Selected ${selectedMarket.collateralSymbol}/${selectedMarket.loanSymbol} market. Collateral: ${mappedPosition.collateral}, Borrowed: ${mappedPosition.borrowed}`
          : `Selected ${selectedMarket.collateralSymbol}/${selectedMarket.loanSymbol} market. No existing position.`,
      })
    );
  } catch (err) {
    const message = (err as Error).message || String(err);

    if (message.includes("market not found") || message.includes("invalid")) {
      console.log(
        JSON.stringify({
          status: "error",
          reason: "invalid_market",
          message: `Market ${marketId} not found or invalid on ${chain}`,
        })
      );
    } else {
      console.log(
        JSON.stringify({
          status: "error",
          reason: "sdk_error",
          message,
        })
      );
    }
    process.exit(1);
  }
}
