export interface MarkdownTable {
    columns: string[];
    rows: string[][];
    markdown: string;
}
export declare function buildMarkdownTable(columns: string[], rows: string[][]): MarkdownTable;
export declare function formatChainLabel(chain: string): string;
export declare function formatCompactUsd(value: string | number): string;
export declare function formatRatioPercent(value: string | number, fractionDigits?: number): string;
export declare function formatTokenAmount(amount: string | number, symbol: string, fractionDigits?: number): string;
export declare function formatHealthValue(value: string | number): {
    label: "Healthy" | "Warning" | "Risk" | "Unknown";
    ratio: string;
    display: string;
};
