export function renderHelp(meta) {
    return `${meta.skillName} v${meta.skillVersion}

Usage: dist/cli.js <command> [options]

Commands:
  pair             Create pairing session (--chains eip155:56,eip155:1)
  status           Check session (--topic <topic> | --address <addr>)
  auth             Send consent sign (--topic <topic> | --address <addr>)
  sign             Sign message (--topic <topic> | --address <addr>) --message <msg>
  sign-typed-data  Sign EIP-712 typed data (--topic | --address) --data <json|@file> [--chain eip155:1]
  send-tx          Send transaction (--topic <topic> | --address <addr>) --chain <chain> --to <addr> --amount <n> [--token USDC]
  call             Raw contract call (--topic | --address) --to <contract> --data <calldata> [--value <wei|native-decimal>] [--gas <limit>] [--no-simulate]
  balance          Check wallet balances (--topic <topic> | --address <addr> [--chain <chain>])
  tokens           List supported tokens for a chain (--chain <chain>)
  sessions         List all sessions (raw JSON)
  list-sessions    List sessions (human-readable)
  whoami           Show account info (--topic <topic> | --address <addr>)
  delete-session   Remove a saved session (--topic <topic> | --address <addr>)
  health           Ping session to check liveness (--topic | --address | --all) [--clean]
  version          Show version information

Options:
  --address <0x...>  Select session by wallet address (case-insensitive)
  --all              (health) Ping all sessions
  --clean            (health) Remove dead sessions from storage
  --open             (pair) Force open QR in system viewer (for agent environments)
  --no-simulate      (call) Skip transaction simulation (not recommended)

Supported Chains:
  eip155:1      Ethereum Mainnet
  eip155:56     BSC (Lista Lending)`;
}
