import type { ApiMarketPosition, ApiVaultPosition } from "../types/lista-api.js";
export interface HoldingsSummary {
    vaultCount: number;
    marketCount: number;
    actionableMarketCount: number;
    unsupportedMarketCount: number;
}
export interface HoldingsVaultRow {
    vault: string;
    chain: string;
    deposited: string;
    depositedUsd: string;
    apy: string;
    walletBalance: string;
}
export interface HoldingsActionableMarketRow {
    market: string;
    chain: string;
    collateralUsd: string;
    borrowedUsd: string;
    ltv: string;
    health: string;
}
export interface HoldingsUnsupportedMarketRow {
    market: string;
    chain: string;
    reason: string;
    collateralUsd: string;
    borrowedUsd: string;
}
export interface HoldingsPresentation {
    template: "holdings_v1";
    summary: HoldingsSummary;
    vaultTable: {
        columns: string[];
        rows: HoldingsVaultRow[];
        markdown: string;
    };
    actionableMarketTable: {
        columns: string[];
        rows: HoldingsActionableMarketRow[];
        markdown: string;
    };
    unsupportedMarketTable: {
        columns: string[];
        rows: HoldingsUnsupportedMarketRow[];
        markdown: string;
    };
    markdown: string;
}
export declare function buildHoldingsPresentation(params: {
    vaults: ApiVaultPosition[];
    markets: ApiMarketPosition[];
}): HoldingsPresentation;
