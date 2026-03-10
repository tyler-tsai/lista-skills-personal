#!/usr/bin/env node
'use strict';

/**
 * moolah.js — Moolah protocol RPC tool (BSC + ETH Mainnet)
 * No external dependencies required — uses Node.js stdlib only.
 *
 * Usage:
 *   node moolah.js [--chain bsc|eth] position      <marketId> <userAddr>
 *   node moolah.js [--chain bsc|eth] market        <marketId>
 *   node moolah.js [--chain bsc|eth] params        <marketId>
 *   node moolah.js [--chain bsc|eth] oracle-price  <marketId>
 *   node moolah.js [--chain bsc]     user-positions <userAddr>
 *
 * Default chain: bsc
 * All output is JSON on stdout. Errors go to stderr with exit code 1.
 *
 * Selectors (keccak256 of ABI signature, first 4 bytes).
 * Verify with: cast sig "functionName(types)"  [foundry]
 */

const https  = require('https');
const http   = require('http');

// ── Chain config ─────────────────────────────────────────────────────────────

const CHAINS = {
  bsc: {
    moolah:     '0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C',
    multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    oracle:     '0xf3afD82A4071f272F403dC176916141f44E6c750',
    rpc:        'https://bsc-dataseed.bnbchain.org',
    name:       'BSC Mainnet',
    chainId:    56,
  },
  eth: {
    moolah:     '0xf820fB4680712CD7263a0D3D024D5b5aEA82Fd70',
    multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    oracle:     '0xA64FE284EB8279B9b63946DD51813b0116099301',
    rpc:        'https://eth.drpc.org',
    name:       'Ethereum Mainnet',
    chainId:    1,
  },
};

const API_URL = 'https://api.lista.org/api/moolah';

// Resolved at startup from --chain flag (default: bsc)
let chain;

// keccak256(sig).slice(0,4) — verified against deployed contract ABI
const SEL = {
  position:         '93c52062', // position(bytes32,address)
  market:           '5c60e39a', // market(bytes32)
  idToMarketParams: '2c3c9157', // idToMarketParams(bytes32)
  oraclePrice:      'a035b1fe', // price()  — Morpho oracle interface
  peek:             'acefafae', // peek(address)  — Lista price oracle
};

// ── ABI encoding ─────────────────────────────────────────────────────────────

/** Pad a hex value (with or without 0x) to 32 bytes (64 hex chars). */
function pad32(hex) {
  return hex.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
}

/** Encode a bytes32 argument (already 32 bytes; just strip 0x and zero-pad). */
function encBytes32(id) {
  const h = id.replace(/^0x/i, '').toLowerCase();
  if (h.length > 64) throw new Error(`bytes32 too long: ${id}`);
  return h.padStart(64, '0');
}

/** Encode an address argument (20 bytes, left-padded to 32). */
function encAddress(addr) {
  const h = addr.replace(/^0x/i, '').toLowerCase();
  if (h.length !== 40) throw new Error(`Invalid address: ${addr}`);
  return h.padStart(64, '0');
}

// ── ABI decoding ─────────────────────────────────────────────────────────────

/** Split a hex string into N × 64-char (32-byte) chunks. */
function chunks(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 64) out.push(hex.slice(i, i + 64));
  return out;
}

/** Decode a uint256/uint128 chunk → BigInt. */
function decUint(chunk) { return BigInt('0x' + chunk); }

/** Decode an address chunk (last 20 bytes of 32-byte slot). */
function decAddr(chunk) { return '0x' + chunk.slice(24); }

/** Format BigInt wei (1e18) to human-readable string. */
function toHuman(bn, decimals = 18) {
  const s = bn.toString().padStart(decimals + 1, '0');
  const int  = s.slice(0, s.length - decimals) || '0';
  const frac = s.slice(s.length - decimals).replace(/0+$/, '') || '0';
  return `${int}.${frac}`;
}

// ── Multicall3 helpers ────────────────────────────────────────────────────────

/**
 * Encode aggregate3((address,bool,bytes)[]) calldata for Multicall3.
 * Implements Ethereum ABI encoding manually — no external deps.
 *
 * ABI layout for dynamic array of dynamic tuples:
 *   [0x20]                    outer offset to array encoding
 *   [N]                       array length  ← start of array encoding
 *   [off_0]..[off_{N-1}]      element offsets, relative to byte after [N]
 *   [elem_0]..[elem_{N-1}]    element data (each: addr | bool | 0x60 | cdLen | cd padded)
 *
 * @param {Array<{target:string, allowFailure:boolean, callData:string}>} calls
 *   callData must be a hex string WITHOUT 0x prefix
 * @returns {string} hex calldata (no 0x) for the aggregate3 call
 */
function encodeAggregate3(calls) {
  const SEL_AGG3 = '82ad56cb'; // keccak256('aggregate3((address,bool,bytes)[])')
  const N = calls.length;

  // Build element encodings for each Call3 tuple (address target, bool allowFailure, bytes callData)
  const elements = calls.map(c => {
    const cd     = c.callData;               // hex, no 0x
    const cdLen  = cd.length / 2;            // byte length of callData
    const padLen = Math.ceil(cdLen / 32) * 32;
    const padding = '00'.repeat(padLen - cdLen);
    return (
      encAddress(c.target)                              // address (32 bytes)
      + (c.allowFailure ? '1' : '0').padStart(64, '0') // bool (32 bytes)
      + pad32('60')                                     // bytes offset = 0x60 (96) from elem start
      + pad32(cdLen.toString(16))                       // bytes length
      + cd + padding                                    // bytes data, padded to 32-byte boundary
    );
  });

  // Compute element offsets relative to the byte immediately after the [N] word
  // (the head section = N * 32 bytes, followed by the tail/element data)
  const offsets = [];
  let off = N * 32;
  for (const elem of elements) {
    offsets.push(off);
    off += elem.length / 2; // element size in bytes
  }

  // arrayData = [N] || [off_0..off_{N-1}] || [elem_0..elem_{N-1}]
  const arrayData = (
    pad32(N.toString(16))
    + offsets.map(o => pad32(o.toString(16))).join('')
    + elements.join('')
  );

  // params = [0x20] || arrayData  (outer offset 32 = start of arrayData)
  return SEL_AGG3 + pad32('20') + arrayData;
}

/**
 * Decode the raw return hex from Multicall3.aggregate3.
 * Return type: Result[] where Result = (bool success, bytes returnData)
 *
 * ABI layout of Result[]:
 *   [0x20]          outer offset (= 32, array starts at byte 32)
 *   [N]             array length
 *   [h_0..h_{N-1}]  element offsets, relative to byte 64 (start of head section)
 *   per element: [bool][0x40 offset to bytes][bytes length][bytes data padded]
 *
 * @param {string} hex - raw RPC result (no 0x prefix)
 * @returns {Array<{success:boolean, data:string}>}  data is hex (no 0x)
 */
function decodeAggregate3Result(hex) {
  const c = chunks(hex);
  // c[0] = 0x20 (outer offset — array encoding starts at byte 32)
  // c[1] = N   (at byte 32)
  // c[2..N+1]  = element offsets, relative to HEAD_BASE (byte 64 = byte after [N])
  const N = Number(decUint(c[1]));
  const HEAD_BASE = 64; // absolute byte where element offset table begins

  const results = [];
  for (let i = 0; i < N; i++) {
    const elemOff  = Number(decUint(c[2 + i])); // bytes from HEAD_BASE to element start
    const elemByte = HEAD_BASE + elemOff;        // absolute byte of element
    const ec       = elemByte / 32;              // chunk index of element start

    const success       = decUint(c[ec]) !== 0n;
    const bytesRelOff   = Number(decUint(c[ec + 1])); // offset to bytes tail from element start (= 0x40)
    const bytesLenByte  = elemByte + bytesRelOff;      // absolute byte of bytes length word
    const blc           = bytesLenByte / 32;

    const dataLen   = Number(decUint(c[blc]));
    const dataStart = bytesLenByte + 32;               // bytes data starts after length word
    const dataHex   = hex.slice(dataStart * 2, (dataStart + dataLen) * 2);

    results.push({ success, data: dataHex });
  }
  return results;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function request(url, opts = {}, body = null) {
  return new Promise((resolve, reject) => {
    const lib  = url.startsWith('https') ? https : http;
    const req  = lib.request(url, { timeout: 10000, ...opts }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

let _callId = 1;

/**
 * Make an eth_call to the active chain's RPC.
 * @param {string} to       - Contract address
 * @param {string} calldata - Hex calldata (no 0x prefix)
 * @param {string} [rpcUrl] - Override RPC URL (defaults to chain.rpc)
 * Returns the raw hex result (no 0x prefix).
 */
async function ethCall(to, calldata, rpcUrl) {
  const url  = rpcUrl || chain.rpc;
  const body = JSON.stringify({
    jsonrpc: '2.0',
    method:  'eth_call',
    params:  [{ to, data: '0x' + calldata }, 'latest'],
    id:      _callId++,
  });
  const resp = await request(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if (resp.error) throw new Error(`RPC error: ${resp.error.message}`);
  return (resp.result || '').replace(/^0x/i, '');
}

/** GET a Lista REST API endpoint. */
async function apiGet(path) {
  const resp = await request(`${API_URL}${path}`);
  if (resp.code !== '000000000') throw new Error(`API error: ${resp.message}`);
  return resp.data;
}

// ── Commands ──────────────────────────────────────────────────────────────────

/**
 * position <marketId> <userAddr>
 * Reads a user's position in one market via Moolah.position(bytes32,address).
 */
async function cmdPosition(marketId, userAddr) {
  if (!marketId || !userAddr) throw new Error('Usage: position <marketId> <userAddr>');
  const calldata = SEL.position + encBytes32(marketId) + encAddress(userAddr);
  const raw = await ethCall(chain.moolah, calldata);
  if (!raw || raw.length < 192) throw new Error('Empty response — check marketId');

  const c = chunks(raw);
  const supplyShares = decUint(c[0]);
  const borrowShares = decUint(c[1]);
  const collateral   = decUint(c[2]);

  return {
    marketId,
    user:         userAddr.toLowerCase(),
    supplyShares: supplyShares.toString(),
    borrowShares: borrowShares.toString(),
    collateral:   collateral.toString(),
    hasSupply:    supplyShares > 0n,
    hasBorrow:    borrowShares > 0n,
    hasCollateral: collateral > 0n,
    hasPosition:  borrowShares > 0n || collateral > 0n,
  };
}

/**
 * market <marketId>
 * Reads current market state via Moolah.market(bytes32).
 */
async function cmdMarket(marketId) {
  if (!marketId) throw new Error('Usage: market <marketId>');
  const calldata = SEL.market + encBytes32(marketId);
  const raw = await ethCall(chain.moolah, calldata);
  if (!raw || raw.length < 384) throw new Error('Empty response — check marketId');

  const c = chunks(raw);
  const totalSupplyAssets = decUint(c[0]);
  const totalSupplyShares = decUint(c[1]);
  const totalBorrowAssets = decUint(c[2]);
  const totalBorrowShares = decUint(c[3]);
  const lastUpdate        = decUint(c[4]);
  const fee               = decUint(c[5]);

  const freeLiquidity = totalSupplyAssets - totalBorrowAssets;
  const utilization   = totalSupplyAssets > 0n
    ? Number(totalBorrowAssets * 10000n / totalSupplyAssets) / 10000
    : 0;

  return {
    marketId,
    totalSupplyAssets: totalSupplyAssets.toString(),
    totalSupplyShares: totalSupplyShares.toString(),
    totalBorrowAssets: totalBorrowAssets.toString(),
    totalBorrowShares: totalBorrowShares.toString(),
    lastUpdate:        Number(lastUpdate),
    lastUpdateIso:     new Date(Number(lastUpdate) * 1000).toISOString(),
    fee:               fee.toString(),
    freeLiquidity:     freeLiquidity.toString(),
    utilization,
    utilizationPct:   `${(utilization * 100).toFixed(2)}%`,
  };
}

/**
 * params <marketId>
 * Reads market parameters via Moolah.idToMarketParams(bytes32).
 * Returns loanToken, collateralToken, oracle, irm, lltv.
 */
async function cmdParams(marketId) {
  if (!marketId) throw new Error('Usage: params <marketId>');
  const calldata = SEL.idToMarketParams + encBytes32(marketId);
  const raw = await ethCall(chain.moolah, calldata);
  if (!raw || raw.length < 320) throw new Error(`Empty response — check marketId or selector 0x2c3c9157 on ${chain.name}`);

  const c = chunks(raw);
  const lltv = decUint(c[4]);

  return {
    marketId,
    loanToken:       decAddr(c[0]),
    collateralToken: decAddr(c[1]),
    oracle:          decAddr(c[2]),
    irm:             decAddr(c[3]),
    lltv:            lltv.toString(),
    lltvPct:         `${(Number(lltv) / 1e16).toFixed(1)}%`,   // 1e18 scale → %
  };
}

/**
 * oracle-price <marketId>
 * Fetches the oracle price via the oracle contract's price() function.
 * The price is scaled 1e36: collateral_in_loan = collateral × price / 1e36
 */
async function cmdOraclePrice(marketId) {
  if (!marketId) throw new Error('Usage: oracle-price <marketId>');

  const params = await cmdParams(marketId);
  const oracleAddr = params.oracle;

  const raw = await ethCall(oracleAddr, SEL.oraclePrice);
  if (!raw || raw.length < 64) throw new Error(`price() failed on oracle ${oracleAddr}`);

  const price = decUint(chunks(raw)[0]);

  return {
    marketId,
    oracle:      oracleAddr,
    price:       price.toString(),
    note:        'collateral_in_loan_tokens = collateral_amount × price / 1e36',
    lltv:        params.lltv,
    lltvPct:     params.lltvPct,
  };
}

/**
 * user-positions <userAddr>
 * Scans all markets (via Lista API) and returns markets where this user
 * has an active position (borrowShares > 0 or collateral > 0).
 *
 * Uses Multicall3 to batch all RPC calls:
 *   - 1 call: aggregate3 with N position(marketId, user) lookups
 *   - 1 call: aggregate3 with M market() lookups for active positions only
 * Total: 2 RPC calls regardless of market count (vs 110+ sequential before).
 */
async function cmdUserPositions(userAddr) {
  if (!userAddr) throw new Error('Usage: user-positions <userAddr>');

  // 1. Collect all unique market IDs from vault allocations (API calls, unchanged)
  const vaultData = await apiGet('/vault/list?pageSize=100');
  const vaults    = vaultData.list;

  const markets = new Map(); // marketId → allocation info
  for (const vault of vaults) {
    const alloc = await apiGet(`/vault/allocation?address=${vault.address}&pageSize=100`);
    for (const m of alloc.list) {
      if (!markets.has(m.id)) markets.set(m.id, m);
    }
  }

  const marketIds = [...markets.keys()];
  if (marketIds.length === 0) {
    return { user: userAddr.toLowerCase(), totalMarkets: 0, activePositions: 0, positions: [] };
  }

  // 2. Batch all position(marketId, user) calls in a single aggregate3 RPC call
  const positionCalls = marketIds.map(id => ({
    target:       chain.moolah,
    allowFailure: true,
    callData:     SEL.position + encBytes32(id) + encAddress(userAddr),
  }));
  const posRaw     = await ethCall(chain.multicall3, encodeAggregate3(positionCalls));
  const posResults = decodeAggregate3Result(posRaw);

  // 3. Identify active positions (borrowShares > 0 or collateral > 0)
  const activeIdx = [];
  for (let i = 0; i < posResults.length; i++) {
    const { success, data } = posResults[i];
    if (!success || data.length < 192) continue; // need 3 × 32-byte slots
    const pc = chunks(data);
    if (decUint(pc[1]) > 0n || decUint(pc[2]) > 0n) activeIdx.push(i);
  }

  if (activeIdx.length === 0) {
    return { user: userAddr.toLowerCase(), totalMarkets: markets.size, activePositions: 0, positions: [] };
  }

  // 4. Batch market() calls for active markets only (second aggregate3 call)
  const marketCalls = activeIdx.map(i => ({
    target:       chain.moolah,
    allowFailure: true,
    callData:     SEL.market + encBytes32(marketIds[i]),
  }));
  const mktRaw     = await ethCall(chain.multicall3, encodeAggregate3(marketCalls));
  const mktResults = decodeAggregate3Result(mktRaw);

  // 5. Compute currentDebt and build output
  const positions = [];
  for (let j = 0; j < activeIdx.length; j++) {
    const i        = activeIdx[j];
    const marketId = marketIds[i];
    const info     = markets.get(marketId);

    const pc           = chunks(posResults[i].data);
    const supplyShares = decUint(pc[0]);
    const borrowShares = decUint(pc[1]);
    const collateral   = decUint(pc[2]);

    let currentDebt  = '0';
    let lastUpdate   = null;
    let lastUpdateIso = null;

    const { success: mOk, data: mData } = mktResults[j];
    if (mOk && mData.length >= 384) { // need 6 × 32-byte slots
      const mc            = chunks(mData);
      const totalBorrowAssets = decUint(mc[2]);
      const totalBorrowShares = decUint(mc[3]);
      lastUpdate    = Number(decUint(mc[4]));
      lastUpdateIso = new Date(lastUpdate * 1000).toISOString();
      if (totalBorrowShares > 0n && borrowShares > 0n) {
        currentDebt = (borrowShares * totalBorrowAssets / totalBorrowShares).toString();
      }
    }

    positions.push({
      marketId,
      collateralSymbol: info.collateralSymbol ?? '?',
      loanSymbol:       info.loanSymbol       ?? '?',
      supplyShares:     supplyShares.toString(),
      borrowShares:     borrowShares.toString(),
      collateral:       collateral.toString(),
      currentDebt,
      lastUpdate,
      lastUpdateIso,
    });
  }

  return {
    user:            userAddr.toLowerCase(),
    totalMarkets:    markets.size,
    activePositions: positions.length,
    positions,
  };
}

/**
 * token-price <tokenAddress>
 * Queries the USD price of a token via the chain's Lista price oracle.
 * Uses oracle.peek(address) — returns price with 8 decimal places.
 *
 * Token addresses can be obtained from:
 *   - moolah.js params <marketId>  (loanToken / collateralToken fields)
 *   - Lista API: /api/moolah/market/<marketId>  (loanToken / collateralToken)
 */
async function cmdTokenPrice(tokenAddr) {
  if (!tokenAddr) throw new Error('Usage: token-price <tokenAddress>');
  if (!chain.oracle) throw new Error(`No oracle configured for chain ${chain.name}`);

  const calldata = SEL.peek + encAddress(tokenAddr);
  const raw = await ethCall(chain.oracle, calldata);
  if (!raw || raw.length < 64) throw new Error(`peek() failed on oracle ${chain.oracle}`);

  const price = decUint(chunks(raw)[0]);

  return {
    token:       tokenAddr.toLowerCase(),
    oracle:      chain.oracle,
    chain:       chain.name,
    priceRaw:    price.toString(),
    priceUSD:    toHuman(price, 8),        // 8 decimal places
    note:        'price is 8-decimal USD; priceUSD = priceRaw / 1e8',
  };
}

/**
 * lp-price <marketId>
 * Computes the USD price of an LP token collateral in a Smart Lending market.
 *
 * Smart Lending markets use a Curve StableSwap LP as collateral.
 * Calling oracle-price on these markets always reverts — use this instead.
 *
 * Steps:
 *   1. Fetch smartCollateralConfig from Lista API (swapPool, token0 address)
 *   2. Call get_virtual_price() on the Curve pool  → 1e18-scaled, LP value in coin0 units
 *   3. Call oracle.peek(token0)                    → 8-decimal USD price of coin0
 *   4. lpTokenPriceUSD = (virtualPrice / 1e18) × (coin0PriceRaw / 1e8)
 */
async function cmdLpPrice(marketId) {
  if (!marketId) throw new Error('Usage: lp-price <marketId>');
  if (!chain.oracle) throw new Error(`No oracle configured for chain ${chain.name}`);

  // 1. Fetch Smart Lending config from Lista API
  const mkt = await apiGet(`/market/${marketId}`);
  const cfg  = mkt.smartCollateralConfig;
  if (!cfg || !cfg.swapPool) {
    throw new Error('Not a Smart Lending market — use token-price for ERC20 collateral');
  }

  const swapPool     = cfg.swapPool;
  const token0       = cfg.token0;
  const token0Symbol = cfg.token0Symbol || 'coin0';
  const token1Symbol = cfg.token1Symbol || 'coin1';

  // 2. get_virtual_price() on Curve pool — selector 0xbb7b8b80, no args
  const vpRaw = await ethCall(swapPool, 'bb7b8b80');
  if (!vpRaw || vpRaw.length < 64) throw new Error(`get_virtual_price() failed on ${swapPool}`);
  const virtualPrice = decUint(chunks(vpRaw)[0]); // 1e18

  // 3. peek(token0) on Lista oracle — 8 decimal places
  const peekRaw = await ethCall(chain.oracle, SEL.peek + encAddress(token0));
  if (!peekRaw || peekRaw.length < 64) throw new Error(`peek() failed for ${token0}`);
  const coin0PriceRaw = decUint(chunks(peekRaw)[0]); // 8dp

  // 4. LP token price in USD
  const virtualPriceF   = Number(virtualPrice) / 1e18;
  const coin0PriceUSD   = Number(coin0PriceRaw) / 1e8;
  const lpTokenPriceUSD = virtualPriceF * coin0PriceUSD;

  return {
    marketId,
    swapPool,
    token0:           token0.toLowerCase(),
    token0Symbol,
    token1Symbol,
    virtualPrice:     virtualPrice.toString(),
    virtualPriceF:    virtualPriceF.toFixed(8),
    coin0PriceRaw:    coin0PriceRaw.toString(),
    coin0PriceUSD:    coin0PriceUSD.toFixed(4),
    lpTokenPriceUSD:  lpTokenPriceUSD.toFixed(4),
    note:             'lpTokenPriceUSD = (virtualPrice/1e18) × (coin0PriceRaw/1e8)',
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const COMMANDS = {
  position:         cmdPosition,
  market:           cmdMarket,
  params:           cmdParams,
  'oracle-price':   cmdOraclePrice,
  'token-price':    cmdTokenPrice,
  'lp-price':       cmdLpPrice,
  'user-positions': cmdUserPositions,
};

const HELP = [
  'Moolah RPC tool — BSC + ETH Mainnet',
  '',
  'Usage: node moolah.js [--chain bsc|eth] <command> [args]',
  '',
  '  position       <marketId> <userAddr>   User position in one market',
  '  market         <marketId>              Market supply/borrow state',
  '  params         <marketId>              Market params (oracle, lltv)',
  '  oracle-price   <marketId>              Morpho oracle price ratio (1e36 scale)',
  '  token-price    <tokenAddress>          USD price via Lista oracle (8dp)',
  '  lp-price       <marketId>             USD price of Smart Lending LP token collateral',
  '  user-positions <userAddr>              All active positions (BSC only — uses Lista API)',
  '',
  'Chains:',
  '  --chain bsc   BSC Mainnet  — Moolah 0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C',
  '                               Oracle  0xf3afD82A4071f272F403dC176916141f44E6c750',
  '  --chain eth   Ethereum     — Moolah 0xf820fB4680712CD7263a0D3D024D5b5aEA82Fd70',
  '                               Oracle  0xA64FE284EB8279B9b63946DD51813b0116099301',
  '',
  'Default: --chain bsc',
  'Output: JSON on stdout. Errors on stderr.',
].join('\n');

// Parse --chain flag from argv, leaving remaining args for the command
const rawArgs = process.argv.slice(2);
let chainKey  = 'bsc';
const cmdArgs = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--chain' && rawArgs[i + 1]) {
    chainKey = rawArgs[++i].toLowerCase();
  } else {
    cmdArgs.push(rawArgs[i]);
  }
}

if (!CHAINS[chainKey]) {
  process.stderr.write(`Unknown chain "${chainKey}". Valid options: ${Object.keys(CHAINS).join(', ')}\n`);
  process.exit(1);
}

// Set the active chain (used by ethCall and all cmd* functions)
chain = CHAINS[chainKey];

const [cmd, ...args] = cmdArgs;

if (!cmd || !COMMANDS[cmd]) {
  process.stderr.write(HELP + '\n');
  process.exit(1);
}

COMMANDS[cmd](...args)
  .then(result => { console.log(JSON.stringify(result, null, 2)); })
  .catch(err   => { process.stderr.write(`Error: ${err.message}\n`); process.exit(1); });
