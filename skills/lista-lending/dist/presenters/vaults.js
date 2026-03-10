import { buildMarkdownTable, formatCompactUsd, formatRatioPercent, } from "./common.js";
export function mapVaultListItem(vault, index) {
    const tvlUsd = formatCompactUsd(vault.depositsUsd);
    const apy = formatRatioPercent(vault.apy);
    return {
        index,
        address: vault.address,
        name: vault.name,
        asset: vault.assetSymbol,
        assetAddress: vault.asset,
        decimals: vault.displayDecimal,
        tvl: vault.depositsUsd,
        apy: vault.apy,
        curator: vault.curator,
        display: `[${index}] ${vault.name} (${vault.assetSymbol}) - TVL: ${tvlUsd}, APY: ${apy}`,
    };
}
export function buildVaultListPresentation(items) {
    const columns = ["Vault", "Asset", "TVL (USD)", "APY", "Curator"];
    const rows = items.map((item) => ({
        index: item.index,
        vault: item.name,
        asset: item.asset,
        tvlUsd: formatCompactUsd(item.tvl),
        apy: formatRatioPercent(item.apy),
        curator: item.curator || "N/A",
    }));
    const table = buildMarkdownTable(columns, rows.map((row) => [row.vault, row.asset, row.tvlUsd, row.apy, row.curator]));
    return {
        template: "vaults_v1",
        columns,
        rows,
        markdown: table.markdown,
    };
}
