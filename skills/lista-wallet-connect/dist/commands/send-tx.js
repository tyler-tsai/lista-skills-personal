/**
 * Send transaction command -- native or ERC-20 token transfers (ETH + BSC only).
 */
import { getClient } from "../client.js";
import { loadSessions } from "../storage.js";
import { requireSession, requireAccount, parseAccount, resolveAddress, requestWithTimeout, } from "../helpers.js";
import { getTokenAddress, getTokenDecimals } from "./tokens.js";
const EXPLORER_URLS = {
    "eip155:1": "https://etherscan.io/tx/",
    "eip155:56": "https://bscscan.com/tx/",
};
export async function cmdSendTx(args) {
    if (!args.topic) {
        console.error(JSON.stringify({ error: "--topic required" }));
        process.exit(1);
    }
    const chain = args.chain || "eip155:1";
    if (chain !== "eip155:1" && chain !== "eip155:56") {
        console.error(JSON.stringify({ error: `Unsupported chain: ${chain}. Only eip155:1 (ETH) and eip155:56 (BSC) are supported.` }));
        process.exit(1);
    }
    const client = await getClient();
    const sessionData = requireSession(loadSessions(), args.topic);
    const accountStr = requireAccount(sessionData, chain, "EVM");
    const { address: from } = parseAccount(accountStr);
    const resolvedTo = await resolveAddress(args.to);
    if (resolvedTo !== args.to) {
        console.error(JSON.stringify({ ens: args.to, resolved: resolvedTo }));
    }
    let tx;
    let tokenLabel = chain === "eip155:56" ? "BNB" : "ETH";
    if (args.token && args.token !== "ETH" && args.token !== "BNB") {
        const tokenAddr = getTokenAddress(args.token, chain);
        if (!tokenAddr) {
            console.error(JSON.stringify({ error: `Token ${args.token} not supported on ${chain}` }));
            process.exit(1);
        }
        const decimals = getTokenDecimals(args.token);
        const amount = BigInt(Math.round(parseFloat(args.amount) * 10 ** decimals));
        const toAddr = resolvedTo.replace("0x", "").padStart(64, "0");
        const amountHex = amount.toString(16).padStart(64, "0");
        const data = `0xa9059cbb${toAddr}${amountHex}`;
        tx = { from, to: tokenAddr, data };
        tokenLabel = args.token;
    }
    else {
        const weiAmount = BigInt(Math.round(parseFloat(args.amount || "0") * 1e18));
        tx = {
            from,
            to: resolvedTo,
            value: "0x" + weiAmount.toString(16),
        };
    }
    try {
        const txHash = await requestWithTimeout(client, {
            topic: args.topic,
            chainId: chain,
            request: {
                method: "eth_sendTransaction",
                params: [tx],
            },
        }, {
            phase: "send_tx",
            context: {
                command: "send-tx",
                topic: args.topic,
                chain,
                from,
                to: resolvedTo,
                token: tokenLabel,
                amount: args.amount,
            },
        });
        const explorerUrl = EXPLORER_URLS[chain] || "";
        console.log(JSON.stringify({
            status: "sent",
            txHash,
            chain,
            from,
            to: resolvedTo,
            ...(resolvedTo !== args.to ? { ens: args.to } : {}),
            amount: args.amount,
            token: tokenLabel,
            explorer: explorerUrl ? `${explorerUrl}${txHash}` : undefined,
        }));
    }
    catch (err) {
        console.log(JSON.stringify({ status: "rejected", error: err.message }));
    }
    await client.core.relayer.transportClose().catch(() => { });
    process.exit(0);
}
