> Follow the FORMAT ENFORCEMENT rules from SKILL.md. Output must match templates character-for-character.

# Report A — Position Report

Generates a full position report with collateral, debt, health factor, LTV, liquidation price, and strategy recommendations.

## A.1 — Fetch position data

Run once per address using MCP:

```
lista_get_position({ wallet: "<address>" })
```

Returns `holdings.objs[]` (active markets with `marketId`, `collateralSymbol`, `loanSymbol`, `collateralPrice`, `loanPrice`, `zone`, `termType`), `collaterals[]` (per-market amount/usdValue), and `borrows[]` (per-market pre-computed debt amount/usdValue).

If `holdings.objs` is empty → "No active positions."

Then fetch LLTV per unique loan token — use `keyword` to avoid fetching all 100+ markets:

```
lista_get_borrow_markets({ keyword: "<loanSymbol>", pageSize: 50 })
```

Match each returned market by `id` to the user's active market IDs. Use the `lltv` field. If a market is not found on page 1, paginate with `page: 2`.

## A.2 — Compute metrics

Join data by marketId and compute per `references/domain.md`. Amounts are human-readable — no 1e18 conversion needed.

## A.3 — Recommendations

Generate 1–3 concise suggestions per address based on actual numbers:

**Risk reduction (uncorrelated):**
- LTV/LLTV >= 90% (DANGER): Repay debt or add collateral. Show amounts to reach 75% LTV/LLTV.
- LTV/LLTV 80–90% (WARNING): Partial repayment or top-up. Amounts to reach 70% LTV/LLTV.

**Risk reduction (correlated):**
- LTV/LLTV >= 97% (DANGER): Immediate debt reduction. Amounts to reach 85% LTV/LLTV.
- LTV/LLTV 92–97% (WARNING): Monitor collateral/loan price ratio. Real risk = depeg event.

**Yield enhancement (low LTV):**
- LTV/LLTV < 50% (uncorrelated) or < 75% (correlated): Suggest leveraging via /lista-loop.
- Supply-only: Mention borrowing to amplify yield.

## A.4 — Output template

⛔ STOP BEFORE OUTPUTTING. You MUST copy the template below character-for-character. Substitute `<placeholder>` values with real data. Change NOTHING else — no bullet points, no overview section, no preamble, no trailing remarks. Your response must start with the exact first line shown in the template.

### English

```
Lista Lending — Position Report
Generated: <YYYY-MM-DD HH:MM> UTC  |  <NETWORK>
━━━━━━━━━━━━━━━━━━━━━━━━━

Address 1: 0xAbCd…5678

| # | Market | Risk | Collateral | Debt | Net Equity | HF | LTV / LLTV | Liq. Price |
|---|--------|------|------------|------|------------|----|------------|------------|
| 1 | BTCB / U | 🟢 SAFE | 398.85 BTCB (~＄38.25M) | 18,020,988 U (~＄18.02M) | ~＄20.23M | 1.83 ✅ | 47.1% / 86.0% | BTCB < ＄52,500 (now ＄96,000) |
| 2 | slisBNB/BNB LP / BNB | 🟢 SAFE (correlated) | 120.00 LP (~＄78,143) | 50.00 BNB (~＄34,550) | ~＄43,593 | 1.95 ✅ | 44.2% / 86.0% | LP < ＄335 (now ＄651.19) |

Address 1 summary: 2 active positions  |  Net equity ~＄20.2M

Recommendations:
  1. LTV is comfortable — consider /lista-loop to amplify yield.

━━━━━━━━━━━━━━━━━━━━━━━━━

Total: <N> addresses  |  <M> active positions  |  Combined net equity ~＄X

Data: <DATA_SOURCE>  |  <NETWORK>
```

Notes:
- Supply-only positions: Debt, HF, LTV, Liq. Price columns show `—`.
- LP collateral: show LP price in the Collateral column, e.g. `120.00 LP (~＄78,143 @ ＄651.19/LP)`.
- If user filtered by asset, replace title with: `Lista Lending — <ASSET> Position Report`.

### 繁體中文

```
Lista Lending — 持倉報告
產生時間：<YYYY-MM-DD HH:MM> UTC  |  <NETWORK>
━━━━━━━━━━━━━━━━━━━━━━━━━

地址 1：0xAbCd…5678

| # | 市場 | 風險 | 抵押品 | 負債 | 淨資產 | 健康係數 | LTV / 清算線 | 清算價格 |
|---|------|------|--------|------|--------|----------|-------------|----------|
| 1 | BTCB / U | 🟢 安全 | 398.85 BTCB（約 ＄38.25M） | 18,020,988 U（約 ＄18.02M） | 約 ＄20.23M | 1.83 ✅ | 47.1% / 86.0% | BTCB < ＄52,500（現 ＄96,000） |
| 2 | slisBNB/BNB LP / BNB | 🟢 安全（相關對） | 120.00 LP（約 ＄78,143） | 50.00 BNB（約 ＄34,550） | 約 ＄43,593 | 1.95 ✅ | 44.2% / 86.0% | LP < ＄335（現 ＄651.19） |

地址 1 小結：2 個活躍持倉  |  淨資產約 ＄20.2M

持倉建議：
  1. LTV 尚在安全範圍，可考慮使用 /lista-loop 提高槓桿收益。

━━━━━━━━━━━━━━━━━━━━━━━━━

總計：<N> 個地址  |  <M> 個活躍持倉  |  合計淨資產約 ＄X

資料來源：<DATA_SOURCE>  |  <NETWORK>
```
