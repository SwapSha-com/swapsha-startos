import { T, z } from '@start9labs/start-sdk'
import { readFile, rename, writeFile } from 'fs/promises'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sats } from './operator'
import { sdk } from './sdk'
import {
  boltzrCli,
  companionRpcLocalHostId,
  companionRpcLocalPort,
  dataDir,
  nodeRpcHostId,
  nodeRpcPort,
  nodeWalletName,
  pgDatabase,
  pgUser,
  testDataSubpath,
  testNodes,
  testRpcLogin,
  testWalletName,
} from './utils'

// A4b, D44 (amended Nov 9): the rescue file. Once a minute, while SwapSha
// runs, the open swaps are read from the database and written to
// rescue.json in the backend's data directory, so every StartOS backup holds
// it (D40). Export Rescue Data shows it; Rescue Swap signs from it while
// SwapSha is stopped, with the key derived from seed.dat inside a temporary
// container (patch 0056, boltzr-cli tools derive-key). Nothing here is read
// from the database at rescue time: that is what may have broken.

const chainSymbol = z.enum(['BTC', 'SHA256'])
export type ChainSymbol = z.infer<typeof chainSymbol>

// One lockup and what SwapSha needs to spend it on its own
const legShape = z.object({
  chain: chainSymbol,
  lockupAddress: z.string(),
  transactionId: z.string(),
  vout: z.number().int().nullable(),
  amount: z.number().nullable(),
  // The lockup's timeout: SwapSha refunds its own from this block on; it
  // must claim the user's before the user can refund at this block
  timeoutBlockHeight: z.number().int(),
  // SwapSha's key in seed.dat: the currency's derivation path and the swap's
  // key index, as WalletManager derives it
  keyPath: z.string().nullable(),
  swapTree: z.string().nullable(),
})
export type RescueLeg = z.infer<typeof legShape>

const swapShape = z.object({
  id: z.string(),
  type: z.enum(['chain', 'submarine', 'reverse']),
  status: z.string(),
  created: z.string(),
  // Once SwapSha has it: the user's claim revealed it (chain, reverse), or
  // SwapSha paid the invoice (submarine)
  preimage: z.string().nullable(),
  // SwapSha's own lockup, to refund after its timeout
  refund: legShape.nullable(),
  // The user's lockup, which SwapSha claims with the preimage
  claim: legShape.nullable(),
})
export type RescueSwap = z.infer<typeof swapShape>

const fileShape = z.object({
  version: z.literal(1),
  network: z.enum(['mainnet', 'testnet']),
  // When the swaps in it last changed
  updated: z.string(),
  swaps: z.array(swapShape),
})
export type RescueFile = z.infer<typeof fileShape>

// D44 (third amendment, Nov 10): what Rescue Swap signed, next to the rescue
// file, for the backend to adopt once it is confirmed (swapsha-backend
// lib/blake2b/RescueRecords.ts). Kept as history; the backend skips records
// whose swap is final.
const recordShape = z.object({
  id: z.string(),
  kind: z.enum(['refund', 'claim']),
  chain: chainSymbol,
  txid: z.string(),
  hex: z.string(),
  at: z.string(),
  broadcast: z.boolean(),
})
export type RescueRecord = z.infer<typeof recordShape>
const rescuedShape = z.object({
  version: z.literal(1),
  rescues: z.array(recordShape),
})

const rescuedPath = (test: boolean) =>
  test ? `${testDataSubpath}/rescued.json` : 'rescued.json'

export const readRescued = async (test: boolean): Promise<RescueRecord[]> => {
  try {
    const text = await readFile(
      sdk.volumes.main.subpath(rescuedPath(test)),
      'utf8',
    )
    return rescuedShape.parse(JSON.parse(text)).rescues
  } catch {
    return []
  }
}

const recordRescue = async (test: boolean, record: RescueRecord) => {
  const rescues = [...(await readRescued(test)), record]
  const path = sdk.volumes.main.subpath(rescuedPath(test))
  await writeFile(
    `${path}.new`,
    JSON.stringify({ version: 1, rescues }, null, 2) + '\n',
    { mode: 0o600 },
  )
  await rename(`${path}.new`, path)
}

const rescuePath = (test: boolean) =>
  test ? `${testDataSubpath}/rescue.json` : 'rescue.json'

// The same open swaps as the dashboard (overview.ts), with what a rescue
// needs. A chain swap has two rows in chainSwapData, one per chain.
const rescueSql = `
select json_build_object(
  'keys', (select coalesce(json_object_agg(k.symbol, k."derivationPath"), '{}'::json) from keys k),
  'swaps', (select coalesce(json_agg(t order by t.created), '[]'::json) from (
    select 'chain' as type, c.id, c.pair, c."orderSide" as side, c.status,
      c."createdAt" as created, c.preimage,
      (select json_agg(json_build_object('symbol', d.symbol,
         'keyIndex', d."keyIndex", 'lockupAddress', d."lockupAddress",
         'timeout', d."timeoutBlockHeight", 'swapTree', d."swapTree",
         'amount', coalesce(d.amount, d."expectedAmount"),
         'transactionId', d."transactionId", 'vout', d."transactionVout"))
       from "chainSwapData" d where d."swapId" = c.id) as data
    from "chainSwaps" c
    where c.status not in ('swap.expired', 'transaction.failed',
      'transaction.claimed', 'transaction.refunded')
    union all
    select 'submarine', s.id, s.pair, s."orderSide", s.status, s."createdAt",
      s.preimage,
      json_build_array(json_build_object('symbol', null,
        'keyIndex', s."keyIndex", 'lockupAddress', s."lockupAddress",
        'timeout', s."timeoutBlockHeight", 'swapTree', s."redeemScript",
        'amount', coalesce(s."onchainAmount", s."expectedAmount"),
        'transactionId', s."lockupTransactionId",
        'vout', s."lockupTransactionVout"))
    from swaps s
    where s.status not in ('swap.expired', 'invoice.failedToPay',
      'transaction.claimed')
    union all
    select 'reverse', r.id, r.pair, r."orderSide", r.status, r."createdAt",
      r.preimage,
      json_build_array(json_build_object('symbol', null,
        'keyIndex', r."keyIndex", 'lockupAddress', r."lockupAddress",
        'timeout', r."timeoutBlockHeight", 'swapTree', r."redeemScript",
        'amount', r."onchainAmount",
        'transactionId', r."transactionId", 'vout', r."transactionVout"))
    from "reverseSwaps" r
    where r.status not in ('swap.expired', 'invoice.settled',
      'transaction.failed', 'transaction.refunded')
  ) t)
)`

type DataRow = {
  symbol: string | null
  keyIndex: number | null
  lockupAddress: string
  timeout: number
  swapTree: string | null
  amount: number | null
  transactionId: string | null
  vout: number | null
}

type SwapRow = {
  type: RescueSwap['type']
  id: string
  pair: string
  side: number
  status: string
  created: string
  preimage: string | null
  data: DataRow[] | null
}

// lib/Utils.ts in the backend: getSendingReceivingCurrency and
// getChainCurrency, with OrderSide BUY = 0
const sides = (row: SwapRow) => {
  const [base, quote] = row.pair.split('/')
  const buy = row.side === 0
  return {
    chainSending: buy ? base : quote,
    chainReceiving: buy ? quote : base,
    submarine: buy ? quote : base,
    reverse: buy ? base : quote,
  }
}

const toLeg = (
  symbol: string,
  d: DataRow | undefined,
  keys: Record<string, string>,
): RescueLeg | null => {
  if (!d?.transactionId) return null
  const parsed = chainSymbol.safeParse(symbol)
  if (!parsed.success) return null
  return {
    chain: parsed.data,
    lockupAddress: d.lockupAddress,
    transactionId: d.transactionId,
    vout: d.vout,
    amount: d.amount === null ? null : Number(d.amount),
    timeoutBlockHeight: d.timeout,
    keyPath:
      d.keyIndex === null || keys[symbol] === undefined
        ? null
        : `${keys[symbol]}/${d.keyIndex}`,
    swapTree: d.swapTree,
  }
}

const toSwap = (row: SwapRow, keys: Record<string, string>): RescueSwap => {
  const s = sides(row)
  const data = row.data ?? []
  const base = {
    id: row.id,
    type: row.type,
    status: row.status,
    created: new Date(row.created).toISOString(),
    preimage: row.preimage,
  }
  if (row.type === 'chain') {
    return {
      ...base,
      refund: toLeg(
        s.chainSending,
        data.find((d) => d.symbol === s.chainSending),
        keys,
      ),
      claim: toLeg(
        s.chainReceiving,
        data.find((d) => d.symbol === s.chainReceiving),
        keys,
      ),
    }
  }
  if (row.type === 'submarine') {
    return { ...base, refund: null, claim: toLeg(s.submarine, data[0], keys) }
  }
  return { ...base, refund: toLeg(s.reverse, data[0], keys), claim: null }
}

const reason = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 300)

const readSwaps = async (
  effects: T.Effects,
  pgPassword: string,
): Promise<RescueSwap[]> =>
  sdk.SubContainer.withTemp(
    effects,
    { imageId: 'swapsha' },
    sdk.Mounts.of(),
    'rescue-file',
    async (sub) => {
      const res = await sub.exec(
        [
          'psql',
          '-h',
          '127.0.0.1',
          '-U',
          pgUser,
          '-d',
          pgDatabase,
          '-At',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          rescueSql,
        ],
        { env: { PGPASSWORD: pgPassword }, timeout: 20_000 },
      )
      if (res.exitCode !== 0) throw new Error(String(res.stderr))
      const out = JSON.parse(String(res.stdout)) as {
        keys: Record<string, string>
        swaps: SwapRow[]
      }
      return out.swaps.map((row) => toSwap(row, out.keys))
    },
  )

export const readRescueFile = async (
  test: boolean,
): Promise<RescueFile | null> => {
  let text: string
  try {
    text = await readFile(sdk.volumes.main.subpath(rescuePath(test)), 'utf8')
  } catch {
    return null
  }
  return fileShape.parse(JSON.parse(text))
}

// Something of SwapSha's that a rescue can take back now or later
export const atStake = (s: RescueSwap) =>
  !!s.refund || (!!s.claim && !!s.preimage)

/**
 * The health check: rewrites the file when the open swaps changed, and says
 * how many there are. The file is replaced in one step (rename), so a crash
 * mid-write leaves the last one whole.
 */
export const updateRescueFile = async (
  effects: T.Effects,
  { test, pgPassword }: { test: boolean; pgPassword: string },
): Promise<{ result: 'success' | 'failure'; message: string }> => {
  const network = test ? 'testnet' : 'mainnet'
  let swaps: RescueSwap[]
  try {
    swaps = await readSwaps(effects, pgPassword)
  } catch (e) {
    return {
      result: 'failure',
      message: i18n(
        'Could not update the rescue file: ${reason}. The last one written stays in place.',
        { reason: reason(e) },
      ),
    }
  }

  let last: RescueFile | null = null
  try {
    last = await readRescueFile(test)
  } catch {
    last = null
  }
  const changed =
    !last ||
    last.network !== network ||
    JSON.stringify(last.swaps) !== JSON.stringify(swaps)
  if (changed) {
    const file: RescueFile = {
      version: 1,
      network,
      updated: new Date().toISOString(),
      swaps,
    }
    const path = sdk.volumes.main.subpath(rescuePath(test))
    await writeFile(`${path}.new`, JSON.stringify(file, null, 2) + '\n', {
      mode: 0o600,
    })
    await rename(`${path}.new`, path)
  }

  return {
    result: 'success',
    message: i18n(
      "${open} open swaps, ${stake} with something of SwapSha's to refund or claim. Written to the rescue file, which every backup holds.",
      {
        open: String(swaps.length),
        stake: String(swaps.filter(atStake).length),
      },
    ),
  }
}

// ---- Rescue Swap: sign and broadcast with SwapSha stopped ----

type Login = { user: string; password: string }
type Node = { address: string; login: Login; wallet: string }

const nodeFor = async (
  effects: T.Effects,
  symbol: ChainSymbol,
): Promise<Node> => {
  const store = await storeJson.read().once()
  const test = store?.testMode
  if (test) {
    return {
      address: `${test.host}:${testNodes[symbol].rpcPort}`,
      login: testRpcLogin,
      wallet: testWalletName,
    }
  }
  // The SHA-256 node itself, past the Companion's RPC proxy (D40)
  const address =
    symbol === 'BTC'
      ? await sdk.host
          .getBridgeAddress(effects, {
            packageId: 'bitcoind',
            hostId: nodeRpcHostId,
            internalPort: nodeRpcPort,
            ssl: false,
          })
          .once()
      : await sdk.host
          .getBridgeAddress(effects, {
            packageId: 'knots-prerdts',
            hostId: companionRpcLocalHostId,
            internalPort: companionRpcLocalPort,
          })
          .once()
  const login = store?.rpc?.[symbol === 'BTC' ? 'bitcoind' : 'knots-prerdts']
  if (!address || !login) {
    throw new Error(
      symbol === 'BTC'
        ? i18n('Bitcoin Knots (BTC) is not reachable')
        : i18n('The Companion (SHA-256) is not reachable'),
    )
  }
  return { address: String(address), login, wallet: nodeWalletName }
}

const rpc = async <R>(
  node: Node,
  method: string,
  params: unknown[],
  { wallet = false, timeoutMs = 30_000 } = {},
): Promise<R> => {
  const path = wallet ? `wallet/${encodeURIComponent(node.wallet)}` : ''
  const res = await fetch(`http://${node.address}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${node.login.user}:${node.login.password}`).toString('base64')}`,
    },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'swapsha', method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = (await res.json()) as {
    result?: R
    error?: { message?: string } | null
  }
  if (body.error) {
    throw new Error(`${method}: ${body.error.message ?? String(res.status)}`)
  }
  return body.result as R
}

// The lockup transaction itself, which tx refund and tx claim take whole.
// SwapSha's own lockup is in its node wallet. Otherwise the node's
// transaction index if it has one; on a pruned node, the output's block from
// the UTXO set, which can take a few minutes on mainnet.
const lockupTransaction = async (node: Node, leg: RescueLeg, own: boolean) => {
  if (own) {
    try {
      const tx = await rpc<{ hex?: string }>(
        node,
        'gettransaction',
        [leg.transactionId],
        { wallet: true },
      )
      if (tx.hex) return tx.hex
    } catch {
      // not in the wallet: look on the chain
    }
  }
  try {
    return await rpc<string>(node, 'getrawtransaction', [
      leg.transactionId,
      false,
    ])
  } catch {
    // no transaction index: find its block
  }
  const scan = await rpc<{
    unspents: { txid: string; height: number }[]
  }>(node, 'scantxoutset', ['start', [`addr(${leg.lockupAddress})`]], {
    timeoutMs: 900_000,
  })
  const utxo = scan.unspents.find((u) => u.txid === leg.transactionId)
  if (!utxo) throw new Error(i18n('The lockup is not in the UTXO set'))
  const hash = await rpc<string>(node, 'getblockhash', [utxo.height])
  return rpc<string>(node, 'getrawtransaction', [
    leg.transactionId,
    false,
    hash,
  ])
}

export type RescuePlan =
  | { kind: 'refund'; leg: RescueLeg }
  | { kind: 'claim'; leg: RescueLeg; preimage: string }

// What a rescue does for a swap: claim the user's lockup once the preimage
// is known, else refund SwapSha's own after its timeout. A reverse swap
// whose preimage is known was claimed by the user; what is left is the hold
// invoice, on Lightning, which this does not touch.
export const rescuePlan = (s: RescueSwap): RescuePlan | null => {
  if (s.claim && s.preimage) {
    return { kind: 'claim', leg: s.claim, preimage: s.preimage }
  }
  if (s.refund && !(s.type === 'reverse' && s.preimage)) {
    return { kind: 'refund', leg: s.refund }
  }
  return null
}

export type RescueResult = {
  kind: RescuePlan['kind']
  chain: ChainSymbol
  txid: string | null
  hex: string
  signature: string
}

export const rescueSwap = async (
  effects: T.Effects,
  {
    swap,
    address,
    feeRate,
    broadcast,
  }: { swap: RescueSwap; address: string; feeRate: number; broadcast: boolean },
): Promise<RescueResult> => {
  const store = await storeJson.read().once()
  const test = !!store?.testMode
  const plan = rescuePlan(swap)
  if (!plan)
    throw new Error(
      i18n("Nothing of SwapSha's to refund or claim in this swap"),
    )
  const { leg } = plan
  if (!leg.keyPath || !leg.swapTree) {
    throw new Error(
      i18n('The rescue file has no key path or swap tree for this lockup'),
    )
  }

  const node = await nodeFor(effects, leg.chain)
  const valid = await rpc<{ isvalid: boolean }>(node, 'validateaddress', [
    address,
  ])
  if (!valid.isvalid) {
    throw new Error(
      i18n('${address} is not an address on this chain', { address }),
    )
  }

  // Spent already, by SwapSha before it stopped or by the user
  if (leg.vout !== null) {
    const out = await rpc<unknown>(node, 'gettxout', [
      leg.transactionId,
      leg.vout,
      true,
    ])
    if (out === null) {
      throw new Error(
        i18n(
          'The lockup ${txid}:${vout} is spent already: SwapSha or the user took it before this',
          { txid: leg.transactionId, vout: String(leg.vout) },
        ),
      )
    }
  }

  const height = await rpc<number>(node, 'getblockcount', [])
  if (plan.kind === 'refund' && height < leg.timeoutBlockHeight) {
    throw new Error(
      i18n(
        'The refund is possible from block ${timeout}; the chain is at ${height}',
        { timeout: String(leg.timeoutBlockHeight), height: String(height) },
      ),
    )
  }

  const raw = await lockupTransaction(node, leg, plan.kind === 'refund')

  const signed = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'swapsha' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'main',
      subpath: test ? testDataSubpath : null,
      mountpoint: dataDir,
      readonly: true,
    }),
    'rescue-swap',
    async (sub) => {
      const derived = await sub.exec(
        [boltzrCli, 'tools', 'derive-key', `${dataDir}/seed.dat`, leg.keyPath!],
        { timeout: 20_000 },
      )
      if (derived.exitCode !== 0) throw new Error(String(derived.stderr))
      const key = JSON.parse(String(derived.stdout)) as {
        public_key: string
        private_key: string
      }
      // The derived key must be the one in the swap's script
      if (!leg.swapTree!.includes(key.public_key.slice(2))) {
        throw new Error(
          i18n(
            "The key from seed.dat at ${path} is not in this swap's script: not the seed.dat this swap was made with",
            { path: leg.keyPath! },
          ),
        )
      }

      const network = test ? 'testnet' : 'mainnet'
      const command =
        plan.kind === 'refund'
          ? [
              boltzrCli,
              'tx',
              'refund',
              network,
              String(leg.timeoutBlockHeight),
              key.private_key,
              leg.swapTree!,
              raw,
              address,
              String(feeRate),
            ]
          : [
              boltzrCli,
              'tx',
              'claim',
              network,
              plan.preimage,
              key.private_key,
              leg.swapTree!,
              raw,
              address,
              String(feeRate),
            ]
      // D18: SwapSha signs on the BLAKE2b chain with SIGHASH_UNIFIED (0x21)
      if (leg.chain === 'BTC') command.push('--blake2b')
      const res = await sub.exec(command, { timeout: 30_000 })
      if (res.exitCode !== 0) throw new Error(String(res.stderr))
      return (JSON.parse(String(res.stdout)) as { transaction: string })
        .transaction
    },
  )

  // What the input's signature commits to: 64 bytes is SIGHASH_DEFAULT, 65
  // bytes ends in the sighash byte (0x21 on BTC)
  const decoded = await rpc<{
    txid: string
    vin: { txinwitness?: string[] }[]
  }>(node, 'decoderawtransaction', [signed])
  const sig = decoded.vin[0]?.txinwitness?.[0] ?? ''
  const signature =
    sig.length === 130
      ? i18n('65-byte Schnorr signature, sighash 0x${byte}', {
          byte: sig.slice(128),
        })
      : sig.length === 128
        ? i18n('64-byte Schnorr signature, SIGHASH_DEFAULT')
        : i18n('witness item of ${bytes} bytes', {
            bytes: String(sig.length / 2),
          })

  // Recorded before it is sent: a transaction that is never sent is never
  // confirmed, so the backend never adopts it
  await recordRescue(test, {
    id: swap.id,
    kind: plan.kind,
    chain: leg.chain,
    txid: decoded.txid,
    hex: signed,
    at: new Date().toISOString(),
    broadcast,
  })

  const txid = broadcast
    ? await rpc<string>(node, 'sendrawtransaction', [signed])
    : null
  return { kind: plan.kind, chain: leg.chain, txid, hex: signed, signature }
}

export const amountText = (leg: RescueLeg) =>
  leg.amount === null
    ? '?'
    : i18n('${amount} ${chain} sats', {
        amount: sats(leg.amount),
        chain: leg.chain === 'SHA256' ? 'SHA-256' : 'BTC',
      })
