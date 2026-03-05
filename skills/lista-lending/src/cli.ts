#!/usr/bin/env tsx
/**
 * Lista Lending Skill CLI
 *
 * Vault Commands:
 *   vaults    List available vaults
 *   deposit   Deposit assets into a vault
 *   withdraw  Withdraw assets from a vault
 *
 * Market Commands:
 *   markets         List available markets (excludes SmartLending & Fixed)
 *   supply          Supply collateral to a market
 *   borrow          Borrow loan tokens (with --simulate support)
 *   repay           Repay borrowed loan tokens
 *   market-withdraw Withdraw collateral from a market
 *
 * Common Commands:
 *   holdings  Query user's positions (vault + market)
 *   select    Select a vault or market for operations
 *   config    Manage RPC URLs and settings
 *   version   Show version information
 */

import { parseArgs } from "util";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

interface SkillPackageJson {
  name?: string;
  version?: string;
  skillRequires?: Record<string, string>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as SkillPackageJson;
export const SKILL_VERSION = pkg.version || "0.1.0";
export const SKILL_NAME = pkg.name || "@lista-dao/lista-lending-skill";
// Required wallet-connect version for compatibility (single source: package.json)
export const WALLET_CONNECT_VERSION =
  pkg.skillRequires?.["wallet-connect"] || ">=1.0.0";

import { cmdDeposit } from "./commands/deposit.js";
import { cmdWithdraw } from "./commands/withdraw.js";
import { cmdConfig, type ConfigArgs } from "./commands/config.js";
import { cmdVaults, type VaultsArgs } from "./commands/vaults.js";
import { cmdMarkets, type MarketsArgs } from "./commands/markets.js";
import { cmdHoldings, type HoldingsArgs } from "./commands/holdings.js";
import { cmdSelect, type SelectArgs } from "./commands/select.js";
import { cmdSupply } from "./commands/supply.js";
import { cmdBorrow } from "./commands/borrow.js";
import { cmdRepay } from "./commands/repay.js";
import { cmdMarketWithdraw } from "./commands/market-withdraw.js";
import type { ParsedArgs } from "./types.js";
import { setRuntimeDebugOverride } from "./commands/shared/output.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    // Target selection
    vault: { type: "string" },
    market: { type: "string" },
    // Operation parameters
    amount: { type: "string" },
    chain: { type: "string" },
    address: { type: "string" },
    // List query parameters
    page: { type: "string" },
    "page-size": { type: "string" },
    sort: { type: "string" },
    order: { type: "string" },
    scope: { type: "string" },
    zone: { type: "string" },
    keyword: { type: "string" },
    assets: { type: "string" },
    curators: { type: "string" },
    loans: { type: "string" },
    collaterals: { type: "string" },
    // Wallet connection
    "wallet-topic": { type: "string" },
    "wallet-address": { type: "string" },
    // Vault operations
    "withdraw-all": { type: "boolean" },
    // Market operations
    "repay-all": { type: "boolean" },
    simulate: { type: "boolean" },
    "simulate-supply": { type: "string" },
    // Config/Select operations
    show: { type: "boolean" },
    clear: { type: "boolean" },
    "set-rpc": { type: "boolean" },
    "clear-rpc": { type: "boolean" },
    "set-debug": { type: "boolean" },
    "clear-debug": { type: "boolean" },
    url: { type: "string" },
    debug: { type: "boolean" },
    // General
    help: { type: "boolean", short: "h" },
  },
});

const command = positionals[0];

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

const page =
  typeof values.page === "string" && values.page.trim() !== ""
    ? Number(values.page)
    : undefined;
const pageSize =
  typeof values["page-size"] === "string" && values["page-size"].trim() !== ""
    ? Number(values["page-size"])
    : undefined;

// Map CLI args to ParsedArgs
const args: ParsedArgs = {
  vault: values.vault,
  market: values.market,
  amount: values.amount,
  chain: values.chain,
  walletTopic: values["wallet-topic"],
  walletAddress: values["wallet-address"],
  withdrawAll: values["withdraw-all"],
  repayAll: values["repay-all"],
  simulate: values.simulate,
  simulateSupply: values["simulate-supply"],
  debug: values.debug,
  help: values.help,
};

if (typeof values.debug === "boolean") {
  setRuntimeDebugOverride(values.debug);
}

// Config args
const configArgs: ConfigArgs = {
  show: values.show,
  setRpc: values["set-rpc"],
  clearRpc: values["clear-rpc"],
  setDebug: values["set-debug"],
  clearDebug: values["clear-debug"],
  chain: values.chain,
  url: values.url,
};

// Vaults args
const vaultsArgs: VaultsArgs = {
  chain: values.chain,
  page,
  pageSize,
  sort: values.sort,
  order: values.order as "asc" | "desc" | undefined,
  zone: values.zone,
  keyword: values.keyword,
  assets: parseCsv(values.assets),
  curators: parseCsv(values.curators),
};

// Markets args
const marketsArgs: MarketsArgs = {
  chain: values.chain,
  page,
  pageSize,
  sort: values.sort,
  order: values.order as "asc" | "desc" | undefined,
  zone: values.zone,
  keyword: values.keyword,
  loans: parseCsv(values.loans),
  collaterals: parseCsv(values.collaterals),
};

// Holdings args
const holdingsArgs: HoldingsArgs = {
  address: values.address || values["wallet-address"],
  scope: values.scope as HoldingsArgs["scope"],
};

// Select args
const selectArgs: SelectArgs = {
  vault: values.vault,
  market: values.market,
  chain: values.chain,
  walletTopic: values["wallet-topic"],
  walletAddress: values["wallet-address"],
  clear: values.clear,
  show: values.show,
};

if (!command || args.help) {
  console.log(`${SKILL_NAME} v${SKILL_VERSION}

Usage: cli.ts <command> [options]

Vault Commands:
  vaults           List available vaults
  deposit          Deposit assets into selected vault
  withdraw         Withdraw assets from selected vault

Market Commands:
  markets          List available markets (excludes SmartLending & Fixed)
  supply           Supply collateral to selected market
  borrow           Borrow loan tokens (use --simulate to check max)
  repay            Repay borrowed loan tokens
  market-withdraw  Withdraw collateral from selected market

Common Commands:
  holdings         Query user's positions (vault + market)
  select           Select a vault or market for operations
  config           Manage RPC URLs and settings
  version          Show version information

Discovery:
  npx tsx src/cli.ts vaults [--chain eip155:56]
  npx tsx src/cli.ts markets [--chain eip155:56]
  npx tsx src/cli.ts holdings --address 0x...

Selection:
  npx tsx src/cli.ts select --vault 0x... --wallet-topic <t> --wallet-address 0x...
  npx tsx src/cli.ts select --market 0x... --wallet-topic <t> --wallet-address 0x...
  npx tsx src/cli.ts select --show
  npx tsx src/cli.ts select --clear

Vault Operations:
  npx tsx src/cli.ts deposit --amount 100
  npx tsx src/cli.ts withdraw --amount 50
  npx tsx src/cli.ts withdraw --withdraw-all

Market Operations:
  npx tsx src/cli.ts supply --amount 1
  npx tsx src/cli.ts borrow --simulate
  npx tsx src/cli.ts borrow --simulate --simulate-supply 1
  npx tsx src/cli.ts borrow --amount 100
  npx tsx src/cli.ts repay --amount 50
  npx tsx src/cli.ts repay --repay-all
  npx tsx src/cli.ts market-withdraw --amount 0.5
  npx tsx src/cli.ts market-withdraw --withdraw-all
  npx tsx src/cli.ts borrow --simulate --debug
  npx tsx src/cli.ts config --set-debug
  npx tsx src/cli.ts config --clear-debug

Options:
  --vault <address>          Vault contract address
  --market <address>         Market ID (contract address)
  --amount <number>          Amount in token units
  --chain <chain>            Chain ID (default: eip155:56)
  --page <number>            List page
  --page-size <number>       List page size
  --sort <field>             Sort field
  --order <asc|desc>         Sort direction
  --zone <zone>              Zone filter
  --keyword <text>           Search keyword
  --assets <a,b>             Asset filter (vaults)
  --curators <a,b>           Curator filter (vaults)
  --loans <a,b>              Loan token filter (markets)
  --collaterals <a,b>        Collateral token filter (markets)
  --withdraw-all             Withdraw entire vault position
  --repay-all                Repay entire loan
  --simulate                 Show max borrowable without executing
  --simulate-supply <amt>    Show max borrowable after hypothetical supply
  --wallet-topic <topic>     WalletConnect session topic
  --wallet-address <addr>    Connected wallet address
  --address <addr>           User address for holdings query
  --scope <type>             Holdings scope: all|vault|market|selected
  --show                     Show current selection/config
  --clear                    Clear selection
  --debug                    Enable debug logs for current command
  --set-debug                Persistently enable debug logs in config
  --clear-debug              Persistently disable debug logs in config

Workflow Examples:
  Vault:
    1. holdings --address 0xUSER
    2. select --vault 0xVAULT --wallet-topic ... --wallet-address ...
    3. deposit --amount 100
    4. withdraw --amount 50

  Market:
    1. markets --chain eip155:56
    2. select --market 0xMARKET --wallet-topic ... --wallet-address ...
    3. supply --amount 1
    4. borrow --simulate
    5. borrow --amount 500
    6. repay --amount 250
    7. market-withdraw --amount 0.5

Supported Chains:
  eip155:56   BSC (default)
  eip155:1    Ethereum
`);
  process.exit(0);
}

// Route commands
async function main() {
  switch (command) {
    // Common commands
    case "config":
      await cmdConfig(configArgs);
      break;
    case "holdings":
      await cmdHoldings(holdingsArgs);
      break;
    case "select":
      await cmdSelect(selectArgs);
      break;
    case "version":
      console.log(
        JSON.stringify({
          skill: SKILL_NAME,
          version: SKILL_VERSION,
          dependencies: {
            "wallet-connect": WALLET_CONNECT_VERSION,
          },
          hint: "If version mismatch, run: npm install && npm run build",
        }),
      );
      break;

    // Vault commands
    case "vaults":
      await cmdVaults(vaultsArgs);
      break;
    case "deposit":
      await cmdDeposit(args);
      break;
    case "withdraw":
      await cmdWithdraw(args);
      break;

    // Market commands
    case "markets":
      await cmdMarkets(marketsArgs);
      break;
    case "supply":
      await cmdSupply(args);
      break;
    case "borrow":
      await cmdBorrow(args);
      break;
    case "repay":
      await cmdRepay(args);
      break;
    case "market-withdraw":
      await cmdMarketWithdraw(args);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run with --help for usage information");
      process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
