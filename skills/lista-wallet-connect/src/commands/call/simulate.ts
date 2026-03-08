import { createPublicClient, http, type Hex } from "viem";
import type { RpcSource, SupportedEvmChainId } from "../../rpc.js";
import { CHAIN_CONFIG } from "./constants.js";

export interface SimulationSuccess {
  success: true;
  rpcUrl: string;
  rpcSource: RpcSource;
}

export interface SimulationFailure {
  success: false;
  error: string;
  revertReason?: string;
  attempts: Array<{ rpcUrl: string; source: RpcSource; error: string }>;
}

export type SimulationResult = SimulationSuccess | SimulationFailure;

export async function simulateTransaction(
  chainId: SupportedEvmChainId,
  tx: { from: string; to: string; data?: string; value?: string },
  rpcCandidates: Array<{ rpcUrl: string; source: RpcSource }>
): Promise<SimulationResult> {
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
        ? attempts.map((a) => `[${a.source}] ${a.rpcUrl}: ${a.error}`).join(" | ")
        : "Simulation failed with no RPC candidates",
    attempts,
  };
}
