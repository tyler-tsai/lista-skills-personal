/**
 * SDK initialization for Lista Lending
 * Supports BSC and Ethereum with configurable RPC URLs
 */

import { MoolahSDK } from "@lista-dao/moolah-lending-sdk";
import { createPublicClient, http } from "viem";
import { bsc, mainnet, type Chain } from "viem/chains";
import { getRpcUrl, getChainId, SUPPORTED_CHAINS } from "./config.js";

let sdkInstance: MoolahSDK | null = null;
let sdkRpcUrls: Record<string, string> | null = null;

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const RPC_TIMEOUT_MS = parseIntEnv(process.env.LISTA_RPC_TIMEOUT_MS, 8000);
const RPC_RETRY_COUNT = parseIntEnv(process.env.LISTA_RPC_RETRY_COUNT, 1);
const RPC_RETRY_DELAY_MS = parseIntEnv(
  process.env.LISTA_RPC_RETRY_DELAY_MS,
  500
);

const CHAIN_ID_TO_VIEM_CHAIN: Record<string, Chain> = {
  "1": mainnet,
  "56": bsc,
};

/**
 * Build RPC URLs config for SDK
 */
function buildRpcConfig(): Record<string, string> {
  const config: Record<string, string> = {};

  for (const chain of SUPPORTED_CHAINS) {
    try {
      const rpcUrl = getRpcUrl(chain);
      const chainId = getChainId(chain);

      // SDK accepts both numeric and string chain IDs
      config[String(chainId)] = rpcUrl;
    } catch {
      // Skip chains without RPC
    }
  }

  return config;
}

function primePublicClients(
  sdk: MoolahSDK,
  rpcUrls: Record<string, string>
): string[] {
  const internalSdk = sdk as unknown as {
    publicClients?: Map<string, unknown>;
  };
  const clients = new Map<string, unknown>();
  const configured: string[] = [];

  for (const [chainId, rpcUrl] of Object.entries(rpcUrls)) {
    const chain = CHAIN_ID_TO_VIEM_CHAIN[chainId];
    if (!chain) continue;

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl, {
        timeout: RPC_TIMEOUT_MS,
        retryCount: RPC_RETRY_COUNT,
        retryDelay: RPC_RETRY_DELAY_MS,
      }),
    });

    clients.set(chainId, client);
    configured.push(chainId);
  }

  if (internalSdk.publicClients instanceof Map) {
    internalSdk.publicClients = clients;
  }

  return configured;
}

/**
 * Get or create the MoolahSDK instance
 * Recreates if RPC config has changed
 */
export function getSDK(): MoolahSDK {
  const currentRpcUrls = buildRpcConfig();

  // Check if we need to recreate SDK (config changed)
  const configChanged =
    sdkRpcUrls === null ||
    JSON.stringify(sdkRpcUrls) !== JSON.stringify(currentRpcUrls);

  if (!sdkInstance || configChanged) {
    sdkInstance = new MoolahSDK({
      rpcUrls: currentRpcUrls,
    });
    const primedChains = primePublicClients(sdkInstance, currentRpcUrls);
    sdkRpcUrls = currentRpcUrls;

    console.error(
      JSON.stringify({
        action: "sdk_initialized",
        chains: Object.keys(currentRpcUrls),
        rpc: {
          timeoutMs: RPC_TIMEOUT_MS,
          retryCount: RPC_RETRY_COUNT,
          retryDelayMs: RPC_RETRY_DELAY_MS,
          primedChains,
        },
      })
    );
  }

  return sdkInstance;
}

/**
 * Get chain ID number from CAIP-2 format
 * Re-exported for convenience
 */
export { getChainId, SUPPORTED_CHAINS } from "./config.js";
