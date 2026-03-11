/**
 * Balance command -- check wallet balances via public RPC (no wallet interaction needed).
 * Supports Ethereum and BSC only.
 */

import { createPublicClient, http, formatUnits, formatEther } from "viem";
import { mainnet, bsc } from "viem/chains";
import type { Chain } from "viem";
import { loadSessions } from "../storage.js";
import { requireSession, findAccount, parseAccount } from "../helpers.js";
import {
  getRpcCandidatesForChain,
  type SupportedEvmChainId,
} from "../rpc.js";
import { getTokensForChain } from "./tokens.js";
import { printJson } from "../output.js";
import type { ParsedArgs, BalanceResult } from "../types.js";

const EVM_CHAINS: Record<SupportedEvmChainId, { chain: Chain; native: string }> = {
  "eip155:1": { chain: mainnet, native: "ETH" },
  "eip155:56": { chain: bsc, native: "BNB" },
};

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function getEvmBalance(address: string, chainId: string): Promise<BalanceResult> {
  if (chainId !== "eip155:1" && chainId !== "eip155:56") {
    return {
      chain: chainId,
      address,
      balances: [],
      error: `Unsupported chain: ${chainId}. Only eip155:1 (ETH) and eip155:56 (BSC) are supported.`,
    };
  }

  const evmChain = chainId as SupportedEvmChainId;
  const chainConfig = EVM_CHAINS[evmChain];
  if (!chainConfig) {
    return { chain: chainId, address, balances: [], error: `Unsupported chain: ${chainId}. Only eip155:1 (ETH) and eip155:56 (BSC) are supported.` };
  }
  const result: BalanceResult = { chain: chainId, address, balances: [] };
  const rpcCandidates = getRpcCandidatesForChain(evmChain);
  const rpcErrors: string[] = [];

  let client: ReturnType<typeof createPublicClient> | null = null;

  for (const candidate of rpcCandidates) {
    const candidateClient = createPublicClient({
      chain: chainConfig.chain,
      transport: http(candidate.rpcUrl),
    });

    try {
      const rawBalance = await candidateClient.getBalance({
        address: address as `0x${string}`,
      });
      result.balances.push({
        token: chainConfig.native,
        balance: formatEther(rawBalance),
        raw: rawBalance.toString(),
      });
      client = candidateClient;
      break;
    } catch (err) {
      rpcErrors.push(
        `[${candidate.source}] ${candidate.rpcUrl}: ${(err as Error).message}`
      );
    }
  }

  if (!client) {
    result.balances.push({
      token: chainConfig.native,
      error:
        rpcErrors.length > 0
          ? `All RPC nodes failed: ${rpcErrors.join(" | ")}`
          : "No RPC candidates available",
    });
    return result;
  }

  const tokens = getTokensForChain(chainId);
  for (const token of tokens) {
    try {
      const rawBalance = await client.readContract({
        address: token.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });
      result.balances.push({
        token: token.symbol,
        balance: formatUnits(rawBalance, token.decimals),
        raw: rawBalance.toString(),
      });
    } catch (err) {
      result.balances.push({ token: token.symbol, error: (err as Error).message });
    }
  }

  return result;
}

export async function cmdBalance(args: ParsedArgs): Promise<void> {
  const sessions = loadSessions();

  let accountsToCheck: { address: string; chain: string }[] = [];

  if (args.topic) {
    const sessionData = requireSession(sessions, args.topic);
    const chainsToCheck = args.chain
      ? [args.chain]
      : [
          ...new Set(
            (sessionData.accounts || []).map((a) => {
              const parts = a.split(":");
              return parts.slice(0, 2).join(":");
            }),
          ),
        ];

    for (const chain of chainsToCheck) {
      const acct = findAccount(sessionData.accounts, chain);
      if (acct) {
        const { address } = parseAccount(acct);
        accountsToCheck.push({ address, chain });
      }
    }
  } else if (args.address) {
    const chain = args.chain || "eip155:1";
    accountsToCheck.push({ address: args.address, chain });
  } else {
    const chain = args.chain;
    for (const [, sessionData] of Object.entries(sessions)) {
      for (const acctStr of sessionData.accounts || []) {
        const { address, chainId } = parseAccount(acctStr);
        const acctChain = chainId;
        if (!chain || acctChain === chain) {
          accountsToCheck.push({ address, chain: acctChain });
        }
      }
    }
  }

  if (accountsToCheck.length === 0) {
    printJson({
      error: "No accounts found. Use --topic, --address, or ensure sessions exist.",
    });
    return;
  }

  const seen = new Set<string>();
  accountsToCheck = accountsToCheck.filter(({ address, chain }) => {
    const key = `${chain}:${address.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results: BalanceResult[] = [];
  for (const { address, chain } of accountsToCheck) {
    if (chain.startsWith("eip155:")) {
      results.push(await getEvmBalance(address, chain));
    } else {
      results.push({ chain, address, balances: [], error: `Unsupported chain: ${chain}` });
    }
  }

  printJson(results);
}
