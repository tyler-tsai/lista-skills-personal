import { Decimal, type MarketExtraInfo, type MarketRepaySimulationResult, type MarketUserData, type SimulateMarketState } from "@lista-dao/moolah-sdk-core";
export declare function toMarketSimulationState(marketExtraInfo: MarketExtraInfo): SimulateMarketState;
export declare function simulateBorrowLoanableAfterSupply(marketExtraInfo: MarketExtraInfo, userData: Pick<MarketUserData, "collateral" | "borrowed" | "decimals">, supplyAssets: bigint): Decimal;
export declare function simulateRepayPosition(marketExtraInfo: MarketExtraInfo, userData: Pick<MarketUserData, "collateral" | "borrowed" | "decimals">, repayAmount: Decimal, repayAll: boolean): MarketRepaySimulationResult;
