import {
  setLastOperation,
  OperationStatus,
  TargetType,
  type OperationType,
} from "../../context.js";

export interface OperationRecordInput {
  type: OperationType;
  targetType: TargetType;
  targetId: string;
  chain: string;
  amount?: string;
  symbol?: string;
}

export function recordOperation(
  input: OperationRecordInput,
  status: OperationStatus,
  txHash?: string
): void {
  setLastOperation({
    ...input,
    status,
    txHash,
    at: new Date().toISOString(),
  });
}
