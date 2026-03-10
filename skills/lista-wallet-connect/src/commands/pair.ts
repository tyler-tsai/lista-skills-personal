/**
 * Pair command -- create a new WalletConnect pairing session (EVM only).
 */

import QRCode from "qrcode";
import { mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { parseAccountId, parseChainId } from "@walletconnect/utils";
import { getClient } from "../client.js";
import { saveSession, SESSIONS_DIR } from "../storage.js";
import type { ParsedArgs } from "../types.js";

/**
 * Detect if running in a terminal environment where we should auto-open QR.
 * Returns true for: direct terminal, SSH, VSCode integrated terminal
 * Returns false for: piped output, Claude Code extension, programmatic usage
 *
 * @param forceOpen - If true (--open flag), always open regardless of environment
 */
function shouldAutoOpenQR(forceOpen?: boolean): boolean {
  // --open flag forces opening in agent environments (Claude, Codex, Cursor)
  if (forceOpen) return true;

  // If stdout is not a TTY, we're being piped/captured - output image data instead
  if (!process.stdout.isTTY) return false;

  // Check for Claude Code / agent environment
  if (process.env.CLAUDE_CODE || process.env.AGENT_MODE) return false;

  // Default: auto-open in terminal
  return true;
}

/**
 * Open file with system default application (cross-platform)
 */
function openFile(filePath: string): void {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      execSync(`open "${filePath}"`);
    } else if (platform === "win32") {
      execSync(`start "" "${filePath}"`);
    } else {
      execSync(`xdg-open "${filePath}"`);
    }
  } catch {
    // Silently fail if open command doesn't work
  }
}

const NAMESPACE_CONFIG: Record<string, { methods: string[]; events: string[] }> = {
  eip155: {
    methods: ["personal_sign", "eth_sendTransaction", "eth_signTypedData_v4"],
    events: ["chainChanged", "accountsChanged"],
  },
};

function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildPairSummary(accounts: string[]): {
  chains: string[];
  addresses: string[];
  primaryAccount?: { chain: string; address: string; display: string };
} {
  const parsed = accounts
    .map((account) => {
      try {
        const info = parseAccountId(account);
        return {
          chain: `${info.namespace}:${info.reference}`,
          address: info.address,
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is { chain: string; address: string } => item !== null);

  const chains = Array.from(new Set(parsed.map((item) => item.chain)));
  const addresses = Array.from(new Set(parsed.map((item) => item.address)));
  const primary = parsed[0];

  return {
    chains,
    addresses,
    primaryAccount: primary
      ? {
          chain: primary.chain,
          address: primary.address,
          display: shortAddress(primary.address),
        }
      : undefined,
  };
}

export async function cmdPair(args: ParsedArgs): Promise<void> {
  const chains = args.chains ? args.chains.split(",") : ["eip155:56", "eip155:1"];

  const byNamespace: Record<string, string[]> = {};
  for (const chain of chains) {
    const { namespace } = parseChainId(chain);
    if (!NAMESPACE_CONFIG[namespace]) {
      console.error(JSON.stringify({ error: `Unsupported namespace: ${namespace}. Only EVM (eip155) is supported.` }));
      process.exit(1);
    }
    if (!byNamespace[namespace]) byNamespace[namespace] = [];
    byNamespace[namespace].push(chain);
  }

  const requiredNamespaces: Record<string, { chains: string[]; methods: string[]; events: string[] }> = {};
  for (const [ns, nsChains] of Object.entries(byNamespace)) {
    requiredNamespaces[ns] = {
      chains: nsChains,
      ...NAMESPACE_CONFIG[ns],
    };
  }

  const debug = process.env.WC_DEBUG === "1";
  const t0 = Date.now();

  const client = await getClient();
  if (debug) console.error(`[WC] getClient() done in ${Date.now() - t0}ms`);

  const t1 = Date.now();
  const { uri, approval } = await client.connect({ requiredNamespaces });
  if (debug) console.error(`[WC] client.connect() done in ${Date.now() - t1}ms`);

  const qrPath = join(SESSIONS_DIR, `qr-${Date.now()}.png`);
  mkdirSync(SESSIONS_DIR, { recursive: true });
  await QRCode.toFile(qrPath, uri!, { width: 400, margin: 2 });

  const autoOpen = shouldAutoOpenQR(args.open);

  // Build output with optional base64 for non-TTY environments
  const output: Record<string, unknown> = {
    uri,
    qrPath,
    status: "waiting_for_approval",
    message: "Scan and approve this WalletConnect request in your wallet app.",
  };

  // For non-TTY (Claude Code, piped), include base64 so caller can display
  if (!autoOpen) {
    const qrBase64 = await QRCode.toDataURL(uri!, { width: 400, margin: 2 });
    output.qrBase64 = qrBase64;
  }

  console.log(JSON.stringify(output, null, 2));

  // Auto-open QR in terminal environments
  if (autoOpen) {
    openFile(qrPath);
  }

  try {
    const session = await approval();
    const accounts = Object.values(session.namespaces).flatMap((ns) => ns.accounts || []);
    const walletName = session.peer?.metadata?.name || "Unknown Wallet";
    const pairedAt = new Date().toISOString();
    const summary = buildPairSummary(accounts);

    saveSession(session.topic, {
      accounts,
      chains,
      peerName: walletName,
      createdAt: pairedAt,
    });

    console.log(
      JSON.stringify(
        {
          status: "paired",
          message: `Wallet connected successfully (${walletName}).`,
          topic: session.topic,
          accounts,
          peerName: walletName,
          pairedAt,
          summary: {
            chainCount: summary.chains.length,
            accountCount: accounts.length,
            chains: summary.chains,
            primaryAccount: summary.primaryAccount,
          },
          nextActions: [
            "Use whoami/status to verify the active session.",
            "Use auth if a consent signature is required before operations.",
          ],
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.log(JSON.stringify({ status: "rejected", error: (err as Error).message }));
  }

  await client.core.relayer.transportClose().catch(() => {});
  process.exit(0);
}
