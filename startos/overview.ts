import { T } from '@start9labs/start-sdk'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { operatorTerms, sats } from './operator'
import { sdk } from './sdk'
import {
  apiPort,
  boltzrCli,
  dataDir,
  grpcCertificates,
  nodeRpcHostId,
  nodeRpcPort,
  pgDatabase,
  pgUser,
  RpcNode,
  testDataSubpath,
  testNodes,
  testRpcLogin,
} from './utils'

// A3d: the operator dashboard (blueprint 6.4, inside StartOS). Read fresh
// each time from the backend's API, its admin gRPC (boltzr-cli), the
// database and the nodes' RPC. Nothing here changes anything.

type ChainSymbol = 'BTC' | 'SHA256'

const nodes: { id: RpcNode; symbol: ChainSymbol }[] = [
  { id: 'bitcoind', symbol: 'BTC' },
  { id: 'knots-prerdts', symbol: 'SHA256' },
]

type NodeState = {
  blocks?: number
  headers?: number
  ibd?: boolean
  error?: string
}

type Balances = Record<
  string,
  {
    wallets: Record<string, { confirmed: number; unconfirmed: number }>
    lightning: Record<string, { local: number; remote: number }>
  }
>

type OpenSwap = {
  type: 'chain' | 'submarine' | 'reverse'
  id: string
  pair: string
  side: number
  status: string
  reason: string | null
  data: { symbol?: string; expected: number; timeout: number }[]
}

type ChainPair = {
  rate: number
  fees: { percentage: number }
  limits: { minimal: number; maximal: number }
}

export type Overview = {
  // A5 test mode (D46): the Mac's LAN address
  test: string | null
  mainnetLock: boolean
  paused: boolean
  lightning: boolean
  rate: number
  largest: number
  pair: ChainPair | null
  balances: Balances | null
  nodes: Record<ChainSymbol, NodeState>
  swaps: OpenSwap[] | null
  problems: string[]
}

// Not final in the backend (lib/consts/Enums.ts, Final*Events)
const openSwapsSql = `
select coalesce(json_agg(t order by t.created desc), '[]'::json) from (
  select 'chain' as type, c.id, c.pair, c."orderSide" as side, c.status,
    c."failureReason" as reason, c."createdAt" as created,
    (select json_agg(json_build_object('symbol', d.symbol,
       'expected', d."expectedAmount", 'timeout', d."timeoutBlockHeight"))
     from "chainSwapData" d where d."swapId" = c.id) as data
  from "chainSwaps" c
  where c.status not in ('swap.expired', 'transaction.failed',
    'transaction.claimed', 'transaction.refunded')
  union all
  select 'submarine', s.id, s.pair, s."orderSide", s.status,
    s."failureReason", s."createdAt",
    json_build_array(json_build_object('expected', s."expectedAmount",
      'timeout', s."timeoutBlockHeight"))
  from swaps s
  where s.status not in ('swap.expired', 'invoice.failedToPay',
    'transaction.claimed')
  union all
  select 'reverse', r.id, r.pair, r."orderSide", r.status,
    r."failureReason", r."createdAt",
    json_build_array(json_build_object('expected', r."onchainAmount",
      'timeout', r."timeoutBlockHeight"))
  from "reverseSwaps" r
  where r.status not in ('swap.expired', 'invoice.settled',
    'transaction.failed', 'transaction.refunded')
) t`

const nodeRpc = async (
  address: string,
  login: { user: string; password: string },
  method: string,
) => {
  const res = await fetch(`http://${address}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${login.user}:${login.password}`).toString('base64')}`,
    },
    // The Companion's btc-rpc-proxy refuses a request without params
    body: JSON.stringify({ jsonrpc: '1.0', id: 'swapsha', method, params: [] }),
    signal: AbortSignal.timeout(5_000),
  })
  const body = (await res.json()) as {
    result?: unknown
    error?: { message?: string } | null
  }
  if (body.error) throw new Error(body.error.message ?? String(res.status))
  return body.result
}

const reason = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 200)

export const gatherOverview = async (
  effects: T.Effects,
  { withBalances }: { withBalances: boolean },
): Promise<Overview> => {
  const store = await storeJson.read().once()
  const terms = operatorTerms(store?.operator)
  const problems: string[] = []

  const test = store?.testMode
  const overview: Overview = {
    test: test?.host ?? null,
    mainnetLock: !test,
    paused: terms.paused,
    lightning: !!store?.lightningFork?.macaroon,
    rate: terms.rate,
    largest: terms.maxSwapAmount,
    pair: null,
    balances: null,
    nodes: { BTC: {}, SHA256: {} },
    swaps: null,
    problems,
  }

  // The terms as the backend serves them
  try {
    const res = await fetch(`http://127.0.0.1:${apiPort}/v2/swap/chain`, {
      signal: AbortSignal.timeout(5_000),
    })
    const pairs = (await res.json()) as { BTC?: { SHA256?: ChainPair } }
    overview.pair = pairs.BTC?.SHA256 ?? null
    if (overview.pair) {
      overview.rate = overview.pair.rate
      overview.largest = overview.pair.limits.maximal
    }
  } catch (e) {
    problems.push(
      i18n('Could not read ${what}: ${reason}', {
        what: i18n('the terms'),
        reason: reason(e),
      }),
    )
  }

  // Each node's chain, through the same RPC login the backend uses
  await Promise.all(
    nodes.map(async ({ id, symbol }) => {
      const login = test ? testRpcLogin : store?.rpc?.[id]
      try {
        const address = test
          ? `${test.host}:${testNodes[symbol].rpcPort}`
          : await sdk.host
              .getBridgeAddress(effects, {
                packageId: id,
                hostId: nodeRpcHostId,
                internalPort: nodeRpcPort,
                ssl: false,
              })
              .once()
        if (!address || !login) throw new Error(i18n('not reachable'))
        const info = (await nodeRpc(address, login, 'getblockchaininfo')) as {
          blocks: number
          headers: number
          initialblockdownload: boolean
        }
        overview.nodes[symbol] = {
          blocks: info.blocks,
          headers: info.headers,
          ibd: info.initialblockdownload,
        }
      } catch (e) {
        overview.nodes[symbol] = { error: reason(e) }
      }
    }),
  )

  // Balances through the backend's admin gRPC; open swaps from the database
  await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'swapsha' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'main',
      subpath: test ? testDataSubpath : null,
      mountpoint: dataDir,
      readonly: true,
    }),
    'overview',
    async (sub) => {
      if (withBalances) {
        const res = await sub.exec(
          [
            boltzrCli,
            '--grpc-certificates',
            grpcCertificates,
            'wallet',
            'get-balance',
          ],
          { timeout: 20_000 },
        )
        try {
          if (res.exitCode !== 0) throw new Error(String(res.stderr))
          overview.balances = (
            JSON.parse(String(res.stdout)) as { balances: Balances }
          ).balances
        } catch (e) {
          problems.push(
            i18n('Could not read ${what}: ${reason}', {
              what: i18n('the wallet balances'),
              reason: reason(e),
            }),
          )
        }
      }

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
          openSwapsSql,
        ],
        { env: { PGPASSWORD: store?.pgPassword ?? '' }, timeout: 20_000 },
      )
      try {
        if (res.exitCode !== 0) throw new Error(String(res.stderr))
        overview.swaps = JSON.parse(String(res.stdout)) as OpenSwap[]
      } catch (e) {
        problems.push(
          i18n('Could not read ${what}: ${reason}', {
            what: i18n('the open swaps'),
            reason: reason(e),
          }),
        )
      }
    },
  )

  return overview
}

const chainName = (symbol: string) => (symbol === 'SHA256' ? 'SHA-256' : symbol)

const amount = (value: number, symbol: string) =>
  i18n('${amount} ${chain} sats', {
    amount: sats(value),
    chain: chainName(symbol),
  })

const swapsTurnedDown = (o: Overview) => o.mainnetLock || o.paused

// What one swap of each kind takes from SwapSha's side, in that side's sats:
// the largest swap is in SHA-256 sats, a BTC amount counts at the rate
const needs = (o: Overview) => ({
  SHA256: o.largest,
  BTC: Math.ceil(o.largest / o.rate),
})

const nodeName = (o: Overview, symbol: ChainSymbol) =>
  o.test
    ? symbol === 'BTC'
      ? i18n('Testnet4 node on the Mac (BTC)')
      : i18n('Testnet4 node on the Mac (SHA-256)')
    : symbol === 'BTC'
      ? i18n('Bitcoin Knots (BTC)')
      : i18n('Companion (SHA-256)')

const behind = (n: NodeState) =>
  n.ibd === true ||
  (n.blocks !== undefined &&
    n.headers !== undefined &&
    n.headers - n.blocks > 2)

// The liquidity rows: label, confirmed, unconfirmed, need
const liquidityRows = (o: Overview) => {
  const rows: {
    label: string
    have: number
    pending: number | null
    need: number
    symbol: ChainSymbol
  }[] = []
  if (!o.balances) return rows
  const need = needs(o)
  const core = (symbol: ChainSymbol) => o.balances?.[symbol]?.wallets?.Core
  for (const symbol of ['BTC', 'SHA256'] as const) {
    const w = core(symbol)
    rows.push({
      label:
        symbol === 'BTC'
          ? i18n('BTC node wallet')
          : i18n('SHA-256 node wallet'),
      have: w?.confirmed ?? 0,
      pending: w?.unconfirmed ?? 0,
      need: need[symbol],
      symbol,
    })
  }
  const btc = o.balances.BTC
  if (btc) {
    for (const [key, w] of Object.entries(btc.wallets ?? {})) {
      if (key === 'Core') continue
      rows.push({
        label: i18n('Lightning Fork on-chain wallet'),
        have: w.confirmed,
        pending: w.unconfirmed,
        need: 0,
        symbol: 'BTC',
      })
    }
    for (const ln of Object.values(btc.lightning ?? {})) {
      rows.push({
        label: i18n('Lightning Fork channels, outbound'),
        have: ln.local,
        pending: null,
        need: need.BTC,
        symbol: 'BTC',
      })
      rows.push({
        label: i18n('Lightning Fork channels, inbound'),
        have: ln.remote,
        pending: null,
        need: need.BTC,
        symbol: 'BTC',
      })
    }
  }
  return rows
}

export const overviewAlerts = (o: Overview): string[] => {
  const alerts: string[] = []
  for (const swap of o.swaps ?? []) {
    if (swap.reason?.startsWith('REPLAY_FLAGGED')) {
      alerts.push(
        i18n(
          "REPLAY_FLAGGED: chain swap ${id}. The backend did not lock because the user's lockup could be replayed; the user has to refund it.",
          { id: swap.id },
        ),
      )
    }
  }
  for (const { symbol } of nodes) {
    const n = o.nodes[symbol]
    if (n.error) {
      alerts.push(
        i18n('${node} did not answer: ${reason}', {
          node: nodeName(o, symbol),
          reason: n.error,
        }),
      )
    } else if (behind(n)) {
      alerts.push(
        i18n('${node} is behind: block ${blocks} of ${headers}', {
          node: nodeName(o, symbol),
          blocks: sats(n.blocks ?? 0),
          headers: sats(n.headers ?? 0),
        }),
      )
    }
  }
  // Low liquidity only matters while new swaps can be made
  if (!swapsTurnedDown(o)) {
    for (const row of liquidityRows(o)) {
      if (row.need > 0 && row.have < row.need) {
        alerts.push(
          i18n(
            'Low liquidity: ${wallet} holds ${have}, the largest swap needs ${need}',
            {
              wallet: row.label,
              have: amount(row.have, row.symbol),
              need: amount(row.need, row.symbol),
            },
          ),
        )
      }
    }
  }
  return [...alerts, ...o.problems]
}

// Blocks are counted at the nominal 10 minutes (no pace bounds yet, D30)
const expiry = (o: Overview, symbol: string, timeout: number) => {
  const height = o.nodes[symbol as ChainSymbol]?.blocks
  if (height === undefined) {
    return i18n('${chain} block ${height}', {
      chain: chainName(symbol),
      height: sats(timeout),
    })
  }
  const left = timeout - height
  if (left <= 0) {
    return i18n('${chain} block ${height}, passed', {
      chain: chainName(symbol),
      height: sats(timeout),
    })
  }
  return i18n(
    '${chain} block ${height}, in ${blocks} blocks (about ${hours} h)',
    {
      chain: chainName(symbol),
      height: sats(timeout),
      blocks: sats(left),
      hours: String(Math.round((left * 10) / 6) / 10),
    },
  )
}

// [user locks, SwapSha locks or pays], per swap type and order side
// (getChainCurrency in the backend's lib/Utils.ts; 1 is sell)
const swapRow = (o: Overview, swap: OpenSwap) => {
  const [base, quote] = swap.pair.split('/')
  const sell = swap.side === 1
  const lightning = i18n('Lightning')
  let from: string
  let to: string
  let chain: string
  let kind: string
  if (swap.type === 'chain') {
    from = sell ? base : quote
    to = sell ? quote : base
    chain = from
    kind = i18n('Chain swap')
  } else if (swap.type === 'submarine') {
    chain = sell ? base : quote
    from = chain
    to = lightning
    kind = i18n('Submarine swap')
  } else {
    chain = sell ? quote : base
    from = lightning
    to = chain
    kind = i18n('Reverse swap')
  }
  const data =
    swap.type === 'chain'
      ? swap.data.find((d) => d.symbol === from)
      : swap.data[0]
  const status = swap.reason ? `${swap.status}: ${swap.reason}` : swap.status
  return [
    `${kind} \`${swap.id}\``,
    i18n('${from} to ${to}', {
      from: chainName(from),
      to: chainName(to),
    }),
    status.replace(/\|/g, '/'),
    data ? amount(data.expected, chain) : '',
    data ? expiry(o, chain, data.timeout) : '',
  ]
}

const table = (header: string[], rows: string[][]) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n')

const shownSwaps = 50

export const overviewMarkdown = (o: Overview): string => {
  const parts: string[] = []

  if (o.test) {
    parts.push(
      i18n('**TEST MODE** on testnet4, nodes at ${host}.', { host: o.test }),
    )
  }

  const turnedDown: string[] = []
  if (o.mainnetLock)
    turnedDown.push(i18n('mainnet stays off until Phase 5 (D37)'))
  if (o.paused) turnedDown.push(i18n('paused by the operator'))
  parts.push(
    turnedDown.length
      ? i18n('**New swaps are turned down:** ${reasons}.', {
          reasons: turnedDown.join('; '),
        })
      : i18n('**New swaps are open.**'),
  )

  parts.push(`### ${i18n('Terms')}`)
  parts.push(
    o.pair
      ? i18n(
          'Rate ${rate} SHA-256 per BTC, fee ${fee}% each way, swaps from ${min} to ${max} SHA-256 sats',
          {
            rate: String(o.pair.rate),
            fee: String(o.pair.fees.percentage),
            min: sats(o.pair.limits.minimal),
            max: sats(o.pair.limits.maximal),
          },
        )
      : '-',
  )

  parts.push(`### ${i18n('Liquidity')}`)
  const rows = liquidityRows(o)
  parts.push(
    rows.length
      ? table(
          [
            i18n('Wallet'),
            i18n('Confirmed'),
            i18n('Unconfirmed'),
            i18n('Covers the largest swap'),
          ],
          rows.map((r) => [
            r.label,
            amount(r.have, r.symbol),
            r.pending === null ? '' : amount(r.pending, r.symbol),
            r.need === 0
              ? ''
              : r.have >= r.need
                ? i18n('Yes')
                : i18n('No: needs ${amount}', {
                    amount: amount(r.need, r.symbol),
                  }),
          ]),
        )
      : '-',
  )

  parts.push(`### ${i18n('Nodes')}`)
  parts.push(
    table(
      [i18n('Node'), i18n('Blocks'), i18n('Headers'), i18n('In sync')],
      nodes.map(({ symbol }) => {
        const n = o.nodes[symbol]
        return n.error
          ? [nodeName(o, symbol), '', '', n.error]
          : [
              nodeName(o, symbol),
              sats(n.blocks ?? 0),
              sats(n.headers ?? 0),
              behind(n) ? i18n('No') : i18n('Yes'),
            ]
      }),
    ),
  )

  const swaps = o.swaps ?? []
  parts.push(
    `### ${i18n('Open swaps (${count})', { count: String(swaps.length) })}`,
  )
  if (o.swaps === null) {
    parts.push('-')
  } else if (swaps.length === 0) {
    parts.push(i18n('None.'))
  } else {
    parts.push(
      table(
        [
          i18n('Swap'),
          i18n('Direction'),
          i18n('Status'),
          i18n('Amount'),
          i18n('Expires'),
        ],
        swaps.slice(0, shownSwaps).map((s) => swapRow(o, s)),
      ),
    )
    if (swaps.length > shownSwaps) {
      parts.push(
        i18n('Showing the newest ${shown} of ${count}.', {
          shown: String(shownSwaps),
          count: String(swaps.length),
        }),
      )
    }
  }

  parts.push(`### ${i18n('Alerts')}`)
  const alerts = overviewAlerts(o)
  parts.push(
    alerts.length ? alerts.map((a) => `- ${a}`).join('\n') : i18n('None.'),
  )
  if (swapsTurnedDown(o)) {
    parts.push(i18n('Low liquidity is an alert only while new swaps are open.'))
  }

  return parts.join('\n\n')
}
