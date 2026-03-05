/**
 * Configuration storage for Lista Lending skill
 * Stores RPC URLs and other settings in ~/.agent-wallet/lending-config.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".agent-wallet");
const CONFIG_FILE = join(CONFIG_DIR, "lending-config.json");

// Default public RPC endpoints with fallbacks
export const DEFAULT_RPCS: Record<string, string[]> = {
  "eip155:56": [
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.binance.org",
    "https://bsc-dataseed2.binance.org",
  ],
  "eip155:1": [
    "https://eth.llamarpc.com",
    "https://cloudflare-eth.com",
    "https://rpc.ankr.com/eth",
  ],
};

// Chain ID mapping
export const CHAIN_IDS: Record<string, number> = {
  "eip155:56": 56,
  "eip155:1": 1,
};

export const SUPPORTED_CHAINS = ["eip155:56", "eip155:1"];

export interface LendingConfig {
  rpcUrls: Record<string, string>; // Custom RPC overrides
  defaultChain: string;
  debug: boolean;
}

const DEFAULT_CONFIG: LendingConfig = {
  rpcUrls: {},
  defaultChain: "eip155:56",
  debug: false,
};

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load config from disk
 */
export function loadConfig(): LendingConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(data) as Partial<LendingConfig>;
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        debug: parsed.debug === true,
      };
    }
  } catch {
    // Ignore errors, return default
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save config to disk
 */
export function saveConfig(config: LendingConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Get RPC URL for a chain (custom override > default)
 */
export function getRpcUrl(chain: string): string {
  const candidates = getRpcUrls(chain);
  if (candidates.length > 0) {
    return candidates[0];
  }

  throw new Error(`No RPC URL configured for chain: ${chain}`);
}

/**
 * Get all RPC URLs for a chain (for fallback)
 */
export function getRpcUrls(chain: string): string[] {
  const config = loadConfig();
  const result: string[] = [];
  const seen = new Set<string>();

  const addUrl = (value: string | undefined): void => {
    if (!value) return;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  // Custom override takes priority, but keep defaults as fallbacks.
  addUrl(config.rpcUrls[chain]);

  const defaults = DEFAULT_RPCS[chain] || [];
  for (const url of defaults) {
    addUrl(url);
  }

  return result;
}

/**
 * Set custom RPC URL for a chain
 */
export function setRpcUrl(chain: string, url: string): void {
  if (!SUPPORTED_CHAINS.includes(chain)) {
    throw new Error(
      `Unsupported chain: ${chain}. Supported: ${SUPPORTED_CHAINS.join(", ")}`
    );
  }

  const config = loadConfig();
  config.rpcUrls[chain] = url;
  saveConfig(config);
}

/**
 * Clear custom RPC URL (revert to default)
 */
export function clearRpcUrl(chain: string): void {
  const config = loadConfig();
  delete config.rpcUrls[chain];
  saveConfig(config);
}

/**
 * Set debug mode for command-level printDebug output.
 */
export function setDebug(enabled: boolean): void {
  const config = loadConfig();
  config.debug = enabled;
  saveConfig(config);
}

/**
 * Get persisted debug mode from config.
 */
export function isDebugEnabled(): boolean {
  return loadConfig().debug === true;
}

/**
 * Get chain ID number from CAIP-2 format
 */
export function getChainId(chain: string): number {
  const chainId = CHAIN_IDS[chain];
  if (!chainId) {
    throw new Error(
      `Unknown chain: ${chain}. Supported: ${SUPPORTED_CHAINS.join(", ")}`
    );
  }
  return chainId;
}
