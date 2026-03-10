/**
 * Raw contract call command -- send arbitrary transactions with custom calldata.
 */
import { getClient } from "../client.js";
import { loadSessions } from "../storage.js";
import { getRpcCandidatesForChain, } from "../rpc.js";
import { requireSession, requireAccount, parseAccount, resolveAddress, requestWithTimeout, } from "../helpers.js";
import { EXPLORER_URLS } from "./call/constants.js";
import { buildCallTransaction } from "./call/parse.js";
import { simulateTransaction } from "./call/simulate.js";
function resolveSupportedChain(chain) {
    if (chain === "eip155:1" || chain === "eip155:56") {
        return chain;
    }
    return null;
}
export async function cmdCall(args) {
    if (!args.topic) {
        console.error(JSON.stringify({ error: "--topic required" }));
        process.exit(1);
    }
    if (!args.to) {
        console.error(JSON.stringify({ error: "--to (contract address) required" }));
        process.exit(1);
    }
    const evmChain = resolveSupportedChain(args.chain || "eip155:56");
    if (!evmChain) {
        console.error(JSON.stringify({
            error: `Unsupported chain: ${args.chain}. Only eip155:1 (ETH) and eip155:56 (BSC) are supported.`,
        }));
        process.exit(1);
    }
    const client = await getClient();
    const sessionData = requireSession(loadSessions(), args.topic);
    const accountStr = requireAccount(sessionData, evmChain, "EVM");
    const { address: from } = parseAccount(accountStr);
    const resolvedTo = await resolveAddress(args.to);
    if (resolvedTo !== args.to) {
        console.error(JSON.stringify({ ens: args.to, resolved: resolvedTo }));
    }
    const tx = buildCallTransaction(from, resolvedTo, args);
    console.error(JSON.stringify({
        action: "sending_raw_tx",
        chain: evmChain,
        from,
        to: resolvedTo,
        data: tx.data ? `${tx.data.slice(0, 10)}...` : undefined,
        value: tx.value,
        gas: tx.gas,
    }));
    if (!args.noSimulate) {
        const rpcCandidates = getRpcCandidatesForChain(evmChain);
        console.error(JSON.stringify({
            action: "simulating_tx",
            rpcCandidates: rpcCandidates.map((candidate) => ({
                rpcUrl: candidate.rpcUrl,
                rpcSource: candidate.source,
            })),
        }));
        const simResult = await simulateTransaction(evmChain, { from, to: resolvedTo, data: tx.data, value: tx.value }, rpcCandidates);
        if (!simResult.success) {
            console.log(JSON.stringify({
                status: "simulation_failed",
                error: simResult.error,
                revertReason: simResult.revertReason,
                revertData: simResult.revertData,
                revertSelector: simResult.revertSelector,
                attempts: simResult.attempts,
                hint: "Transaction would revert on-chain. Use --no-simulate to force send (not recommended).",
            }));
            await client.core.relayer.transportClose().catch(() => { });
            process.exit(1);
        }
        console.error(JSON.stringify({
            action: "simulation_passed",
            rpcUrl: simResult.rpcUrl,
            rpcSource: simResult.rpcSource,
        }));
    }
    try {
        const txHash = await requestWithTimeout(client, {
            topic: args.topic,
            chainId: evmChain,
            request: {
                method: "eth_sendTransaction",
                params: [tx],
            },
        }, {
            phase: "call",
            context: {
                command: "call",
                topic: args.topic,
                chain: evmChain,
                from,
                to: resolvedTo,
            },
        });
        const explorerUrl = EXPLORER_URLS[evmChain] || "";
        console.log(JSON.stringify({
            status: "sent",
            txHash,
            chain: evmChain,
            from,
            to: resolvedTo,
            ...(resolvedTo !== args.to ? { ens: args.to } : {}),
            data: tx.data,
            value: tx.value,
            explorer: explorerUrl ? `${explorerUrl}${txHash}` : undefined,
        }));
    }
    catch (err) {
        console.log(JSON.stringify({ status: "rejected", error: err.message }));
    }
    await client.core.relayer.transportClose().catch(() => { });
    process.exit(0);
}
