/**
 * Config command - manage RPC URLs and other settings
 */

import {
  loadConfig,
  setRpcUrl,
  clearRpcUrl,
  getRpcUrl,
  DEFAULT_RPCS,
  SUPPORTED_CHAINS,
} from "../config.js";

export interface ConfigArgs {
  show?: boolean;
  setRpc?: boolean;
  clearRpc?: boolean;
  chain?: string;
  url?: string;
}

export async function cmdConfig(args: ConfigArgs): Promise<void> {
  // Show current config
  if (
    args.show ||
    (!args.setRpc && !args.clearRpc)
  ) {
    const config = loadConfig();

    const rpcStatus: Record<string, { url: string; source: string }> = {};

    for (const chain of SUPPORTED_CHAINS) {
      const customUrl = config.rpcUrls[chain];
      const defaultUrl = DEFAULT_RPCS[chain]?.[0];

      rpcStatus[chain] = {
        url: customUrl || defaultUrl || "not configured",
        source: customUrl ? "custom" : "default",
      };
    }

    console.log(
      JSON.stringify(
        {
          defaultChain: config.defaultChain,
          supportedChains: SUPPORTED_CHAINS,
          rpcUrls: rpcStatus,
          configFile: "~/.agent-wallet/lending-config.json",
        },
        null,
        2
      )
    );
    return;
  }

  // Set custom RPC
  if (args.setRpc) {
    if (!args.chain) {
      console.log(
        JSON.stringify({ status: "error", reason: "--chain required" })
      );
      process.exit(1);
    }
    if (!args.url) {
      console.log(
        JSON.stringify({ status: "error", reason: "--url required" })
      );
      process.exit(1);
    }

    try {
      setRpcUrl(args.chain, args.url);
      console.log(
        JSON.stringify({
          status: "success",
          action: "set_rpc",
          chain: args.chain,
          url: args.url,
        })
      );
    } catch (err) {
      console.log(
        JSON.stringify({
          status: "error",
          reason: (err as Error).message,
        })
      );
      process.exit(1);
    }
    return;
  }

  // Clear custom RPC (revert to default)
  if (args.clearRpc) {
    if (!args.chain) {
      console.log(
        JSON.stringify({ status: "error", reason: "--chain required" })
      );
      process.exit(1);
    }

    try {
      clearRpcUrl(args.chain);
      const defaultUrl = getRpcUrl(args.chain);
      console.log(
        JSON.stringify({
          status: "success",
          action: "clear_rpc",
          chain: args.chain,
          revertedTo: defaultUrl,
        })
      );
    } catch (err) {
      console.log(
        JSON.stringify({
          status: "error",
          reason: (err as Error).message,
        })
      );
      process.exit(1);
    }
    return;
  }
}
