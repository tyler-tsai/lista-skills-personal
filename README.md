# Lista Lending Agent Skills

Agent skills for [Lista Lending](https://lista.org/lending) — daily DeFi workflows on BSC and Ethereum, powered by live on-chain data.

## What this is

A set of agent skills (slash commands) that give any LLM tool a full DeFi analyst for Lista Lending. Connect the MCP server once, install the skill, and your agent can answer questions about your positions, markets, and yield opportunities using live on-chain data — no custom backend required.

Coverage:

- **Position Report** — collateral, debt, health factor, LTV, liquidation price, recommendations
- **Market Overview** — TVL, lending rates, top vaults, high-utilization markets
- **Yield Opportunities** — best deposit APY across vaults
- **Risk Check** — liquidation risk alerts with configurable thresholds
- **Daily Digest** — positions + yield + market snapshot in one report
- **Loop Strategy** — leverage loop simulation, net APY, liquidation risk

## Skills

| Command | Description |
| -------- | ----------- |
| `/lista` | Read-only reporting assistant: position report, market overview, yield scan, risk check, daily digest, loop strategy |
| `/lista-lending` | Lending-specific query and operations: holdings, vault/market list, deposit, withdraw, supply, borrow, repay |
| `/lista-wallet-connect` | WalletConnect bridge: pair wallet, auth/sign, and transaction request flow |

## Routing Rules

Use this priority order to avoid conflicts between skills:

1. Wallet/session/signing intent (`connect wallet`, `pair`, `auth`, `sign`, `topic`, `session`) → `/lista-wallet-connect`
2. Lending operation intent (`deposit`, `withdraw`, `supply`, `borrow`, `repay`, `execute`) → `/lista-lending`
3. Lending portfolio intent with actionable context (`my lending holdings`, `my vaults`, `my lending markets`) → `/lista-lending`
4. Report/analysis intent (`position report`, `risk check`, `daily digest`, `loop strategy`, high-level rates/yield scan) → `/lista`

Ambiguous request handling:

- `check my positions`: default to `/lista` report view unless user explicitly asks lending-only or operation follow-up.
- `market list` / `vault list`: use `/lista-lending` when user plans to act or filter/select targets; use `/lista` for high-level rate/yield narrative only.

---

## Setup

### 1. Install skills

#### Via npx skills (recommended)

```bash
# Install all skills
npx skills add lista-dao/lista-skills

# Install specific skills only
npx skills add lista-dao/lista-skills --skill lista
npx skills add lista-dao/lista-skills --skill lista-lending
npx skills add lista-dao/lista-skills --skill lista-wallet-connect

# List available skills first
npx skills add lista-dao/lista-skills --list

# Install globally (available across all projects)
npx skills add lista-dao/lista-skills -g
```

Supports: Codex, Cursor, OpenCode, Gemini CLI, and 30+ more agents.

#### Via add-skill (alternative)

```bash
npx add-skill lista-dao/lista-skills
```

### 2. Connect the Lista MCP server (optional)

Skills work out of the box via the Lista REST API. For richer live data, connect the MCP server to your LLM tool:

- Streamable HTTP: `https://mcp.lista.org/mcp`
- SSE: `https://mcp.lista.org/sse`

---

## Usage

```
/lista 0xYourWalletAddress                   # report-first assistant (default)
/lista 0xWallet1 0xWallet2                   # multi-wallet report
/lista-lending holdings --address 0xYourWalletAddress
/lista-lending markets --chain eip155:56
/lista-wallet-connect pair --chains eip155:56,eip155:1
```

Language and wallet address are saved locally (`~/.lista/`) on first run — no need to re-enter.

## How It Works

Each skill is a plain markdown prompt file. The LLM loads the relevant skill and fetches live data using **Lista MCP tools**:

1. **`lista_get_position`** — wallet positions, collateral, debt, prices
2. **`lista_get_borrow_markets`** — market rates, LLTV, liquidity, supply APY
3. **`lista_get_lending_vaults`** — vault APY, TVL, per-market allocation weights
4. **`lista_get_oracle_price`** — token and LP price (ERC20, LST, Smart Lending LP)
5. **`lista_get_staking_info`** — slisBNB / BNB-LST native staking yield

No backend infrastructure required. When MCP is unavailable, skills fall back to `skills/lista/scripts/moolah.js` — a self-contained Node.js script (no `npm install`) that hits the Lista REST API directly.

SKILL.md uses progressive disclosure: it's a compact orchestrator that dispatches to reference files in `references/` on demand, so the LLM only loads what it needs for the selected report type.

## About Lista Lending

Lista Lending (powered by the Moolah protocol) is a permissionless lending protocol across BNB Smart Chain and Ethereum. It features:

- **Isolated markets** — each market has its own collateral, oracle, and risk params
- **Curated vaults** — ERC4626 vaults that aggregate capital across markets
- **Smart Lending** — collateral doubles as DEX liquidity, earning trading fees
- **Fixed Rate markets** — via PT token integrations
- **Alpha / Aster Zones** — curated markets for emerging and partner assets

Learn more: [docs.bsc.lista.org](https://docs.bsc.lista.org/lista-lending/smart-contract)
