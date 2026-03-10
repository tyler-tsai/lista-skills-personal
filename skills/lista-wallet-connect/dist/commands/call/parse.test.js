import assert from "node:assert/strict";
import test from "node:test";
import { parseUnits } from "viem";
import { buildCallTransaction } from "./parse.js";
const FROM = "0x0000000000000000000000000000000000000001";
const TO = "0x0000000000000000000000000000000000000002";
function buildArgs(value) {
    return { value };
}
test("buildCallTransaction preserves decimal precision for value", () => {
    const value = "0.123456789012345678";
    const tx = buildCallTransaction(FROM, TO, buildArgs(value));
    const expected = `0x${parseUnits(value, 18).toString(16)}`;
    assert.equal(tx.value, expected);
});
test("buildCallTransaction treats integer value as wei", () => {
    const value = "123456789012345678";
    const tx = buildCallTransaction(FROM, TO, buildArgs(value));
    const expected = `0x${BigInt(value).toString(16)}`;
    assert.equal(tx.value, expected);
});
test("buildCallTransaction keeps hex value unchanged", () => {
    const value = "0x1bc16d674ec80000";
    const tx = buildCallTransaction(FROM, TO, buildArgs(value));
    assert.equal(tx.value, value);
});
test("buildCallTransaction omits zero value", () => {
    const tx = buildCallTransaction(FROM, TO, buildArgs("0"));
    assert.equal(tx.value, undefined);
});
