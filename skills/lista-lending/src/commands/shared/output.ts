export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload));
}

export function exitWithCode(code: number): never {
  process.exit(code);
}
