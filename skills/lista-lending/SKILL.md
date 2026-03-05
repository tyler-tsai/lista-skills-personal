---
name: lista-lending
version: 0.1.0
repository: https://github.com/lista-dao/lista-skills
requires:
  wallet-connect: ">=1.0.0"
description: Deposit and withdraw from Lista Lending vaults on BSC and Ethereum. Requires connected wallet via /wallet-connect.
---

# Lista Lending Skill (POC)

> **Version:** 0.1.0
> **Status:** Pre-release (not public, skip registry verification)
> **Requires:** wallet-connect >= 1.0.0
> **Verify:** `npx tsx src/cli.ts version`
> **If outdated:** `npm install && npm run build`

Execute vault deposit/withdraw operations on Lista Lending protocol via WalletConnect.

## Project Structure

```
skills/lista-lending/
├── SKILL.md              # This file
├── package.json
├── tsconfig.json
└── src/
    ├── cli.ts            # CLI entry point
    ├── types.ts          # TypeScript interfaces
    ├── api.ts            # Lista API client (vault discovery)
    ├── config.ts         # RPC configuration storage
    ├── context.ts        # Selected vault persistence
    ├── sdk.ts            # SDK initialization
    ├── executor.ts       # Transaction execution via wallet-connect
    └── commands/
        ├── config.ts     # RPC configuration management
        ├── vaults.ts     # List available vaults
        ├── holdings.ts   # Query user's vault positions
        ├── select.ts     # Select vault for operations
        ├── deposit.ts    # Vault deposit
        └── withdraw.ts   # Vault withdraw
```

## Prerequisites

1. **Wallet connected** via `/wallet-connect` skill
2. **Chain enabled** in wallet session (BSC or Ethereum)
3. **wallet-connect skill built** — this skill calls it internally

## First-Time Setup

```bash
# Check if dependencies installed
ls skills/lista-lending/node_modules/@lista-dao 2>/dev/null || echo "NEEDS_INSTALL"

# Install dependencies
cd skills/lista-lending && npm install
```

## Running Commands

Use `npx tsx` to run (ESM module resolution):

```bash
cd skills/lista-lending && npx tsx src/cli.ts <command> [options]
```

## Supported Chains

| Chain | CAIP-2 ID | Explorer |
|-------|-----------|----------|
| BSC (default) | `eip155:56` | bscscan.com |
| Ethereum | `eip155:1` | etherscan.io |

## Commands

### Vaults — List Available Vaults

```bash
# List BSC vaults (default)
npx tsx src/cli.ts vaults

# List Ethereum vaults
npx tsx src/cli.ts vaults --chain eip155:1

# Filter + sort (SDK-backed)
npx tsx src/cli.ts vaults \
  --chain eip155:56 \
  --sort apy \
  --order desc \
  --page 1 \
  --page-size 20

# Optional filters (pass comma-separated values)
npx tsx src/cli.ts vaults \
  --chain eip155:56 \
  --assets 0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d,0x55d398326f99059ff775485246999027b3197955 \
  --curators "Lista DAO,Pangolins"
```

**Vaults filter options:**
- `--page <number>` / `--page-size <number>` — Pagination
- `--sort <field>` / `--order <asc|desc>` — Sorting
- `--zone <value>` / `--keyword <text>` — Generic API filters
- `--assets <a,b>` — Asset filter (recommended: token addresses)
- `--curators <a,b>` — Curator filter

**Output:**
```json
{
  "status": "success",
  "chain": "eip155:56",
  "count": 18,
  "vaults": [
    {
      "index": 0,
      "address": "0x57134a64b7cd9f9eb72f8255a671f5bf2fe3e2d0",
      "name": "Lista BNB Vault",
      "asset": "BNB",
      "assetAddress": "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
      "decimals": 4,
      "tvl": "316142211.669920502510345539",
      "apy": "0.008441518428235628",
      "curator": "Lista DAO",
      "display": "[0] Lista BNB Vault (BNB) - TVL: $316,142,212, APY: 0.84%"
    }
  ]
}
```

### Holdings — Query User's Vault Positions

```bash
# Get vaults user has positions in
npx tsx src/cli.ts holdings --address 0xUSER_ADDRESS
```

**Note:** API returns vault addresses only. Use `select --vault <address>` to query actual on-chain balances.

**Output:**
```json
{
  "status": "success",
  "address": "0x...",
  "count": 3,
  "holdings": [
    {
      "index": 0,
      "vaultAddress": "0xfa27f172e0b6ebcef9c51abf817e2cb142fbe627",
      "vaultName": "Lista USD1 Vault",
      "curator": "Lista DAO",
      "apy": "0.018067307501024944",
      "chain": "eip155:56",
      "display": "[0] Lista USD1 Vault (Lista DAO) - APY: 1.81%"
    }
  ],
  "note": "Use 'select --vault <address>' then check position for actual balances"
}
```

### Select — Select Vault for Operations

Select a vault and query on-chain position. Persisted in `~/.agent-wallet/lending-context.json`.

```bash
# Select vault and connect wallet
npx tsx src/cli.ts select \
  --vault 0xVAULT_ADDRESS \
  --wallet-topic <topic> \
  --wallet-address 0xYOUR_ADDRESS

# Select on specific chain
npx tsx src/cli.ts select \
  --vault 0xVAULT_ADDRESS \
  --chain eip155:1 \
  --wallet-topic <topic> \
  --wallet-address 0xYOUR_ADDRESS

# Show current selection
npx tsx src/cli.ts select --show

# Clear selection
npx tsx src/cli.ts select --clear
```

**Output:**
```json
{
  "status": "success",
  "action": "selected",
  "vault": {
    "address": "0x...",
    "name": "USD1 Vault",
    "asset": {
      "symbol": "USD1",
      "address": "0x...",
      "decimals": 18
    },
    "chain": "eip155:56"
  },
  "userAddress": "0x...",
  "balance": "120.00000000",
  "vaultBalance": "100.50000000",
  "position": {
    "assets": "100.50000000",
    "balance": "100.50000000",
    "walletBalance": "120.00000000",
    "assetSymbol": "USD1",
    "hasPosition": true
  },
  "message": "Selected USD1 Vault. You have 100.50000000 USD1 deposited. Wallet balance: 120.00000000 USD1."
}
```

### Config — Manage RPC URLs

```bash
# Show current configuration
npx tsx src/cli.ts config --show

# Set custom RPC for BSC
npx tsx src/cli.ts config --set-rpc --chain eip155:56 --url https://my-bsc-rpc.com

# Set custom RPC for Ethereum
npx tsx src/cli.ts config --set-rpc --chain eip155:1 --url https://my-eth-rpc.com

# Clear custom RPC (revert to default)
npx tsx src/cli.ts config --clear-rpc --chain eip155:56

# Enable persistent debug logs
npx tsx src/cli.ts config --set-debug

# Disable persistent debug logs
npx tsx src/cli.ts config --clear-debug

# One-time debug for current command only
npx tsx src/cli.ts borrow --simulate --debug
```

**Default Public RPCs:**
- BSC: `https://bsc-dataseed.binance.org`
- ETH: `https://eth.llamarpc.com`

**Config file:** `~/.agent-wallet/lending-config.json`

### Deposit to Vault

```bash
# Using selected vault (after 'select' command)
npx tsx src/cli.ts deposit --amount 100

# Explicit vault address
npx tsx src/cli.ts deposit \
  --vault 0xVAULT_ADDRESS \
  --amount 100 \
  --wallet-topic <topic> \
  --wallet-address 0xYOUR_ADDRESS

# Deposit on Ethereum
npx tsx src/cli.ts deposit \
  --vault 0xVAULT_ADDRESS \
  --amount 100 \
  --chain eip155:1 \
  --wallet-topic <topic> \
  --wallet-address 0xYOUR_ADDRESS
```

**Parameters:**
- `--vault` — Vault address (uses selected vault if omitted)
- `--amount` — Amount in token units, e.g., "100" for 100 USDT (required)
- `--chain` — Chain ID (uses selected vault's chain if omitted)
- `--wallet-topic` — WalletConnect session topic (uses saved topic if omitted)
- `--wallet-address` — Your wallet address (uses saved address if omitted)

**Flow:**
1. Fetch vault info (asset, decimals)
2. Build deposit steps via SDK (may include approve)
3. Execute each step via wallet-connect `call`
4. Return tx hash or error

**Output:**
```json
{
  "status": "success",
  "vault": "0x...",
  "chain": "eip155:56",
  "asset": "USDT",
  "deposited": "100",
  "steps": 2,
  "txHash": "0x...",
  "explorer": "https://bscscan.com/tx/0x...",
  "balance": "20.00000000",
  "vaultBalance": "100.50000000",
  "position": {
    "balance": "100.50000000",
    "assets": "100.50000000",
    "walletBalance": "20.00000000",
    "assetSymbol": "USDT"
  }
}
```

### Withdraw from Vault

```bash
# Using selected vault (after 'select' command)
npx tsx src/cli.ts withdraw --amount 50

# Withdraw all from selected vault
npx tsx src/cli.ts withdraw --withdraw-all

# Explicit vault address
npx tsx src/cli.ts withdraw \
  --vault 0xVAULT_ADDRESS \
  --amount 50 \
  --wallet-topic <topic> \
  --wallet-address 0xYOUR_ADDRESS
```

**Parameters:**
- `--vault` — Vault address (uses selected vault if omitted)
- `--amount` — Amount in token units (one of amount/withdraw-all required)
- `--withdraw-all` — Withdraw entire position
- `--chain` — Chain ID (uses selected vault's chain if omitted)
- `--wallet-topic` — WalletConnect session topic (uses saved topic if omitted)
- `--wallet-address` — Your wallet address (uses saved address if omitted)

**Output:**
```json
{
  "status": "success",
  "vault": "0x...",
  "chain": "eip155:56",
  "asset": "USDT",
  "withdrawn": "50",
  "txHash": "0x...",
  "explorer": "https://bscscan.com/tx/0x...",
  "balance": "115.39490000",
  "vaultBalance": "50.50000000",
  "position": {
    "balance": "50.50000000",
    "assets": "50.50000000",
    "walletBalance": "115.39490000",
    "assetSymbol": "USDT",
    "remaining": true
  }
}
```

## Error Handling

| Error Type | Response |
|------------|----------|
| User rejected | `{ status: "rejected", reason: "user_rejected", failedStep: "approve" }` |
| Contract revert | `{ status: "reverted", reason: "...", failedStep: "depositVault" }` |
| Insufficient balance | `{ status: "error", reason: "insufficient_balance" }` |
| No position | `{ status: "error", reason: "no_position" }` |
| Invalid vault | `{ status: "error", reason: "invalid_vault" }` |
| RPC error | `{ status: "error", reason: "rpc_error", hint: "..." }` |

**Partial execution tracking:**

If approve succeeds but deposit fails:
```json
{
  "status": "reverted",
  "reason": "Contract execution reverted",
  "failedStep": "depositVault",
  "completedSteps": 1,
  "totalSteps": 2,
  "completedTxs": [{ "step": "approve", "txHash": "0x..." }]
}
```

## Integration with wallet-connect

This skill generates transaction calldata using `@lista-dao/moolah-lending-sdk`, then executes via wallet-connect's `call` command:

```bash
# Generated internally for each step:
node skills/wallet-connect/dist/cli.js call \
  --topic <wallet-topic> \
  --chain <chain> \
  --to <contract> \
  --data <calldata> \
  --value <if-native>
```

## SDK Reference

Uses:
- `@lista-dao/moolah-sdk-core` — Core utilities, RPC calls
- `@lista-dao/moolah-lending-sdk` — Transaction builders returning `StepParam[]`

**SDK methods used:**
- `getVaultInfo(chainId, vaultAddress)` — Get vault metadata
- `getVaultUserData(chainId, vaultAddress, userAddress)` — Get user's position
- `buildVaultDepositParams(params)` — Build deposit transaction(s)
- `buildVaultWithdrawParams(params)` — Build withdraw transaction(s)

## Typical Workflow

```bash
# 1. Connect wallet (via wallet-connect skill)
node skills/wallet-connect/dist/cli.js pair --chains eip155:56

# 2. Discover vaults
npx tsx src/cli.ts vaults

# 3. Check user's existing positions
npx tsx src/cli.ts holdings --address 0xYOUR_ADDRESS

# 4. Select vault for operations
npx tsx src/cli.ts select \
  --vault 0xVAULT_ADDRESS \
  --wallet-topic <topic> \
  --wallet-address 0xYOUR_ADDRESS

# 5. Deposit into selected vault
npx tsx src/cli.ts deposit --amount 100

# 6. Check updated position
npx tsx src/cli.ts select --show

# 7. Withdraw
npx tsx src/cli.ts withdraw --amount 50
```

## Security

1. **Always confirm** deposit/withdraw amounts with user before execution
2. **Show token symbol and amount** clearly
3. **Warn on large transactions** (>$500 equivalent)
4. **Check for contract reverts** — may indicate slippage or other issues

## Data Flow

```
┌─────────────────┐     ┌───────────────┐     ┌─────────────────┐
│   Lista API     │────>│  holdings/    │────>│   Vault         │
│   (discovery)   │     │  vaults cmd   │     │   Addresses     │
└─────────────────┘     └───────────────┘     └─────────────────┘
                                                      │
                                                      v
┌─────────────────┐     ┌───────────────┐     ┌─────────────────┐
│   Moolah SDK    │<────│   select/     │<────│   On-chain      │
│   (tx build)    │     │   deposit/    │     │   Position      │
└─────────────────┘     │   withdraw    │     └─────────────────┘
        │               └───────────────┘
        v
┌─────────────────┐     ┌───────────────┐
│  WalletConnect  │<────│   executor    │
│   (send tx)     │     │   (call cmd)  │
└─────────────────┘     └───────────────┘
```
