import { isDebugEnabled } from "../../config.js";

let runtimeDebugOverride: boolean | null = null;
let cachedPersistedDebug: boolean | null = null;

function getPersistedDebug(): boolean {
  if (cachedPersistedDebug === null) {
    cachedPersistedDebug = isDebugEnabled();
  }
  return cachedPersistedDebug;
}

export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload));
}

export function printDebug(payload: unknown): void {
  const debugEnabled =
    runtimeDebugOverride !== null ? runtimeDebugOverride : getPersistedDebug();
  if (!debugEnabled) return;
  console.error(JSON.stringify(payload));
}

export function setRuntimeDebugOverride(enabled: boolean | null): void {
  runtimeDebugOverride = enabled;
}

export function exitWithCode(code: number): never {
  process.exit(code);
}
