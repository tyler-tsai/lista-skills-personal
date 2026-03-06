---
name: lista-wallet-connect
version: 1.0.0
repository: https://github.com/lista-dao/lista-skills
description: Connect wallets via WalletConnect v2 and execute EVM signing/transaction operations on Ethereum and BSC.
---

# Wallet Connect Skill

> **Version:** 1.0.0
> **Status:** Pre-release (not public, skip registry verification)
> **Verify:** `npx tsx src/cli.ts version`
> **If outdated:** `npm install && npm run build`

Wallet connection and transaction bridge skill for EVM (`eip155:1`, `eip155:56`).

## Project Structure

```text
skills/lista-wallet-connect/
├── SKILL.md
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts
│   ├── client.ts
│   ├── storage.ts
│   ├── helpers.ts
│   ├── rpc.ts
│   └── commands/
│       ├── pair.ts
│       ├── auth.ts
│       ├── sign.ts
│       ├── sign-typed-data.ts
│       ├── send-tx.ts
│       ├── call.ts
│       ├── balance.ts
│       ├── health.ts
│       ├── sessions.ts
│       └── tokens.ts
└── references/
    └── chains.md
```

## Setup

```bash
cd skills/lista-wallet-connect
npm install
npm run build
```

Set WalletConnect project id:

```bash
export WALLETCONNECT_PROJECT_ID=<your_project_id>
```

Optional: you can also place env vars in `skills/lista-wallet-connect/.env`.

## Runtime Contract

- Commands: `node skills/lista-wallet-connect/dist/cli.js <command> ...`
- `stdout`: JSON payloads for automation/agent parsing
- `stderr`: progress/diagnostic logs

## Supported Chains

- `eip155:1` (Ethereum)
- `eip155:56` (BSC)

## Security Rules

1. Never send/sign without explicit user confirmation.
2. Always show chain, token, amount, and destination before sending.
3. Use `call` simulation by default; avoid `--no-simulate` unless user insists.
4. Do not disclose session topic or pairing URI to third parties.

## Command Index

- `pair`
- `status`
- `auth`
- `sign`
- `sign-typed-data`
- `send-tx`
- `call`
- `balance`
- `tokens`
- `sessions`
- `list-sessions`
- `whoami`
- `delete-session`
- `health`
- `version`

## Command Details

### 1) `pair`

Purpose: Start WalletConnect pairing flow.

```bash
node skills/lista-wallet-connect/dist/cli.js pair --chains eip155:56
node skills/lista-wallet-connect/dist/cli.js pair --chains eip155:56,eip155:1
node skills/lista-wallet-connect/dist/cli.js pair --chains eip155:56 --open
```

Behavior:
- First outputs `status: "waiting_for_approval"` with `uri`, `qrPath` (and sometimes `qrBase64`).
- After user approves, outputs `status: "paired"` with `topic`, `accounts`, `peerName`.

### 2) `status`

Purpose: Check whether a stored session exists.

```bash
node skills/lista-wallet-connect/dist/cli.js status --topic <topic>
node skills/lista-wallet-connect/dist/cli.js status --address 0xADDRESS
```

### 3) `auth`

Purpose: Request a consent signature and mark session as authenticated.

```bash
node skills/lista-wallet-connect/dist/cli.js auth --topic <topic>
node skills/lista-wallet-connect/dist/cli.js auth --address 0xADDRESS
```

### 4) `sign`

Purpose: Sign an arbitrary message (`personal_sign`).

```bash
node skills/lista-wallet-connect/dist/cli.js sign --topic <topic> --message "Hello"
node skills/lista-wallet-connect/dist/cli.js sign --address 0xADDRESS --message "Hello" --chain eip155:56
```

### 5) `sign-typed-data`

Purpose: Sign EIP-712 typed data (`eth_signTypedData_v4`).

```bash
node skills/lista-wallet-connect/dist/cli.js sign-typed-data --topic <topic> --data '{"domain":...,"types":...,"message":...}'
node skills/lista-wallet-connect/dist/cli.js sign-typed-data --address 0xADDRESS --data @/path/to/typed-data.json --chain eip155:1
```

### 6) `send-tx`

Purpose: Send native token or ERC-20 transfer.

Required:
- `--topic` or `--address`
- `--chain`
- `--to`
- `--amount`

Examples:

```bash
# native
node skills/lista-wallet-connect/dist/cli.js send-tx --topic <topic> --chain eip155:56 --to 0xRECIPIENT --amount 0.1

# erc20
node skills/lista-wallet-connect/dist/cli.js send-tx --topic <topic> --chain eip155:56 --to 0xRECIPIENT --token USDT --amount 10

# ENS on ethereum
node skills/lista-wallet-connect/dist/cli.js send-tx --topic <topic> --chain eip155:1 --to vitalik.eth --amount 0.01
```

### 7) `call`

Purpose: Send arbitrary contract transaction (`eth_sendTransaction`) with optional calldata and value.

Key points:
- Simulates via `eth_call` before sending by default.
- On simulation failure, command returns `status: "simulation_failed"` and does not send tx.
- Use `--no-simulate` only when you intentionally want to bypass simulation.

Examples:

```bash
# contract call with calldata
node skills/lista-wallet-connect/dist/cli.js call --topic <topic> --chain eip155:56 --to 0xCONTRACT --data 0xCALLDATA

# with native value
node skills/lista-wallet-connect/dist/cli.js call --topic <topic> --chain eip155:56 --to 0xCONTRACT --data 0xCALLDATA --value 0.01

# custom gas
node skills/lista-wallet-connect/dist/cli.js call --topic <topic> --chain eip155:56 --to 0xCONTRACT --data 0xCALLDATA --gas 500000

# force send without simulation (risky)
node skills/lista-wallet-connect/dist/cli.js call --topic <topic> --chain eip155:56 --to 0xCONTRACT --data 0xCALLDATA --no-simulate
```

### 8) `balance`

Purpose: Query native + configured token balances without wallet signature.

```bash
node skills/lista-wallet-connect/dist/cli.js balance --topic <topic>
node skills/lista-wallet-connect/dist/cli.js balance --topic <topic> --chain eip155:56
node skills/lista-wallet-connect/dist/cli.js balance --address 0xADDRESS --chain eip155:56
node skills/lista-wallet-connect/dist/cli.js balance
```

### 9) `tokens`

Purpose: Show token registry for a chain.

```bash
node skills/lista-wallet-connect/dist/cli.js tokens
node skills/lista-wallet-connect/dist/cli.js tokens --chain eip155:56
```

### 10) `sessions`

Purpose: Dump raw saved sessions JSON.

```bash
node skills/lista-wallet-connect/dist/cli.js sessions
```

### 11) `list-sessions`

Purpose: Human-readable session listing.

```bash
node skills/lista-wallet-connect/dist/cli.js list-sessions
```

### 12) `whoami`

Purpose: Show account details for a session, or latest session if omitted.

```bash
node skills/lista-wallet-connect/dist/cli.js whoami --topic <topic>
node skills/lista-wallet-connect/dist/cli.js whoami --address 0xADDRESS
node skills/lista-wallet-connect/dist/cli.js whoami
```

### 13) `delete-session`

Purpose: Remove a saved session entry.

```bash
node skills/lista-wallet-connect/dist/cli.js delete-session --topic <topic>
node skills/lista-wallet-connect/dist/cli.js delete-session --address 0xADDRESS
```

### 14) `health`

Purpose: Ping session(s) for liveness and optionally clean dead sessions.

```bash
node skills/lista-wallet-connect/dist/cli.js health --topic <topic>
node skills/lista-wallet-connect/dist/cli.js health --address 0xADDRESS
node skills/lista-wallet-connect/dist/cli.js health --all
node skills/lista-wallet-connect/dist/cli.js health --all --clean
```

### 15) `version`

Purpose: Print skill version.

```bash
node skills/lista-wallet-connect/dist/cli.js version
```

## Common Options

- `--address <0x...>`: resolve and use latest session matching address
- `--topic <topic>`: explicit session topic
- `--chain <eip155:1|eip155:56>`
- `--open` (pair): force open QR image in system viewer
- `--no-simulate` (call): bypass simulation

## Session Persistence

- WalletConnect storage: `~/.agent-wallet/wc-store/`
- Session metadata: `~/.agent-wallet/sessions.json`

## Quick Onboarding Flow

```bash
# 1) pair
node skills/lista-wallet-connect/dist/cli.js pair --chains eip155:56,eip155:1 --open

# 2) auth
node skills/lista-wallet-connect/dist/cli.js auth --topic <topic>

# 3) verify
node skills/lista-wallet-connect/dist/cli.js whoami --topic <topic>
```

## Integration Notes (with lista-lending)

- `lista-lending` executes transactions by calling this skill's `call` command.
- Keep both skills aligned on chain/RPC configuration.
- For debugging send flow issues, inspect `stderr` from both skills.

