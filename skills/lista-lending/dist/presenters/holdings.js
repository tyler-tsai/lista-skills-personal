import { buildMarkdownTable, formatChainLabel, formatCompactUsd, formatHealthValue, formatRatioPercent, formatTokenAmount, } from "./common.js";
function getUnsupportedReason(position) {
    if (position.isSmartLending)
        return "SmartLending";
    if (position.isFixedTerm)
        return "Fixed-term";
    return "Unsupported";
}
function mapVaultRow(position) {
    return {
        vault: position.vaultName,
        chain: formatChainLabel(position.chain),
        deposited: formatTokenAmount(position.deposited, position.assetSymbol),
        depositedUsd: formatCompactUsd(position.depositedUsd),
        apy: formatRatioPercent(position.apy),
        walletBalance: formatTokenAmount(position.walletBalance, position.assetSymbol),
    };
}
function mapActionableMarketRow(position) {
    const health = formatHealthValue(position.health);
    return {
        market: `${position.collateralSymbol} -> ${position.loanSymbol}`,
        chain: formatChainLabel(position.chain),
        collateralUsd: formatCompactUsd(position.collateralUsd),
        borrowedUsd: formatCompactUsd(position.borrowedUsd),
        ltv: formatRatioPercent(position.ltv),
        health: health.display,
    };
}
function mapUnsupportedMarketRow(position) {
    return {
        market: `${position.collateralSymbol} -> ${position.loanSymbol}`,
        chain: formatChainLabel(position.chain),
        reason: getUnsupportedReason(position),
        collateralUsd: formatCompactUsd(position.collateralUsd),
        borrowedUsd: formatCompactUsd(position.borrowedUsd),
    };
}
export function buildHoldingsPresentation(params) {
    const { vaults, markets } = params;
    const actionableMarkets = markets.filter((market) => market.isActionable);
    const unsupportedMarkets = markets.filter((market) => !market.isActionable);
    const summary = {
        vaultCount: vaults.length,
        marketCount: markets.length,
        actionableMarketCount: actionableMarkets.length,
        unsupportedMarketCount: unsupportedMarkets.length,
    };
    const vaultColumns = [
        "Vault",
        "Chain",
        "Deposited",
        "Deposited USD",
        "APY",
        "Wallet Balance",
    ];
    const vaultRows = vaults.map(mapVaultRow);
    const vaultTable = buildMarkdownTable(vaultColumns, vaultRows.map((row) => [
        row.vault,
        row.chain,
        row.deposited,
        row.depositedUsd,
        row.apy,
        row.walletBalance,
    ]));
    const actionableColumns = [
        "Market",
        "Chain",
        "Collateral USD",
        "Borrowed USD",
        "LTV",
        "Health",
    ];
    const actionableRows = actionableMarkets.map(mapActionableMarketRow);
    const actionableTable = buildMarkdownTable(actionableColumns, actionableRows.map((row) => [
        row.market,
        row.chain,
        row.collateralUsd,
        row.borrowedUsd,
        row.ltv,
        row.health,
    ]));
    const unsupportedColumns = [
        "Market",
        "Chain",
        "Reason",
        "Collateral USD",
        "Borrowed USD",
    ];
    const unsupportedRows = unsupportedMarkets.map(mapUnsupportedMarketRow);
    const unsupportedTable = buildMarkdownTable(unsupportedColumns, unsupportedRows.map((row) => [
        row.market,
        row.chain,
        row.reason,
        row.collateralUsd,
        row.borrowedUsd,
    ]));
    const markdown = [
        "Summary",
        `- Vault Count: ${summary.vaultCount}`,
        `- Market Count: ${summary.marketCount}`,
        `- Actionable Market Count: ${summary.actionableMarketCount}`,
        `- Unsupported Market Count: ${summary.unsupportedMarketCount}`,
        "",
        "Vault Positions",
        vaultTable.markdown,
        "",
        "Actionable Market Positions",
        actionableTable.markdown,
        "",
        "Unsupported Market Positions",
        unsupportedTable.markdown,
    ].join("\n");
    return {
        template: "holdings_v1",
        summary,
        vaultTable: {
            columns: vaultColumns,
            rows: vaultRows,
            markdown: vaultTable.markdown,
        },
        actionableMarketTable: {
            columns: actionableColumns,
            rows: actionableRows,
            markdown: actionableTable.markdown,
        },
        unsupportedMarketTable: {
            columns: unsupportedColumns,
            rows: unsupportedRows,
            markdown: unsupportedTable.markdown,
        },
        markdown,
    };
}
