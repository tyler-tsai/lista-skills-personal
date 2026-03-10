import { cmdPair } from "../commands/pair.js";
import { cmdAuth } from "../commands/auth.js";
import { cmdSign } from "../commands/sign.js";
import { cmdSignTypedData } from "../commands/sign-typed-data.js";
import { cmdSendTx } from "../commands/send-tx.js";
import { cmdCall } from "../commands/call.js";
import { cmdBalance } from "../commands/balance.js";
import { cmdHealth } from "../commands/health.js";
import {
  cmdStatus,
  cmdSessions,
  cmdListSessions,
  cmdWhoami,
  cmdDeleteSession,
} from "../commands/sessions.js";
import { getTokensForChain } from "../commands/tokens.js";
import { loadSessions } from "../storage.js";
import { findSessionByAddress } from "../client.js";
import { printErrorJson, printJson } from "../output.js";
import type { ParsedArgs } from "../types.js";
import type { CliMeta } from "./meta.js";

function resolveAddress(args: ParsedArgs): ParsedArgs {
  if (args.address && !args.topic) {
    const sessions = loadSessions();
    const match = findSessionByAddress(sessions, args.address);
    if (!match) {
      printErrorJson({ error: "No session found for address", address: args.address });
      process.exit(1);
    }
    args.topic = match.topic;
  }
  return args;
}

async function cmdTokens(args: ParsedArgs): Promise<void> {
  const chain = args.chain || "eip155:1";
  const tokens = getTokensForChain(chain);
  if (tokens.length === 0) {
    printJson({ chain, tokens: [], message: "No tokens configured for this chain" });
    return;
  }

  printJson({
    chain,
    tokens: tokens.map((t) => ({
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      address: t.address,
    })),
  });
}

export async function runCommand(
  command: string,
  args: ParsedArgs,
  meta: CliMeta
): Promise<void> {
  const commands: Record<string, (input: ParsedArgs) => Promise<void>> = {
    pair: cmdPair,
    status: cmdStatus,
    auth: (a) => cmdAuth(resolveAddress(a)),
    sign: (a) => cmdSign(resolveAddress(a)),
    "sign-typed-data": (a) => cmdSignTypedData(resolveAddress(a)),
    "send-tx": (a) => cmdSendTx(resolveAddress(a)),
    call: (a) => cmdCall(resolveAddress(a)),
    balance: (a) => {
      if (a.address || a.topic) return cmdBalance(resolveAddress(a));
      return cmdBalance(a);
    },
    tokens: cmdTokens,
    sessions: cmdSessions,
    "list-sessions": cmdListSessions,
    whoami: cmdWhoami,
    "delete-session": cmdDeleteSession,
    health: cmdHealth,
    version: async () => {
      printJson({
        skill: meta.skillName,
        version: meta.skillVersion,
        hint: "If version mismatch, run: npm install && npm run build",
      });
    },
  };

  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }

  await commands[command](args);
}
