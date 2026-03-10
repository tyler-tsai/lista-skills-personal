/**
 * Shared helpers for lista-wallet-connect-skill (EVM only).
 */
import { parseAccountId } from "@walletconnect/utils";
import { normalize } from "viem/ens";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
/**
 * Find an account in session matching a namespace (e.g. "eip155").
 */
export function findAccount(accounts, chainHint) {
    if (!chainHint)
        return accounts[0] || null;
    const exact = accounts.find((a) => a.startsWith(chainHint + ":") || a.startsWith(chainHint));
    if (exact)
        return exact;
    const ns = chainHint.split(":")[0];
    return accounts.find((a) => a.startsWith(ns + ":")) || null;
}
/**
 * Parse an account string into { namespace, reference, address, chainId }.
 */
export function parseAccount(accountStr) {
    const parsed = parseAccountId(accountStr);
    return {
        ...parsed,
        chainId: `${parsed.namespace}:${parsed.reference}`,
        address: parsed.address,
    };
}
/**
 * Redact middle of an address: 0xC36edF48...3db87e81b
 */
export function redactAddress(address, keep = 7) {
    if (!address)
        return address;
    if (address.startsWith("0x")) {
        const hex = address.slice(2);
        if (hex.length <= keep * 2)
            return address;
        return `0x${hex.slice(0, keep)}...${hex.slice(-keep)}`;
    }
    if (address.length <= keep * 2)
        return address;
    return `${address.slice(0, keep)}...${address.slice(-keep)}`;
}
/**
 * Encode a UTF-8 message for EVM personal_sign (hex).
 */
export function encodeEvmMessage(message) {
    return "0x" + Buffer.from(message, "utf8").toString("hex");
}
/**
 * Get session data or exit with error.
 */
export function requireSession(sessions, topic) {
    const data = sessions[topic];
    if (!data) {
        console.error(JSON.stringify({ error: "Session not found", topic }));
        process.exit(1);
    }
    return data;
}
/**
 * Require an account matching a chain hint in session, or exit.
 */
export function requireAccount(sessionData, chainHint, label = "matching") {
    const account = findAccount(sessionData.accounts, chainHint);
    if (!account) {
        console.error(JSON.stringify({ error: `No ${label} account found`, chainHint }));
        process.exit(1);
    }
    return account;
}
/**
 * Resolve an ENS name to an EVM address. Pass-through if not .eth.
 */
export async function resolveAddress(addressOrEns) {
    if (!addressOrEns.endsWith(".eth"))
        return addressOrEns;
    const client = createPublicClient({ chain: mainnet, transport: http() });
    const resolved = await client.getEnsAddress({ name: normalize(addressOrEns) });
    if (!resolved)
        throw new Error(`Could not resolve ENS name: ${addressOrEns}`);
    return resolved;
}
/**
 * Wrap client.request with timeout and periodic polling status on stderr.
 */
export async function requestWithTimeout(client, requestParams, { pollIntervalMs = 10000, timeoutMs = 300000, phase = "wallet_request", context, emitStdoutHeartbeat, } = {}) {
    const start = Date.now();
    const shouldEmitStdout = emitStdoutHeartbeat ?? (!process.stdout.isTTY || process.env.WC_STDOUT_HEARTBEAT === "1");
    const userReminder = "Wallet confirmation is pending. Please open your wallet app and approve or reject the request to continue.";
    const emitHeartbeat = () => {
        const elapsed = Date.now() - start;
        const heartbeat = {
            status: "waiting_for_approval",
            phase,
            elapsedMs: elapsed,
            timeoutMs,
            interactionRequired: true,
            userReminder,
            ...(context || {}),
        };
        console.error(JSON.stringify(heartbeat));
        if (shouldEmitStdout) {
            console.log(JSON.stringify(heartbeat));
        }
    };
    emitHeartbeat();
    const pollTimer = setInterval(() => {
        emitHeartbeat();
    }, pollIntervalMs);
    try {
        const result = await Promise.race([
            client.request(requestParams),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Request timed out after 5 minutes -- user did not respond")), timeoutMs);
            }),
        ]);
        return result;
    }
    finally {
        clearInterval(pollTimer);
    }
}
