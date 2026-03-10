import type { ApiMarketItem } from "../types/lista-api.js";
export interface MarketListOutputItem {
    index: number;
    marketId: string;
    collateralSymbol: string;
    loanSymbol: string;
    zone: number;
    termType: number;
    lltv: string;
    supplyApy: string;
    borrowRate: string;
    liquidity: string;
    liquidityUsd: string;
    vaults: string;
    display: string;
}
export interface MarketListPresentationRow {
    index: number;
    pair: string;
    lltv: string;
    borrowRate: string;
    liquidityUsd: string;
}
export interface MarketListPresentation {
    template: "markets_v1";
    columns: string[];
    rows: MarketListPresentationRow[];
    markdown: string;
}
export declare function mapMarketListItem(market: ApiMarketItem, index: number): MarketListOutputItem;
export declare function buildMarketListPresentation(items: MarketListOutputItem[]): MarketListPresentation;
