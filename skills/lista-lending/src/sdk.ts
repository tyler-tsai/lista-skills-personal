/**
 * SDK initialization for Lista Lending
 * Supports BSC and Ethereum with configurable RPC URLs
 */

import { MoolahSDK } from "@lista-dao/moolah-lending-sdk";
import { createPublicClient, fallback, http } from "viem";
import { bsc, mainnet, type Chain } from "viem/chains";
import {
  getRpcUrl,
  getRpcUrls,
  getChainId,
  getRpcConfig,
  SUPPORTED_CHAINS,
} from "./config.js";

let sdkInstance: MoolahSDK | null = null;
let sdkRpcUrls: Record<string, string> | null = null;

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const CHAIN_ID_TO_VIEM_CHAIN: Record<string, Chain> = {
  "1": mainnet,
  "56": bsc,
};

const CHAIN_ID_TO_CAIP_CHAIN: Record<string, string> = {
  "1": "eip155:1",
  "56": "eip155:56",
};

interface SdkTransportOptions {
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  rpcType: "public" | "custom";
}

function resolveSdkTransportOptions(chain: string): SdkTransportOptions {
  const rpcConfig = getRpcConfig(chain);
  return {
    timeoutMs: parseIntEnv(process.env.LISTA_RPC_TIMEOUT_MS, rpcConfig.itemTimeout),
    retryCount: parseIntEnv(process.env.LISTA_RPC_RETRY_COUNT, rpcConfig.retryCount),
    retryDelayMs: parseIntEnv(process.env.LISTA_RPC_RETRY_DELAY_MS, rpcConfig.retryDelay),
    rpcType: rpcConfig.type,
  };
}

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
): Array<{
  chainId: string;
  chain: string;
  rpcType: "public" | "custom";
  rpcCandidates: string[];
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
}> {
  const internalSdk = sdk as unknown as {
    publicClients?: Map<string, unknown>;
  };
  const clients = new Map<string, unknown>();
  const configured: Array<{
    chainId: string;
    chain: string;
    rpcType: "public" | "custom";
    rpcCandidates: string[];
    timeoutMs: number;
    retryCount: number;
    retryDelayMs: number;
  }> = [];

  for (const [chainId, primaryRpcUrl] of Object.entries(rpcUrls)) {
    const chain = CHAIN_ID_TO_VIEM_CHAIN[chainId];
    if (!chain) continue;
    const caipChain = CHAIN_ID_TO_CAIP_CHAIN[chainId];
    if (!caipChain) continue;
    const transportOptions = resolveSdkTransportOptions(caipChain);
    const rpcCandidates = getRpcUrls(caipChain);
    const candidateUrls =
      rpcCandidates.length > 0 ? rpcCandidates : [primaryRpcUrl];
    const transports = candidateUrls.map((url) =>
      http(url, {
        timeout: transportOptions.timeoutMs,
        retryCount: transportOptions.retryCount,
        retryDelay: transportOptions.retryDelayMs,
      })
    );

    const client = createPublicClient({
      chain,
      transport: transports.length === 1 ? transports[0] : fallback(transports),
    });

    clients.set(chainId, client);
    configured.push({
      chainId,
      chain: caipChain,
      rpcType: transportOptions.rpcType,
      rpcCandidates: candidateUrls,
      timeoutMs: transportOptions.timeoutMs,
      retryCount: transportOptions.retryCount,
      retryDelayMs: transportOptions.retryDelayMs,
    });
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
