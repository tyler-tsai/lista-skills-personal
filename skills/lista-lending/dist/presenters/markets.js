import { buildMarkdownTable, formatCompactUsd, formatRatioPercent, } from "./common.js";
export function mapMarketListItem(market, index) {
    const lltv = formatRatioPercent(market.lltv);
    const liquidityUsd = formatCompactUsd(market.liquidityUsd);
    return {
        index,
        marketId: market.id,
        collateralSymbol: market.collateral,
        loanSymbol: market.loan,
        zone: market.zone,
        termType: market.termType,
        lltv: market.lltv,
        supplyApy: market.supplyApy,
        borrowRate: market.rate,
        liquidity: market.liquidity,
        liquidityUsd: market.liquidityUsd,
        vaults: market.vaults?.map((v) => v.name).join(", "),
        display: `[${index}] ${market.collateral}/${market.loan} - LLTV: ${lltv}, Liquidity: ${liquidityUsd}`,
    };
}
export function buildMarketListPresentation(items) {
    const columns = ["Collateral", "Loan", "LLTV", "Borrow Rate", "Liquidity (USD)"];
    const rows = items.map((item) => ({
        index: item.index,
        pair: `${item.collateralSymbol}/${item.loanSymbol}`,
        lltv: formatRatioPercent(item.lltv),
        borrowRate: formatRatioPercent(item.borrowRate),
        liquidityUsd: formatCompactUsd(item.liquidityUsd),
    }));
    const table = buildMarkdownTable(columns, rows.map((row) => {
        const [collateral, loan] = row.pair.split("/");
        return [collateral || "N/A", loan || "N/A", row.lltv, row.borrowRate, row.liquidityUsd];
    }));
    return {
        template: "markets_v1",
        columns,
        rows,
        markdown: table.markdown,
    };
}
