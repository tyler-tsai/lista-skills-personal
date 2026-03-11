/**
 * Token registry -- centralized metadata for ERC-20 tokens (ETH + BSC only).
 */
export const TOKENS = {
    // Ethereum tokens
    USDC: {
        name: "USD Coin",
        decimals: 6,
        addresses: {
            "eip155:1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            "eip155:56": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        },
    },
    USDT: {
        name: "Tether USD",
        decimals: 6,
        addresses: {
            "eip155:1": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            "eip155:56": "0x55d398326f99059fF775485246999027B3197955",
        },
    },
    WETH: {
        name: "Wrapped Ether",
        decimals: 18,
        addresses: {
            "eip155:1": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        },
    },
    DAI: {
        name: "Dai Stablecoin",
        decimals: 18,
        addresses: {
            "eip155:1": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        },
    },
    WBTC: {
        name: "Wrapped Bitcoin",
        decimals: 8,
        addresses: {
            "eip155:1": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
        },
    },
    // BSC tokens
    WBNB: {
        name: "Wrapped BNB",
        decimals: 18,
        addresses: {
            "eip155:56": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        },
    },
    BTCB: {
        name: "Bitcoin BEP2",
        decimals: 18,
        addresses: {
            "eip155:56": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
        },
    },
    USD1: {
        name: "USD1 Stablecoin",
        decimals: 18,
        addresses: {
            "eip155:56": "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
        },
    },
};
export function getTokenAddress(symbol, chainId) {
    return TOKENS[symbol]?.addresses?.[chainId] || null;
}
export function getTokenDecimals(symbol) {
    return TOKENS[symbol]?.decimals ?? 18;
}
export function getTokensForChain(chainId) {
    const result = [];
    for (const [symbol, token] of Object.entries(TOKENS)) {
        if (token.addresses[chainId]) {
            result.push({ symbol, ...token, address: token.addresses[chainId] });
        }
    }
    return result;
}
