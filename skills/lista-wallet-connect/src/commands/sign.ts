/**
 * Sign command -- sign an arbitrary message (EVM only).
 */

import { getClient } from "../client.js";
import { loadSessions } from "../storage.js";
import {
  requireSession,
  findAccount,
  parseAccount,
  encodeEvmMessage,
  requestWithTimeout,
} from "../helpers.js";
import type { ParsedArgs } from "../types.js";

export async function cmdSign(args: ParsedArgs): Promise<void> {
  if (!args.topic || !args.message) {
    console.error(JSON.stringify({ error: "--topic and --message required" }));
    process.exit(1);
  }

  const client = await getClient();
  const sessionData = requireSession(loadSessions(), args.topic);

  const chainHint = args.chain;
  const account = findAccount(
    sessionData.accounts,
    chainHint?.startsWith("eip155") ? chainHint : "eip155",
  );

  if (!account) {
    console.error(JSON.stringify({ error: "No EVM account found", chainHint }));
    process.exit(1);
  }

  const { chainId, address } = parseAccount(account);

  const signature = await requestWithTimeout(client, {
    topic: args.topic,
    chainId,
    request: {
      method: "personal_sign",
      params: [encodeEvmMessage(args.message), address],
    },
  }, {
    phase: "sign",
    context: {
      command: "sign",
      topic: args.topic,
      chainId,
      address,
    },
  });

  const result = { status: "signed", address, signature, chain: chainId };

  console.log(JSON.stringify(result));
  await client.core.relayer.transportClose().catch(() => {});
  process.exit(0);
}
