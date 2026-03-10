function toFiniteNumber(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    const parsed = Number.parseFloat(value || "0");
    return Number.isFinite(parsed) ? parsed : 0;
}
function sanitizeMarkdownCell(value) {
    return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}
export function buildMarkdownTable(columns, rows) {
    const safeRows = rows.length > 0
        ? rows
        : [columns.map(() => "N/A")];
    const escapedRows = safeRows.map((row) => row.map((cell) => sanitizeMarkdownCell(cell)));
    const header = `| ${columns.join(" | ")} |`;
    const separator = `|${columns.map(() => "---").join("|")}|`;
    const body = escapedRows.map((row) => `| ${row.join(" | ")} |`).join("\n");
    return {
        columns,
        rows: escapedRows,
        markdown: `${header}\n${separator}\n${body}`,
    };
}
export function formatChainLabel(chain) {
    switch (chain) {
        case "eip155:56":
        case "bsc":
            return "BSC";
        case "eip155:1":
        case "ethereum":
            return "Ethereum";
        default:
            return chain;
    }
}
export function formatCompactUsd(value) {
    const num = toFiniteNumber(value);
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000)
        return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000)
        return `$${(num / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000)
        return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}
export function formatRatioPercent(value, fractionDigits = 2) {
    const ratio = toFiniteNumber(value);
    return `${(ratio * 100).toFixed(fractionDigits)}%`;
}
export function formatTokenAmount(amount, symbol, fractionDigits = 4) {
    const num = toFiniteNumber(amount);
    const formatted = num.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: fractionDigits,
    });
    return `${formatted} ${symbol}`;
}
export function formatHealthValue(value) {
    const raw = typeof value === "number" ? value : Number.parseFloat(value || "");
    if (!Number.isFinite(raw)) {
        return {
            label: "Unknown",
            ratio: "0.00",
            display: "Unknown",
        };
    }
    const ratio = raw.toFixed(2);
    let label;
    if (raw >= 1.2) {
        label = "Healthy";
    }
    else if (raw >= 1.0) {
        label = "Warning";
    }
    else {
        label = "Risk";
    }
    return {
        label,
        ratio,
        display: `${label} (${ratio})`,
    };
}
