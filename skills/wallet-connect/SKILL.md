---
name: wallet-connect
version: 1.0.0
repository: https://github.com/lista-dao/lista-skills
description: Connect to crypto wallets via WalletConnect v2. Use when asked to connect wallet, pair wallet, sign messages, or send transactions on Ethereum or BSC.
---

# Wallet Connect Skill

> **Version:** 1.0.0
> **Status:** Pre-release (not public, skip registry verification)
> **Verify:** `npx tsx src/cli.ts version`
> **If outdated:** `npm install && npm run build`

Connect to user's crypto wallet via WalletConnect v2. Supports Ethereum and BSC (for Lista Lending).

## Project Structure

```
skills/wallet-connect/
├── SKILL.md              # This file — agent instructions
├── package.json          # Dependencies
├── tsconfig.json
├── src/
│   ├── cli.ts            # CLI entry point
│   ├── types.ts          # Shared TypeScript interfaces
│   ├── storage.ts        # Session persistence (load/save)
│   ├── client.ts         # WC SignClient singleton + address lookup
│   ├── helpers.ts        # Shared utils (ENS, timeout, encoding)
│   └── commands/
│       ├── pair.ts       # Pairing command
│       ├── auth.ts       # Authentication (consent sign)
│       ├── sign.ts       # Message signing (EVM)
│       ├── sign-typed-data.ts # EIP-712 typed data signing
│       ├── send-tx.ts    # Transaction sending (native + token)
│       ├── call.ts       # Raw contract calls (approve, deposit, etc.)
│       ├── balance.ts    # Balance checking
│       ├── health.ts     # Session health detection (wc_ping)
│       ├── sessions.ts   # Session management (list, whoami, delete)
│       └── tokens.ts     # Token metadata (addresses, decimals)
└── references/
    └── chains.md         # Supported chain IDs and tokens
```

## First-Time Setup

**BEFORE running any command**, check if dependencies are installed and compiled:

```bash
# Check dependencies
ls skills/wallet-connect/node_modules/@walletconnect 2>/dev/null || echo "NEEDS_INSTALL"

# Check if compiled
ls skills/wallet-connect/dist/cli.js 2>/dev/null || echo "NEEDS_BUILD"
```

If `NEEDS_INSTALL`, run:
```bash
cd skills/wallet-connect && npm install
```

If `NEEDS_BUILD`, run:
```bash
cd skills/wallet-connect && npm run build
```

**Check environment variable:**

```bash
echo ${WALLETCONNECT_PROJECT_ID:-NOT_SET}
```

If output is `NOT_SET`, ask the user to set it:
> Please set your WalletConnect Project ID. Get one free at https://cloud.walletconnect.com

```bash
export WALLETCONNECT_PROJECT_ID=your_project_id
```

## Security Rules

1. **NEVER send transactions without explicit user confirmation** — Always show amount, recipient, and token before calling `send-tx`.
2. **Transaction limit:** Single transaction over $500 USD equivalent requires user to type "CONFIRM" explicitly.
3. **No blind signing:** Never use `sign` or `sign-typed-data` without explaining what the user is signing.
4. **Session privacy:** Never share session topics, WalletConnect URIs, or QR codes with third parties.
5. **Verify addresses:** Always double-check recipient addresses. For large amounts, ask user to verify the first and last 4 characters.

## Quick Start

**Always use the compiled version for speed:**
```bash
node skills/wallet-connect/dist/cli.js <command> [args]
```

If you modify source files, rebuild first:
```bash
cd skills/wallet-connect && npm run build
```

## Commands

### Pair (one-time onboarding)
```bash
node skills/wallet-connect/dist/cli.js pair --chains eip155:56
node skills/wallet-connect/dist/cli.js pair --chains eip155:56,eip155:1

# Force open QR in system viewer (for Claude Code, Codex, Cursor environments)
node skills/wallet-connect/dist/cli.js pair --chains eip155:56 --open
```
Output: `{ uri, qrPath, topic }`

### Authenticate (consent sign)
```bash
node skills/wallet-connect/dist/cli.js auth --topic <topic>
```
Output: `{ address, signature, nonce }` after user approves in wallet.

### Check Balances (no wallet interaction)
```bash
# All balances for all accounts in a session
node skills/wallet-connect/dist/cli.js balance --topic <topic>

# Single chain
node skills/wallet-connect/dist/cli.js balance --topic <topic> --chain eip155:56

# Direct address (no session needed)
node skills/wallet-connect/dist/cli.js balance --address 0xADDRESS --chain eip155:56

# All sessions, all chains
node skills/wallet-connect/dist/cli.js balance
```
Output: `[{ chain, address, balances: [{ token, balance, raw }] }]`

### List Supported Tokens
```bash
node skills/wallet-connect/dist/cli.js tokens
node skills/wallet-connect/dist/cli.js tokens --chain eip155:56
```
Output: `{ chain, tokens: [{ symbol, name, decimals, address }] }`

### Delete Session
```bash
node skills/wallet-connect/dist/cli.js delete-session --topic <topic>
node skills/wallet-connect/dist/cli.js delete-session --address 0xADDRESS
```
Output: `{ status: "deleted", topic, peerName, accounts }`

### Check Session Health
```bash
node skills/wallet-connect/dist/cli.js health --topic <topic>
node skills/wallet-connect/dist/cli.js health --all
node skills/wallet-connect/dist/cli.js health --all --clean
```

### Send Transaction
```bash
# Send native BNB on BSC
node skills/wallet-connect/dist/cli.js send-tx --topic <topic> --chain eip155:56 \
  --to 0xRECIPIENT --amount 0.1

# Send USDT on BSC
node skills/wallet-connect/dist/cli.js send-tx --topic <topic> --chain eip155:56 \
  --to 0xRECIPIENT --token USDT --amount 100

# Send ETH on Ethereum (supports ENS names)
node skills/wallet-connect/dist/cli.js send-tx --topic <topic> --chain eip155:1 \
  --to vitalik.eth --amount 0.01
```

### Raw Contract Call (for DeFi operations)

**Transaction Simulation:** The `call` command simulates transactions using `eth_call` before sending. If the simulation detects a revert, the transaction is NOT sent, preventing gas loss. Use `--no-simulate` to skip simulation (not recommended).

```bash
# Approve USDT for Lista Lending vault
node skills/wallet-connect/dist/cli.js call --topic <topic> --chain eip155:56 \
  --to 0x55d398326f99059fF775485246999027B3197955 \
  --data 0x095ea7b3000000000000000000000000SPENDER_ADDRESSffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff

# Deposit to vault (with value for native token)
node skills/wallet-connect/dist/cli.js call --topic <topic> --chain eip155:56 \
  --to 0xVAULT_ADDRESS \
  --data 0xCALLDATA \
  --value 1.5

# Custom gas limit
node skills/wallet-connect/dist/cli.js call --topic <topic> --chain eip155:56 \
  --to 0xCONTRACT --data 0xCALLDATA --gas 500000

# Skip simulation (not recommended - may waste gas on reverts)
node skills/wallet-connect/dist/cli.js call --topic <topic> --chain eip155:56 \
  --to 0xCONTRACT --data 0xCALLDATA --no-simulate
```
Output: `{ status, txHash, chain, from, to, data, value, explorer }`

On simulation failure: `{ status: "simulation_failed", error, revertReason, hint }`

**Parameters:**
- `--to` — Contract address (required)
- `--data` — Hex-encoded calldata (optional, for read-only calls)
- `--value` — Native token value: "1.5" (ether), "1000000000000000000" (wei), or "0x..." (hex wei)
- `--gas` — Gas limit (optional)
- `--gasPrice` — Gas price in wei (optional)
- `--no-simulate` — Skip transaction simulation (not recommended)

### Sign Message
```bash
node skills/wallet-connect/dist/cli.js sign --topic <topic> --message "Hello World"
```

### Sign Typed Data (EIP-712)
```bash
node skills/wallet-connect/dist/cli.js sign-typed-data --topic <topic> --data '{"domain":...}'
node skills/wallet-connect/dist/cli.js sign-typed-data --topic <topic> --data @/path/to/typed-data.json
```
Output: `{ status, address, signature, chain, primaryType }`

## Onboarding Workflow

When user asks to pair their wallet:

1. Run `pair` → get URI + QR path
2. Send **two messages** to the user:
   - **Message 1:** "Pair your wallet" + QR code image as attachment
   - **Message 2:** The raw `wc:` URI wrapped in backticks (tap-to-copy on mobile)
3. User scans QR or copies URI into wallet app → approves pairing
4. Run `auth` → wallet receives consent sign request
5. User approves → agent stores session topic + verified address
6. Confirm to user: "Wallet connected"

**UX rules:**
- Message 2 must contain ONLY the backtick-wrapped URI — no other text
- QR code is for desktop/scanning; URI copy is for mobile users
- The pair command blocks waiting for approval (5 min timeout)
- Kill the pair process after receiving the paired response, then run auth separately
- In agent environments (Claude Code, Codex, Cursor), use `--open` flag to auto-open QR in system viewer

## Transaction Workflow

1. Agent decides a payment is needed
2. Message user: "Sending X USDT to 0xABC for [reason]. Please approve in your wallet."
3. Run `send-tx` → user gets push notification in wallet
4. User approves/rejects → agent gets tx hash or rejection
5. Continue based on outcome

## Supported Chains

| Chain | CAIP-2 ID | Native |
|-------|-----------|--------|
| Ethereum | `eip155:1` | ETH |
| BSC | `eip155:56` | BNB |

## Supported Tokens

| Token | Ethereum | BSC |
|-------|----------|-----|
| USDC | ✅ | ✅ |
| USDT | ✅ | ✅ |
| WETH | ✅ | — |
| DAI | ✅ | — |
| WBTC | ✅ | — |
| WBNB | — | ✅ |
| BTCB | — | ✅ |
| USD1 | — | ✅ |

To add more tokens, edit `src/commands/tokens.ts`.

## Integration with Lista Skills

After connecting a wallet, combine with other Lista skills:

1. **Check positions:** `/lista-report <connected_address>`
2. **Find yield:** `/lista-yield`
3. **Execute repayment:** Use `send-tx` to repay debt identified in the report

## Session Persistence

- WC client sessions: `~/.agent-wallet/wc-store/` (persistent across runs)
- App session data: `~/.agent-wallet/sessions.json` (accounts, auth status)
- Sessions are valid until user disconnects from their wallet

## Environment

- `WALLETCONNECT_PROJECT_ID` — required
- `WC_METADATA_NAME` — optional (default: "Agent Wallet")
- `WC_METADATA_URL` — optional (default: "https://lista.org")

## Chain Reference

See [references/chains.md](references/chains.md) for supported chain IDs and token addresses.
