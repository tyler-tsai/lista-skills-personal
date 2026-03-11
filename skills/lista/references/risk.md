> Follow the FORMAT ENFORCEMENT rules from SKILL.md. Output must match templates character-for-character.

# Report D — Risk Check

Check all positions for liquidation risk and flag those approaching thresholds.

## D.1 — Fetch positions and compute metrics

Same as Report A steps A.1–A.2. Use `references/domain.md` for MCP data fetching and metric computation.

**Fallback — moolah.js** (if MCP unavailable):
```bash
node skills/lista/scripts/moolah.js --chain <bsc|eth> dashboard <address>
```

Follow the fallback chain in `domain.md`. Position data requires MCP or moolah.js — curl alone cannot serve this report.

## D.2 — Apply alert thresholds

For each position with debt > 0 (i.e. `borrows[].amount > 0`), apply the unified alert thresholds from `references/domain.md` § "Alert thresholds".

## D.3 — Output template

⛔ STOP BEFORE OUTPUTTING. You MUST copy the template below character-for-character. Substitute `<placeholder>` values with real data. Change NOTHING else — no bullet points, no overview section, no preamble, no trailing remarks. Your response must start with the exact first line shown in the template.

Show alert-flagged positions first, then safe positions in compact format.

### English — alert triggered

```
🚨 Lista Liquidation Alert
━━━━━━━━━━━━━━━━━━━━━━━━━
Wallet: 0xAbCd...5678

#1 slisBNB / WBNB
─────────────────────
Collateral: 2.50 slisBNB (~＄1,450)
Debt: 1.89 WBNB (~＄1,300)
Current LTV: 89.6% / LLTV: 90.0%
LTV gap: 0.4% — below threshold (0.5%)

Liq. price: ＄532.40 / slisBNB (current: ＄580.00)
Distance: ＄47.60 (8.2%)

Action: Add collateral or repay debt immediately.
Repay ~0.15 WBNB to bring LTV to 80%.
━━━━━━━━━━━━━━━━━━━━━━━━━
```

### English — all clear

```
✅ Lista Position Check — All Clear
━━━━━━━━━━━━━━━━━━━━━━━━━
Wallet: 0xAbCd...5678
<YYYY-MM-DD HH:MM> UTC

No positions approaching liquidation.

- - - - -

#1  BTCB / U
LTV / LLTV: 47.1% / 86.0%
LTV gap: 38.9%


#2  ETH / USD1
LTV / LLTV: 37.4% / 80.0%
LTV gap: 42.6%

- - - - -

━━━━━━━━━━━━━━━━━━━━━━━━━
Threshold: LLTV >= 90% → gap 0.5% | LLTV < 90% → gap 5%

Data: <DATA_SOURCE> | <NETWORK>
```

### 繁體中文 — 觸發預警

```
🚨 Lista 清算預警
━━━━━━━━━━━━━━━━━━━━━━━━━
錢包：0xAbCd...5678

#1 slisBNB / WBNB
─────────────────────
抵押品：2.50 slisBNB（約 ＄1,450）
負債：1.89 WBNB（約 ＄1,300）
當前 LTV：89.6% / 清算線：90.0%
LTV 差距：0.4% ⚠️ 低於預警閾值（0.5%）

清算觸發價格：＄532.40 / slisBNB（當前價：＄580.00）
距離清算：＄47.60（8.2%）

操作建議：立即補充抵押品或償還部分借款。
償還約 0.15 WBNB 可將 LTV 降至 80%。
━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 繁體中文 — 全部正常

```
✅ Lista 持倉檢查 — 全部正常
━━━━━━━━━━━━━━━━━━━━━━━━━
錢包：0xAbCd...5678
<YYYY-MM-DD HH:MM> UTC

沒有持倉接近清算線。

- - - - -

#1  BTCB / U
LTV / 清算線：47.1% / 86.0%
LTV 差距：38.9%


#2  ETH / USD1
LTV / 清算線：37.4% / 80.0%
LTV 差距：42.6%

- - - - -

━━━━━━━━━━━━━━━━━━━━━━━━━
預警閾值：LLTV >= 90% → 差距 0.5% | LLTV < 90% → 差距 5%

資料來源：<DATA_SOURCE> | <NETWORK>
```

## D.4 — Threshold customization

- "change threshold to X%" / "把閾值改成 X%" → update immediately, no confirmation.
- "restore default" / "恢復預設" → reset to system defaults.

## D.5 — Push notification setup

If user says "enable alerts" / "開啟告警" / "开启告警":

> **EN:** Would you like to set a custom alert threshold first? Default: LLTV >= 90% → gap 0.5%, LLTV < 90% → gap 5%.
> **中文：** 是否需要先設定自訂預警閾值？預設：LLTV >= 90% → 差距 0.5%，LLTV < 90% → 差距 5%。

After threshold is confirmed (or user accepts default):

> **EN:** Which channel? 1) Telegram  2) Discord
> **中文：** 推送渠道？1) Telegram  2) Discord

After channel is selected:

> **EN:** Done. Alerts will be sent via [channel] when any position crosses the threshold.
> **中文：** 已設置。當任何持倉觸及預警閾值時，系統將透過 [渠道] 通知你。

If user says "cancel alerts" / "disable alerts" / "取消推送" / "關閉告警" / "关闭告警":

> **EN:** Alerts have been disabled. You can re-enable anytime with "enable alerts".
> **中文：** 已關閉推送告警。隨時可輸入「開啟告警」重新啟用。
