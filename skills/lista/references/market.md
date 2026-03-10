> Follow the FORMAT ENFORCEMENT rules from SKILL.md. Output must match templates character-for-character.

# Report B — Market Lending Rates

Query real-time Supply APY and Borrow APY for each lending market.

## B.1 — Fetch data

```
lista_get_borrow_markets({ pageSize: 50, chain: "<chain>" })
```

Default returns Classic (zone=0) + Smart Lending (zone=3) markets. To include Alpha and Aster, pass `zone: "0,1,3,4"`.

Returns per market:
- `id` — market identifier
- `collateral` / `loan` — asset symbols
- `supplyApy` — supply-side APY (decimal, 0.087 = 8.7%)
- `rate` — borrow-side APY (decimal)
- `liquidity` — available liquidity (token amount)
- `liquidityUsd` — available liquidity in USD
- `zone` — 0=Classic, 1=Alpha, 3=Smart Lending, 4=Aster
- `smartCollateralConfig` — non-empty for Smart Lending markets (zone=3)
- `termType` — 0 = variable, non-zero = fixed rate
- `lltv` — liquidation LTV

If user asks about a specific asset (e.g. "USDT rate", "BNB 利率"), pass `keyword` parameter to filter.

## B.2 — Compute

Build a deduplicated market list. Each market appears once with:
- `collateral / loan` — market name
- `supplyApy` — supply-side APY (decimal → %)
- `rate` — borrow-side APY (decimal → %)
- `liquidityUsd` — available liquidity in USD
- `utilization` — compute as: `borrow / (liquidity + borrow)` where `liquidity` = available to borrow, `borrow` = already borrowed

Sort by liquidityUsd descending (largest markets first).

Flag special market types:
- Smart Lending: `smartCollateralConfig` is non-empty → append `⚡`
- Fixed Rate: `termType != 0` → append `🔒`
- High utilization: `utilization > 0.85` → append `🔥`

## B.3 — Output template

⛔ STOP BEFORE OUTPUTTING. You MUST copy the template below character-for-character. Substitute `<placeholder>` values with real data. Change NOTHING else — no bullet points, no overview section, no preamble, no trailing remarks. Your response must start with the exact first line shown in the template.

### English

```
📋 Lista Lending — Market Rates
<YYYY-MM-DD HH:MM> UTC  |  <NETWORK>
━━━━━━━━━━━━━━━━━━━━━━━━━

| Market | Supply APY | Borrow APY | Liquidity | Util |
|--------|------------|------------|-----------|------|
| slisBNB / WBNB ⚡ | 3.2% | 5.8% | ＄4.1M | 72% |
| BTCB / U | 2.8% | 4.6% | ＄12.3M | 41% |
| WBNB / USD1 | 4.1% | 7.2% | ＄2.8M | 68% |
| PT-slisBNBx / WBNB 🔒 | 5.8% | — | ＄1.2M | 89% 🔥 |
| slisBNB & BNB / USD1 ⚡ | 1.4% | 3.9% | ＄3.5M | 55% |
| ETH / USD1 | 1.9% | 4.2% | ＄800K | 38% |

━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ Smart Lending  |  🔒 Fixed Rate  |  🔥 High Utilization (>85%)

Data: <DATA_SOURCE>  |  <NETWORK>
```

Notes:
- One row per market.
- Fixed Rate markets show `—` for Borrow APY (no borrowing).
- If user filtered by asset, show only matching markets and replace title with: `📋 Lista Lending — <ASSET> Market Rates`.

### 繁體中文

```
📋 Lista Lending — 市場借貸利率
<YYYY-MM-DD HH:MM> UTC  |  <NETWORK>
━━━━━━━━━━━━━━━━━━━━━━━━━

| 市場 | 供款年化 | 借款年化 | 流動性 | 利用率 |
|------|----------|----------|--------|--------|
| slisBNB / WBNB ⚡ | 3.2% | 5.8% | ＄4.1M | 72% |
| BTCB / U | 2.8% | 4.6% | ＄12.3M | 41% |
| WBNB / USD1 | 4.1% | 7.2% | ＄2.8M | 68% |
| PT-slisBNBx / WBNB 🔒 | 5.8% | — | ＄1.2M | 89% 🔥 |
| slisBNB & BNB / USD1 ⚡ | 1.4% | 3.9% | ＄3.5M | 55% |
| ETH / USD1 | 1.9% | 4.2% | ＄800K | 38% |

━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ Smart Lending  |  🔒 固定利率  |  🔥 高利用率（>85%）

資料來源：<DATA_SOURCE>  |  <NETWORK>
```
