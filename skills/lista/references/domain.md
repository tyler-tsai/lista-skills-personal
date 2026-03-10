> Follow the FORMAT ENFORCEMENT rules from SKILL.md. Output must match templates character-for-character.

# Shared Domain Logic

Referenced by Reports A, D, E, F for position discovery, price fetching, and metric computation.

## Step 1 — Fetch position data (MCP)

Call two MCP tools:

```
lista_get_position({ wallet: "<address>", chain: "<chain>" })
```

Returns three sections:

- **holdings.objs[]** — active markets with metadata:
  - `marketId`, `collateralSymbol`, `loanSymbol`, `collateralPrice`, `loanPrice` (USD), `zone`, `termType`
- **collaterals[]** — per-market collateral:
  - `address` (marketId), `amount` (human-readable), `usdValue`
- **borrows[]** — per-market debt (pre-computed, not raw shares):
  - `address` (marketId), `assetSymbol`, `collateralSymbol`, `amount` (human-readable), `usdValue`

Then fetch LLTV for each active market. The `keyword` parameter filters by **loan token
name** — use each unique `loanSymbol` from holdings to fetch only relevant markets:

```
# Preferred: one call per unique loan token (loanSymbol from holdings[].loanSymbol)
lista_get_borrow_markets({ keyword: "<loanSymbol>", pageSize: 50, chain: "<chain>" })
```

Each market has `id` and `lltv` (decimal string, e.g. "0.860000000000000000"). Match
by `id` to the user's active market IDs from holdings.

If a market is still not found (e.g. unusual loan token), fall back to unfiltered
pagination:

```
lista_get_borrow_markets({ pageSize: 50, page: 1, chain: "<chain>" })
lista_get_borrow_markets({ pageSize: 50, page: 2, chain: "<chain>" })   # if needed
lista_get_borrow_markets({ pageSize: 50, page: 3, chain: "<chain>" })   # if needed
```

Stop paginating once all active market LLTVs are found.

**moolah.js fallback** (if MCP is unavailable):
```bash
node skills/lista/scripts/moolah.js --chain <bsc|eth> params <marketId>
# Returns: loanToken, collateralToken, oracle, irm, lltv, lltvPct
```

Smart Lending detection: `collateralSymbol` contains `&` (e.g. "slisBNB & BNB"). Label as `slisBNB/BNB LP` in output.

## Token price resolution

**Stablecoins** (U, USD1, USDT, USDC, lisUSD): use `P = 1.00` directly — skip all calls.

For other tokens, try in order until one succeeds:

1. **Position data** (if user has an active position in the market):
   ```
   lista_get_position({ wallet: "<address>", chain: "<chain>" })
   ```
   Use `holdings[].collateralPrice` / `loanPrice` for the matching `marketId`.

2. **MCP oracle** (supports ERC20, LST, and Smart Lending LP tokens):
   ```
   lista_get_oracle_price({ tokenAddress: <tokenAddress> })
   ```
   Use the returned `price` if `found: true`.

3. **moolah.js** (last resort — only if MCP is unavailable):
   ```bash
   node skills/lista/scripts/moolah.js --chain <bsc|eth> token-price <tokenAddress>
   node skills/lista/scripts/moolah.js --chain <bsc|eth> lp-price <marketId>   # Smart Lending LP
   ```

## Zone definitions

| Zone | ID | Description |
|---|---|---|
| Classic | 0 | Audited, standard risk |
| Alpha | 1 | Higher risk/reward, emerging assets |
| Smart Lending | 3 | LP collateral (DEX liquidity + lending) |
| Aster | 4 | Partner assets |

**MCP zone filter support:**
- `lista_get_lending_vaults({ zone: 0 })` — filter vaults by zone. Default: all zones.
- `lista_get_borrow_markets({ zone: "0,3" })` — filter markets by zone. Default: `"0,3"` (Classic + Smart Lending). Pass `"0,1,3,4"` to include Alpha and Aster.

## Step 2 — Metric computation

All amounts from MCP are human-readable (not raw 1e18). No precision conversion needed.

**Rounding (apply before display):** Round all token amounts, USD values, percentages, and health factor to 2 decimal places. Never display the raw MCP precision in output.

For each market, join data by `marketId`:

```
collateralAmount   = collaterals[].amount
collateralUSD      = collaterals[].usdValue
debtAmount         = borrows[].amount          (0 if no borrow entry)
debtUSD            = borrows[].usdValue        (0 if no borrow entry)
collateralPrice    = holdings[].collateralPrice
loanPrice          = holdings[].loanPrice
lltv               = borrow_markets[].lltv     (match by market id)

netEquityUSD       = collateralUSD − debtUSD

LTV                = debtUSD / collateralUSD
healthFactor       = lltv / LTV                       (when LTV > 0)
liqPriceUSD        = debtUSD / (collateralAmount × lltv)
buffer             = (collateralPrice − liqPriceUSD) / collateralPrice
```

## Correlated asset pairs

Asset families:
- USD stable: USD1, U, USDT, USDC, DAI, FDUSD, BUSD
- BNB / BNB-LST: BNB, WBNB, slisBNB, wstBNB, ankrBNB, BNBx
- ETH / ETH-LST: ETH, WETH, wstETH, stETH, rETH
- BTC: BTCB, WBTC, BTC

A position is **correlated** when collateral and loan are in the same family. For LP: both component tokens AND loan must be in the same family.

## Risk level assignment

**Uncorrelated (standard):**
- 🟢 SAFE — LTV / lltv < 80%
- 🟡 WARNING — 80% ≤ LTV / lltv < 90%
- 🔴 DANGER — LTV / lltv ≥ 90%

**Correlated (adjusted):**
- 🟢 SAFE — LTV / lltv < 92%
- 🟡 WARNING — 92% ≤ LTV / lltv < 97%
- 🔴 DANGER — LTV / lltv ≥ 97%

Append "(correlated)" / "(相關對)" for correlated positions.

**Health factor display:** HF >= 1.2 → ✅, HF < 1.2 → ⚠️

**Dust filter:** Skip positions where both collateralUSD < $1 AND debtUSD < $1.

**Supply-only:** Skip debt, LTV, and liquidation rows.
