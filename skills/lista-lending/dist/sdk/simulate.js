import { Decimal, simulateMarketBorrow, simulateMarketRepay, } from "@lista-dao/moolah-sdk-core";
export function toMarketSimulationState(marketExtraInfo) {
    return {
        totalSupply: marketExtraInfo.totalSupply,
        totalBorrow: marketExtraInfo.totalBorrow,
        LLTV: marketExtraInfo.LLTV,
        priceRate: marketExtraInfo.priceRate,
        loanDecimals: marketExtraInfo.loanInfo.decimals,
        collateralDecimals: marketExtraInfo.collateralInfo.decimals,
    };
}
export function simulateBorrowLoanableAfterSupply(marketExtraInfo, userData, supplyAssets) {
    const marketState = toMarketSimulationState(marketExtraInfo);
    const simulation = simulateMarketBorrow({
        supplyAmount: new Decimal(supplyAssets, userData.decimals.c),
        borrowAmount: new Decimal(0n, marketState.loanDecimals),
        userPosition: {
            collateral: userData.collateral,
            borrowed: userData.borrowed,
        },
        marketState,
    });
    return simulation.baseLoanable;
}
export function simulateRepayPosition(marketExtraInfo, userData, repayAmount, repayAll) {
    const marketState = toMarketSimulationState(marketExtraInfo);
    return simulateMarketRepay({
        repayAmount,
        withdrawAmount: new Decimal(0n, marketState.collateralDecimals),
        isRepayAll: repayAll,
        userPosition: {
            collateral: userData.collateral,
            borrowed: userData.borrowed,
        },
        marketState,
    });
}
