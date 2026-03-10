import type { ApiVaultItem } from "../types/lista-api.js";
export interface VaultListOutputItem {
    index: number;
    address: string;
    name: string;
    asset: string;
    assetAddress: string;
    decimals: number;
    tvl: string;
    apy: string;
    curator: string;
    display: string;
}
export interface VaultListPresentationRow {
    index: number;
    vault: string;
    asset: string;
    tvlUsd: string;
    apy: string;
    curator: string;
}
export interface VaultListPresentation {
    template: "vaults_v1";
    columns: string[];
    rows: VaultListPresentationRow[];
    markdown: string;
}
export declare function mapVaultListItem(vault: ApiVaultItem, index: number): VaultListOutputItem;
export declare function buildVaultListPresentation(items: VaultListOutputItem[]): VaultListPresentation;
