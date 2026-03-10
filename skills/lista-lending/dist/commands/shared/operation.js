import { setLastOperation, } from "../../context.js";
export function recordOperation(input, status, txHash) {
    setLastOperation({
        ...input,
        status,
        txHash,
        at: new Date().toISOString(),
    });
}
