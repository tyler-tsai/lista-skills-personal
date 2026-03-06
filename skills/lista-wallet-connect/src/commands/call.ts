/**
 * Raw contract call command -- send arbitrary transactions with custom calldata.
 * Used by lending skills for approve, deposit, withdraw, repay, etc.
 *
 * Simulates transactions by default using eth_call before sending.
 * Use --no-simulate to skip simulation (not recommended).
 */

import { createPublicClient, http, type Chain, type Hex } from "viem";
import { mainnet, bsc } from "viem/chains";
import { getClient } from "../client.js";
import { loadSessions } from "../storage.js";
import {
  getRpcCandidatesForChain,
  type RpcSource,
  type SupportedEvmChainId,
} from "../rpc.js";
import {
  requireSession,
  requireAccount,
  parseAccount,
  resolveAddress,
  requestWithTimeout,
} from "../helpers.js";
import type { ParsedArgs } from "../types.js";

const EXPLORER_URLS: Record<string, string> = {
  "eip155:1": "https://etherscan.io/tx/",
  "eip155:56": "https://bscscan.com/tx/",
};

const CHAIN_CONFIG: Record<SupportedEvmChainId, { chain: Chain }> = {
  "eip155:1": { chain: mainnet },
  "eip155:56": { chain: bsc },
};

/**
 * Simulate transaction using eth_call before sending.
 * Returns null if simulation succeeds, or error message if it fails.
 */
async function simulateTransaction(
  chainId: SupportedEvmChainId,
  tx: { from: string; to: string; data?: string; value?: string },
  rpcCandidates: Array<{ rpcUrl: string; source: RpcSource }>
): Promise<
  | { success: true; rpcUrl: string; rpcSource: RpcSource }
  | {
      success: false;
      error: string;
      revertReason?: string;
      attempts: Array<{ rpcUrl: string; source: RpcSource; error: string }>;
    }
> {
  const config = CHAIN_CONFIG[chainId];
  const attempts: Array<{ rpcUrl: string; source: RpcSource; error: string }> = [];

  for (const candidate of rpcCandidates) {
    const client = createPublicClient({
      chain: config.chain,
      transport: http(candidate.rpcUrl),
    });

    try {
      await client.call({
        account: tx.from as Hex,
        to: tx.to as Hex,
        data: tx.data as Hex | undefined,
        value: tx.value ? BigInt(tx.value) : undefined,
      });

      return {
        success: true,
        rpcUrl: candidate.rpcUrl,
        rpcSource: candidate.source,
      };
    } catch (err) {
      const error = err as Error;
      const message = error.message || String(err);
      let revertReason: string | undefined;

      if (message.includes("reverted")) {
        const match = message.match(/reverted:?\s*(.+?)(?:\n|$)/i);
        revertReason = match?.[1]?.trim();
      }

      attempts.push({
        rpcUrl: candidate.rpcUrl,
        source: candidate.source,
        error: message,
      });

      // A true revert should not be retried on other RPC nodes.
      if (revertReason) {
        return {
          success: false,
          error: message,
          revertReason,
          attempts,
        };
      }
    }
  }

  return {
    success: false,
    error:
      attempts.length > 0
        ? attempts
            .map((a) => `[${a.source}] ${a.rpcUrl}: ${a.error}`)
            .join(" | ")
        : "Simulation failed with no RPC candidates",
    attempts,
  };
}

/**
 * Parse value input to hex wei.
 * Accepts: "0x..." (hex wei), "1.5" (ether), "1000000000000000000" (wei string)
 */
function parseValue(value: string | undefined): string | undefined {
  if (!value || value === "0") return undefined;

  // Already hex
  if (value.startsWith("0x")) return value;

  // If contains decimal point, treat as ether
  if (value.includes(".")) {
    const wei = BigInt(Math.round(parseFloat(value) * 1e18));
    return "0x" + wei.toString(16);
  }

  // Plain number string, treat as wei
  const wei = BigInt(value);
  return "0x" + wei.toString(16);
}

/**
 * Parse gas value to hex.
 */
function parseGas(gas: string | undefined): string | undefined {
  if (!gas) return undefined;
  if (gas.startsWith("0x")) return gas;
  return "0x" + BigInt(gas).toString(16);
}

export async function cmdCall(args: ParsedArgs): Promise<void> {
  if (!args.topic) {
    console.error(JSON.stringify({ error: "--topic required" }));
    process.exit(1);
  }

  if (!args.to) {
    console.error(JSON.stringify({ error: "--to (contract address) required" }));
    process.exit(1);
  }

  const chain = args.chain || "eip155:56"; // Default to BSC for Lista

  if (chain !== "eip155:1" && chain !== "eip155:56") {
    console.error(JSON.stringify({
      error: `Unsupported chain: ${chain}. Only eip155:1 (ETH) and eip155:56 (BSC) are supported.`
    }));
    process.exit(1);
  }
  const evmChain = chain as SupportedEvmChainId;

  const client = await getClient();
  const sessionData = requireSession(loadSessions(), args.topic);
  const accountStr = requireAccount(sessionData, chain, "EVM");
  const { address: from } = parseAccount(accountStr);

  // Resolve ENS if needed
  const resolvedTo = await resolveAddress(args.to);
  if (resolvedTo !== args.to) {
    console.error(JSON.stringify({ ens: args.to, resolved: resolvedTo }));
  }

  // Build transaction object
  const tx: Record<string, string> = {
    from,
    to: resolvedTo,
  };

  // Add calldata if provided
  if (args.data) {
    tx.data = args.data.startsWith("0x") ? args.data : "0x" + args.data;
  }

  // Add value if provided
  const value = parseValue(args.value);
  if (value) {
    tx.value = value;
  }

  // Add gas limit if provided
  const gas = parseGas(args.gas);
  if (gas) {
    tx.gas = gas;
  }

  // Add gas price if provided
  const gasPrice = parseGas(args.gasPrice);
  if (gasPrice) {
    tx.gasPrice = gasPrice;
  }

  // Log transaction details for debugging
  console.error(JSON.stringify({
    action: "sending_raw_tx",
    chain: evmChain,
    from,
    to: resolvedTo,
    data: tx.data ? `${tx.data.slice(0, 10)}...` : undefined,
    value: tx.value,
    gas: tx.gas,
  }));

  // Simulate transaction first (unless --no-simulate is set)
  if (!args.noSimulate) {
    const rpcCandidates = getRpcCandidatesForChain(evmChain);
    console.error(
      JSON.stringify({
        action: "simulating_tx",
        rpcCandidates: rpcCandidates.map((candidate) => ({
          rpcUrl: candidate.rpcUrl,
          rpcSource: candidate.source,
        })),
      })
    );

    const simResult = await simulateTransaction(
      evmChain,
      { from, to: resolvedTo, data: tx.data, value: tx.value },
      rpcCandidates
    );

    if (!simResult.success) {
      console.log(JSON.stringify({
        status: "simulation_failed",
        error: simResult.error,
        revertReason: simResult.revertReason,
        attempts: simResult.attempts,
        hint: "Transaction would revert on-chain. Use --no-simulate to force send (not recommended).",
      }));
      await client.core.relayer.transportClose().catch(() => {});
      process.exit(1);
    }

    console.error(
      JSON.stringify({
        action: "simulation_passed",
        rpcUrl: simResult.rpcUrl,
        rpcSource: simResult.rpcSource,
      })
    );
  }

  try {
    const txHash = await requestWithTimeout(client, {
      topic: args.topic,
      chainId: evmChain,
      request: {
        method: "eth_sendTransaction",
        params: [tx],
      },
    });

    const explorerUrl = EXPLORER_URLS[evmChain] || "";

    console.log(
      JSON.stringify({
        status: "sent",
        txHash,
        chain: evmChain,
        from,
        to: resolvedTo,
        ...(resolvedTo !== args.to ? { ens: args.to } : {}),
        data: tx.data,
        value: tx.value,
        explorer: explorerUrl ? `${explorerUrl}${txHash}` : undefined,
      }),
    );
  } catch (err) {
    console.log(JSON.stringify({ status: "rejected", error: (err as Error).message }));
  }

  await client.core.relayer.transportClose().catch(() => {});
  process.exit(0);
}
