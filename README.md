# Lista Lending Agent Skills

Agent skills for [Lista Lending](https://lista.org/lending) — daily DeFi workflows on BSC and Etheruem, powered by live on-chain data.

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

| Command  | Description                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| `/lista` | Lista Lending assistant: position report, market overview, yield scan, risk check, daily digest, loop strategy |

---

## Setup

### 1. Install skills

#### Via npx skills (recommended)

```bash
# Install all skills
npx skills add lista-dao/lista-skills

# Install specific skills only
npx skills add lista-dao/lista-skills --skill lista

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
/lista 0xYourWalletAddress          # position report (default)
/lista 0xWallet1 0xWallet2          # multi-wallet
/lista                               # pick from 6 report types
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

Lista Lending (powered by the Moolah protocol) is a permissionless lending protocol on BNB Smart Chain. It features:

- **Isolated markets** — each market has its own collateral, oracle, and risk params
- **Curated vaults** — ERC4626 vaults that aggregate capital across markets
- **Smart Lending** — collateral doubles as DEX liquidity, earning trading fees
- **Fixed Rate markets** — via PT token integrations
- **Alpha / Aster Zones** — curated markets for emerging and partner assets

Learn more: [docs.bsc.lista.org](https://docs.bsc.lista.org/lista-lending/smart-contract)
