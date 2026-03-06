/**
 * Lista API/SDK client for vault, market and holdings queries.
 */

import { Decimal } from "@lista-dao/moolah-lending-sdk";
import type { Address } from "viem";
import { getSDK } from "./sdk.js";
import { getChainId, getRpcConfig } from "./config.js";
import type { MarketUserData, VaultInfo, VaultUserData } from "./types.js";
import { normalizeHoldingChain } from "./utils/validators.js";
import { mapMarketUserPosition, mapVaultUserPosition } from "./utils/position.js";
import type {
  ApiMarketHoldingItem,
  ApiMarketItem,
  ApiMarketPosition,
  ApiUserPositions,
  VaultListQuery,
  MarketListQuery,
  ApiVaultHoldingItem,
  ApiVaultItem,
  ApiVaultPosition,
} from "./types/lista-api.js";

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Get concurrency settings for vault onchain queries (with env override)
 */
function getVaultConcurrency(chain: string): number {
  const { vaultConcurrency } = getRpcConfig(chain);
  const envValue = process.env.LISTA_VAULT_ONCHAIN_CONCURRENCY;
  if (envValue) return parseIntEnv(envValue, vaultConcurrency);
  return vaultConcurrency;
}

/**
 * Get concurrency settings for market onchain queries (with env override)
 */
function getMarketConcurrency(chain: string): number {
  const { marketConcurrency } = getRpcConfig(chain);
  const envValue = process.env.LISTA_MARKET_ONCHAIN_CONCURRENCY;
  if (envValue) return parseIntEnv(envValue, marketConcurrency);
  return marketConcurrency;
}

/**
 * Get timeout for individual onchain items (with env override)
 */
function getItemTimeout(chain: string): number {
  const { itemTimeout } = getRpcConfig(chain);
  const envValue = process.env.LISTA_ONCHAIN_ITEM_TIMEOUT_MS;
  if (envValue) return parseIntEnv(envValue, itemTimeout);
  return itemTimeout;
}

/**
 * Get total budget for one holdings query (with env override)
 */
function getTotalBudget(chain: string): number {
  const { totalBudget } = getRpcConfig(chain);
  const envValue = process.env.LISTA_ONCHAIN_TOTAL_BUDGET_MS;
  if (envValue) return parseIntEnv(envValue, totalBudget);
  return totalBudget;
}

async function withRpcGuard<T>(
  operation: () => Promise<T>,
  chain: string,
  label: string
): Promise<T> {
  const itemTimeout = getItemTimeout(chain);
  return withTimeout(operation(), itemTimeout, label);
}

function toApiChainFilter(
  chain: string | string[],
  sdk: ReturnType<typeof getSDK>
): string | string[] {
  const toApiChain = (chainValue: string): string => {
    const normalized = chainValue.trim().toLowerCase();
    if (normalized === "bsc" || normalized === "ethereum") return normalized;
    if (normalized === "eth") return "ethereum";
    return sdk.getApiChain(getChainId(chainValue));
  };

  if (Array.isArray(chain)) {
    return chain.map(toApiChain);
  }
  return toApiChain(chain);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label}_timeout_${timeoutMs}ms`));
      }, timeoutMs);
      promise.then(resolve).catch(reject);
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const safeConcurrency = Math.max(
    1,
    Math.min(items.length, Number.isFinite(concurrency) ? concurrency : 1)
  );
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}

async function mapByChainWithConcurrency<T, R>(
  items: T[],
  resolveChain: (item: T) => string,
  resolveConcurrency: (chain: string) => number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const buckets = new Map<string, Array<{ item: T; index: number }>>();
  items.forEach((item, index) => {
    const chain = resolveChain(item);
    const bucket = buckets.get(chain);
    if (bucket) {
      bucket.push({ item, index });
      return;
    }
    buckets.set(chain, [{ item, index }]);
  });

  const results = new Array<R | undefined>(items.length);
  await Promise.all(
    Array.from(buckets.entries()).map(async ([chain, bucketItems]) => {
      const concurrency = resolveConcurrency(chain);
      const mapped = await mapWithConcurrency(
        bucketItems,
        concurrency,
        async ({ item, index }) => ({
          index,
          value: await mapper(item, index),
        })
      );
      mapped.forEach(({ index, value }) => {
        results[index] = value;
      });
    })
  );

  return results.map((item, index) => {
    if (item === undefined) {
      throw new Error(`internal_missing_result_${index}`);
    }
    return item;
  });
}

function toAddress(value: string): Address {
  return value as Address;
}

function sortByNumericDesc<T>(items: T[], getValue: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const aValue = Number.parseFloat(getValue(a));
    const bValue = Number.parseFloat(getValue(b));
    if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return 0;
    if (!Number.isFinite(aValue)) return 1;
    if (!Number.isFinite(bValue)) return -1;
    return bValue - aValue;
  });
}

function safeNormalizeHoldingChain(chain: string): string {
  try {
    return normalizeHoldingChain(chain);
  } catch {
    return chain;
  }
}

function mapVaultErrorPosition(
  holding: ApiVaultHoldingItem,
  chain: string,
  error: string
): ApiVaultPosition {
  return {
    kind: "vault",
    vaultAddress: holding.address,
    vaultName: holding.name,
    curator: holding.curator,
    apy: holding.apy,
    emissionApy: holding.emissionApy,
    chain,
    assetSymbol: "UNKNOWN",
    assetPrice: holding.assetPrice || "0",
    walletBalance: "0",
    deposited: "0",
    depositedUsd: "0",
    shares: "0",
    hasPosition: false,
    error,
  };
}

function mapMarketErrorPosition(
  holding: ApiMarketHoldingItem,
  chain: string,
  error: string
): ApiMarketPosition {
  const isSmartLending = holding.zone === 3;
  const isFixedTerm = holding.termType === 1;
  return {
    kind: "market",
    marketId: holding.marketId,
    chain,
    zone: holding.zone,
    termType: holding.termType,
    isSmartLending,
    isFixedTerm,
    isActionable: !isSmartLending && !isFixedTerm,
    broker: holding.broker || undefined,
    collateralSymbol: holding.collateralSymbol,
    collateralAddress: holding.collateralToken,
    collateralPrice: holding.collateralPrice,
    loanSymbol: holding.loanSymbol,
    loanAddress: holding.loanToken,
    loanPrice: holding.loanPrice,
    supplyApy: holding.supplyApy,
    borrowRate: "0",
    collateral: "0",
    collateralUsd: "0",
    borrowed: "0",
    borrowedUsd: "0",
    ltv: "0",
    lltv: holding.zone === 3 ? "0.909" : "0",
    health: "0",
    liquidationPriceRate: "0",
    walletCollateralBalance: "0",
    walletLoanBalance: "0",
    isWhitelisted: false,
    error,
  };
}

/**
 * Fetch all vaults from API
 */
export async function fetchVaults(
  query: VaultListQuery = {}
): Promise<ApiVaultItem[]> {
  const {
    chain = "eip155:56",
    page = 1,
    pageSize = 100,
    sort,
    order,
    zone,
    keyword,
    assets,
    curators,
  } = query;
  const sdk = getSDK();
  const apiChain = toApiChainFilter(chain, sdk);
  const data = await sdk.getVaultList({
    chain: apiChain,
    page,
    pageSize,
    sort,
    order,
    zone,
    keyword,
    assets,
    curators,
  });

  return data.list || [];
}

/**
 * Fetch markets from API via SDK
 */
export async function fetchMarkets(
  query: MarketListQuery = {}
): Promise<ApiMarketItem[]> {
  const {
    chain = "eip155:56",
    page = 1,
    pageSize = 100,
    sort = "liquidity", // API requires sort parameter
    order = "desc", // API requires order parameter
    zone,
    keyword,
    loans,
    collaterals,
    termType,
    smartLendingChecked = true, // Required for API to work
  } = query;
  const sdk = getSDK();
  const apiChain = toApiChainFilter(chain, sdk);
  const data = await sdk.getMarketList({
    chain: apiChain,
    page,
    pageSize,
    sort,
    order,
    zone,
    keyword,
    loans,
    collaterals,
    termType,
    smartLendingChecked,
  });

  return data.list || [];
}

/**
 * Fetch user vault positions with on-chain balances.
 * Formula aligns with lista-mono userDepositsAtom:
 * depositUsd = locked * assetPrice
 */
export async function fetchVaultPositions(
  userAddress: string
): Promise<ApiVaultPosition[]> {
  const sdk = getSDK();
  const data = await sdk.getHoldings({
    userAddress: toAddress(userAddress),
    type: "vault",
  });

  const holdings: ApiVaultHoldingItem[] = data.objs || [];
  const chains = Array.from(
    new Set(holdings.map((holding) => safeNormalizeHoldingChain(holding.chain)))
  );
  const chainDeadlines = new Map(
    chains.map((chain) => [chain, Date.now() + getTotalBudget(chain)])
  );
  const fallbackDeadline = Date.now() + getTotalBudget("eip155:56");

  const positions = await mapByChainWithConcurrency(
    holdings,
    (holding) => safeNormalizeHoldingChain(holding.chain),
    getVaultConcurrency,
    async (h): Promise<ApiVaultPosition> => {
      let chain = safeNormalizeHoldingChain(h.chain);
      const chainDeadline = chainDeadlines.get(chain) ?? fallbackDeadline;
      if (Date.now() > chainDeadline) {
        return mapVaultErrorPosition(h, chain, "skipped_onchain_due_to_time_budget");
      }
      try {
        chain = normalizeHoldingChain(h.chain);
        const chainId = getChainId(chain);
        const vaultAddress = toAddress(h.address);
        const walletAddress = toAddress(userAddress);
        const vaultInfo = await withRpcGuard<VaultInfo>(
          () => sdk.getVaultInfo(chainId, vaultAddress),
          chain,
          "getVaultInfo"
        );
        const userData = await withRpcGuard<VaultUserData>(
          () => sdk.getVaultUserData(chainId, vaultAddress, walletAddress, vaultInfo),
          chain,
          "getVaultUserData"
        );
        const mapped = mapVaultUserPosition(userData);
        const depositedUsd = userData.locked
          .mul(Decimal.parse(h.assetPrice || 0))
          .toFixed(8);

        return {
          kind: "vault",
          vaultAddress: h.address,
          vaultName: h.name,
          curator: h.curator,
          apy: h.apy,
          emissionApy: h.emissionApy,
          chain,
          assetSymbol: vaultInfo.assetInfo.symbol,
          assetPrice: h.assetPrice,
          walletBalance: mapped.walletBalance,
          deposited: mapped.assets,
          depositedUsd,
          shares: mapped.shares,
          hasPosition: mapped.hasPosition,
        };
      } catch (err) {
        const message = (err as Error).message || String(err);
        return mapVaultErrorPosition(h, chain, message);
      }
    }
  );

  return sortByNumericDesc(positions, (item) => item.depositedUsd);
}

/**
 * Fetch user market positions with on-chain balances.
 * Formula aligns with lista-mono userLoansAtom:
 * - borrowedUsd = borrowed * loanPrice
 * - collateralUsd = collateral * collateralPrice
 * - health = LLTV / LTV (if LTV > 0; else 100)
 */
export async function fetchMarketPositions(
  userAddress: string
): Promise<ApiMarketPosition[]> {
  const sdk = getSDK();
  const data = await sdk.getHoldings({
    userAddress: toAddress(userAddress),
    type: "market",
  });

  const holdings: ApiMarketHoldingItem[] = data.objs || [];
  const chains = Array.from(
    new Set(holdings.map((holding) => safeNormalizeHoldingChain(holding.chain)))
  );
  const chainDeadlines = new Map(
    chains.map((chain) => [chain, Date.now() + getTotalBudget(chain)])
  );
  const fallbackDeadline = Date.now() + getTotalBudget("eip155:56");

  const markets = await mapByChainWithConcurrency(
    holdings,
    (holding) => safeNormalizeHoldingChain(holding.chain),
    getMarketConcurrency,
    async (h: ApiMarketHoldingItem): Promise<ApiMarketPosition> => {
      let chain = safeNormalizeHoldingChain(h.chain);
      const isSmartLending = h.zone === 3;
      const isFixedTerm = h.termType === 1;
      const isActionable = !isSmartLending && !isFixedTerm;
      const chainDeadline = chainDeadlines.get(chain) ?? fallbackDeadline;
      if (Date.now() > chainDeadline) {
        return mapMarketErrorPosition(h, chain, "skipped_onchain_due_to_time_budget");
      }
      try {
        chain = normalizeHoldingChain(h.chain);
        const chainId = getChainId(chain);
        const marketId = toAddress(h.marketId);
        const walletAddress = toAddress(userAddress);
        const userData = await withRpcGuard<MarketUserData>(
          () => sdk.getMarketUserData(chainId, marketId, walletAddress),
          chain,
          "getMarketUserData"
        );
        const mapped = mapMarketUserPosition(userData, {
          collateralPrice: h.collateralPrice,
          loanPrice: h.loanPrice,
        });

        return {
          kind: "market",
          marketId: h.marketId,
          chain,
          zone: h.zone,
          termType: h.termType,
          isSmartLending,
          isFixedTerm,
          isActionable,
          broker: h.broker || undefined,
          collateralSymbol: h.collateralSymbol,
          collateralAddress: h.collateralToken,
          collateralPrice: h.collateralPrice,
          loanSymbol: h.loanSymbol,
          loanAddress: h.loanToken,
          loanPrice: h.loanPrice,
          supplyApy: h.supplyApy,
          borrowRate: mapped.borrowRate,
          collateral: mapped.collateral,
          collateralUsd: mapped.collateralUsd,
          borrowed: mapped.borrowed,
          borrowedUsd: mapped.borrowedUsd,
          ltv: mapped.ltv,
          lltv: mapped.lltv,
          health: mapped.health,
          liquidationPriceRate: mapped.liquidationPriceRate,
          walletCollateralBalance: mapped.walletCollateralBalance,
          walletLoanBalance: mapped.walletLoanBalance,
          isWhitelisted: mapped.isWhitelisted,
        };
      } catch (err) {
        const message = (err as Error).message || String(err);
        return mapMarketErrorPosition(h, chain, message);
      }
    }
  );

  return sortByNumericDesc(markets, (item) => item.borrowedUsd);
}

/**
 * Fetch all user positions (vault + market) in one call sequence.
 */
export async function fetchUserPositions(
  userAddress: string
): Promise<ApiUserPositions> {
  const [vaults, markets] = await Promise.all([
    fetchVaultPositions(userAddress),
    fetchMarketPositions(userAddress),
  ]);

  return {
    vaults,
    markets,
  };
}
