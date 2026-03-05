/**
 * Transaction executor - bridges SDK steps to wallet-connect call command
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http } from "viem";
import { bsc, mainnet, type Chain } from "viem/chains";
import type { StepParam } from "@lista-dao/moolah-lending-sdk";
import type { TxResult } from "./types.js";
import { getRpcUrls } from "./config.js";
import {
  mapWalletConnectResponse,
  mapExecutionError,
} from "./utils/tx-error.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WALLET_CONNECT_CLI = resolve(
  __dirname,
  "../../wallet-connect/dist/cli.js"
);

const EXPLORER_URLS: Record<string, string> = {
  "eip155:56": "https://bscscan.com/tx/",
  "eip155:1": "https://etherscan.io/tx/",
};

const CHAIN_TO_VIEM: Record<string, Chain> = {
  "eip155:56": bsc,
  "eip155:1": mainnet,
};

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const TX_RECEIPT_TIMEOUT_MS = parseIntEnv(
  process.env.LISTA_TX_RECEIPT_TIMEOUT_MS,
  120000
);
const TX_RECEIPT_POLLING_MS = parseIntEnv(
  process.env.LISTA_TX_RECEIPT_POLLING_MS,
  1500
);
const TX_RECEIPT_CONFIRMATIONS = parseIntEnv(
  process.env.LISTA_TX_RECEIPT_CONFIRMATIONS,
  1
);

function getExplorerUrl(chain: string, txHash: string): string {
  const baseUrl = EXPLORER_URLS[chain] || EXPLORER_URLS["eip155:56"];
  return `${baseUrl}${txHash}`;
}

interface ReceiptWaitResult {
  ok: boolean;
  reverted?: boolean;
  rpcUrl?: string;
  blockNumber?: string;
  reason?: string;
  attempts?: Array<{ rpcUrl: string; error: string }>;
}

function isTimeoutErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("deadline") ||
    lower.includes("aborted")
  );
}

async function waitForTransactionFinality(
  chain: string,
  txHash: string
): Promise<ReceiptWaitResult> {
  const viemChain = CHAIN_TO_VIEM[chain];
  if (!viemChain) {
    return {
      ok: false,
      reason: "tx_receipt_wait_unsupported_chain",
      attempts: [{ rpcUrl: "n/a", error: `Unsupported chain for receipt wait: ${chain}` }],
    };
  }

  const rpcUrls = getRpcUrls(chain);
  if (rpcUrls.length === 0) {
    return {
      ok: false,
      reason: "tx_receipt_wait_no_rpc_candidates",
      attempts: [{ rpcUrl: "n/a", error: `No RPC candidates configured for ${chain}` }],
    };
  }

  const attempts: Array<{ rpcUrl: string; error: string }> = [];
  let timeoutDetected = false;
  for (const rpcUrl of rpcUrls) {
    const client = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl, {
        timeout: Math.max(1000, TX_RECEIPT_TIMEOUT_MS),
        retryCount: 1,
        retryDelay: 250,
      }),
    });

    try {
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        confirmations: Math.max(1, TX_RECEIPT_CONFIRMATIONS),
        timeout: Math.max(1000, TX_RECEIPT_TIMEOUT_MS),
        pollingInterval: Math.max(250, TX_RECEIPT_POLLING_MS),
      });

      return {
        ok: true,
        reverted: receipt.status === "reverted",
        rpcUrl,
        blockNumber: receipt.blockNumber.toString(),
      };
    } catch (err) {
      const message = (err as Error).message || String(err);
      attempts.push({ rpcUrl, error: message });
      if (isTimeoutErrorMessage(message)) {
        timeoutDetected = true;
      }
    }
  }

  return {
    ok: false,
    reason: timeoutDetected
      ? "tx_submitted_pending_confirmation"
      : "tx_submitted_receipt_unavailable",
    attempts,
  };
}

export interface ExecuteOptions {
  topic: string;
  chain?: string;
}

/**
 * Execute a single transaction step via wallet-connect
 */
export async function executeStep(
  step: StepParam,
  options: ExecuteOptions
): Promise<TxResult> {
  const { topic, chain = "eip155:56" } = options;
  const { params } = step;

  const args = [
    "call",
    "--topic",
    topic,
    "--chain",
    chain,
    "--to",
    params.to,
    "--data",
    params.data,
  ];

  if (params.value && params.value > 0n) {
    args.push("--value", params.value.toString());
  }

  try {
    const cmd = `node "${WALLET_CONNECT_CLI}" ${args.map((a) => `"${a}"`).join(" ")}`;

    console.error(
      JSON.stringify({
        step: step.step,
        to: params.to,
        data: params.data.slice(0, 10) + "...",
      })
    );

    const result = execSync(cmd, {
      encoding: "utf-8",
      timeout: 5 * 60 * 1000, // 5 min timeout for user approval
      env: {
        ...process.env,
        WALLETCONNECT_PROJECT_ID: process.env.WALLETCONNECT_PROJECT_ID,
      },
    });

    // Parse wallet-connect response (last line is JSON)
    const lines = result.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    const response = JSON.parse(lastLine);

    const txResult = mapWalletConnectResponse(
      response,
      step.step,
      response.txHash ? getExplorerUrl(chain, response.txHash) : undefined
    );

    if (txResult.status !== "sent") {
      return txResult;
    }

    if (!txResult.txHash) {
      return {
        status: "error",
        reason: "wallet_connect_missing_tx_hash",
        step: step.step,
      };
    }

    console.error(
      JSON.stringify({
        action: "waiting_tx_receipt",
        step: step.step,
        chain,
        txHash: txResult.txHash,
        timeoutMs: TX_RECEIPT_TIMEOUT_MS,
        pollMs: TX_RECEIPT_POLLING_MS,
        confirmations: TX_RECEIPT_CONFIRMATIONS,
      })
    );

    const receiptResult = await waitForTransactionFinality(chain, txResult.txHash);
    if (!receiptResult.ok) {
      console.error(
        JSON.stringify({
          action: "tx_receipt_wait_failed",
          step: step.step,
          chain,
          txHash: txResult.txHash,
          attempts: receiptResult.attempts || [],
        })
      );
      return {
        status: "pending",
        reason: receiptResult.reason || "tx_submitted_pending_confirmation",
        step: step.step,
        txHash: txResult.txHash,
        explorer: txResult.explorer,
      };
    }

    console.error(
      JSON.stringify({
        action: "tx_receipt_confirmed",
        step: step.step,
        chain,
        txHash: txResult.txHash,
        rpcUrl: receiptResult.rpcUrl,
        blockNumber: receiptResult.blockNumber,
        status: receiptResult.reverted ? "reverted" : "success",
      })
    );

    if (receiptResult.reverted) {
      return {
        status: "reverted",
        reason: "transaction_reverted_onchain",
        step: step.step,
        txHash: txResult.txHash,
        explorer: txResult.explorer,
      };
    }

    return txResult;
  } catch (err) {
    return mapExecutionError(err, step.step);
  }
}

/**
 * Execute multiple steps in sequence (e.g., approve + deposit)
 * Stops on first failure and returns all results
 */
export async function executeSteps(
  steps: StepParam[],
  options: ExecuteOptions
): Promise<TxResult[]> {
  const results: TxResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.error(
      JSON.stringify({
        executing: `Step ${i + 1}/${steps.length}`,
        type: step.step,
      })
    );

    const result = await executeStep(step, options);
    results.push(result);

    // Stop on first failure
    if (result.status !== "sent") {
      console.error(
        JSON.stringify({
          failed: step.step,
          reason: result.reason,
        })
      );
      break;
    }

    console.error(
      JSON.stringify({
        completed: step.step,
        txHash: result.txHash,
      })
    );
  }

  return results;
}
