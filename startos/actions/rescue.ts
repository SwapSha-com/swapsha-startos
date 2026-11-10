import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import {
  amountText,
  readRescued,
  readRescueFile,
  RescueSwap,
  rescuePlan,
  rescueSwap,
} from '../rescue'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

// A4b, D44 (amended Nov 9, twice): the operator's rescue. Export Rescue Data
// shows the rescue file at any time; Rescue Swap signs from it while SwapSha
// is stopped, so the backend cannot spend the same lockup at the same time.

const testMode = async () => !!(await storeJson.read().once())?.testMode

const chainName = (chain: string) => (chain === 'SHA256' ? 'SHA-256' : chain)

// What SwapSha's side of a swap is, in one line
const sideText = (s: RescueSwap) => {
  const plan = rescuePlan(s)
  if (plan?.kind === 'claim') {
    return i18n("Claim the user's lockup, ${amount}, before block ${height}", {
      amount: amountText(plan.leg),
      height: String(plan.leg.timeoutBlockHeight),
    })
  }
  if (plan?.kind === 'refund') {
    return i18n('Refund its own lockup, ${amount}, from block ${height}', {
      amount: amountText(plan.leg),
      height: String(plan.leg.timeoutBlockHeight),
    })
  }
  if (s.type === 'reverse' && s.preimage) {
    return i18n(
      'The user claimed: settle the hold invoice in Lightning Fork with the preimage before it expires',
    )
  }
  if (s.claim) {
    return i18n(
      "The user's lockup, ${amount}: SwapSha can claim it once it has the preimage",
      { amount: amountText(s.claim) },
    )
  }
  return i18n("Nothing of SwapSha's locked yet")
}

const cell = (text: string) => text.replace(/\|/g, '/')

export const exportRescueData = sdk.Action.withoutInput(
  'export-rescue-data',

  async () => ({
    name: i18n('Export Rescue Data'),
    description: i18n(
      "For every open swap, what it takes to refund or claim SwapSha's side without the backend: lockup, swap script, timeout and key path in seed.dat. Works while SwapSha is stopped.",
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Rescue'),
    visibility: 'enabled',
  }),

  async () => {
    const test = await testMode()
    const file = await readRescueFile(test)
    if (!file) {
      return {
        version: '1',
        title: i18n('Export Rescue Data'),
        message: i18n(
          'No rescue file yet: it is written once a minute while SwapSha runs.',
        ),
        result: null,
      }
    }

    const lines = [
      i18n(
        'Rescue file for ${network}, last changed ${time}. Every StartOS backup holds it.',
        { network: file.network, time: file.updated },
      ),
      '',
    ]
    if (file.swaps.length === 0) {
      lines.push(i18n('No open swaps: nothing to rescue.'))
    } else {
      lines.push(
        `| ${i18n('Swap')} | ${i18n('Type')} | ${i18n('Status')} | ${i18n("SwapSha's side")} |`,
        '|---|---|---|---|',
        ...file.swaps.map(
          (s) =>
            `| ${s.id} | ${s.type} | ${cell(s.status)} | ${cell(sideText(s))} |`,
        ),
        '',
        i18n(
          'To take any of these back without the backend: stop SwapSha, then run Rescue Swap.',
        ),
      )
    }
    // D44 (third amendment): what Rescue Swap signed so far
    const rescued = await readRescued(test)
    if (rescued.length > 0) {
      lines.push(
        '',
        i18n(
          'Rescues recorded for the backend, which marks each swap refunded or claimed once its transaction confirms:',
        ),
        '',
        ...rescued.map(
          (r) =>
            `- ${
              r.kind === 'refund'
                ? i18n('${id}: refund ${txid}', { id: r.id, txid: r.txid })
                : i18n('${id}: claim ${txid}', { id: r.id, txid: r.txid })
            }`,
        ),
      )
    }
    lines.push('', '```json', JSON.stringify(file, null, 2), '```')

    return {
      version: '1',
      title: i18n('Export Rescue Data'),
      message: lines.join('\n'),
      result: null,
    }
  },
)

const swapLabel = (s: RescueSwap) => {
  const plan = rescuePlan(s)!
  const values = {
    id: s.id,
    amount: amountText(plan.leg),
    chain: chainName(plan.leg.chain),
    height: String(plan.leg.timeoutBlockHeight),
  }
  return plan.kind === 'refund'
    ? i18n('${id}: refund ${amount} on ${chain}, from block ${height}', values)
    : i18n('${id}: claim ${amount} on ${chain}, before block ${height}', values)
}

const rescueSpec = InputSpec.of({
  swap: Value.dynamicSelect(async () => {
    let swaps: RescueSwap[] = []
    try {
      const file = await readRescueFile(await testMode())
      swaps = (file?.swaps ?? []).filter((s) => rescuePlan(s) !== null)
    } catch {
      swaps = []
    }
    return {
      name: i18n('Swap'),
      description: i18n(
        "From the rescue file: only swaps with something of SwapSha's to refund or claim.",
      ),
      default: swaps[0]?.id ?? null,
      values: Object.fromEntries(swaps.map((s) => [s.id, swapLabel(s)])),
      disabled: swaps.length
        ? false
        : i18n('No swap in the rescue file has anything to refund or claim'),
    }
  }),
  address: Value.text({
    name: i18n('Address'),
    description: i18n(
      "Where the coins go, on the lockup's chain: an address of SwapSha's node wallet there, or another of yours.",
    ),
    required: true,
    default: null,
    patterns: [
      {
        regex: '^[A-Za-z0-9]{14,90}$',
        description: i18n('An address, letters and digits only'),
      },
    ],
  }),
  feeRate: Value.number({
    name: i18n('Fee rate'),
    description: i18n('The miner fee for the transaction.'),
    required: true,
    default: 2,
    min: 1,
    max: 1_000,
    step: null,
    integer: false,
    units: 'sat/vB',
  }),
  broadcast: Value.toggle({
    name: i18n('Broadcast'),
    description: i18n(
      'Off: sign only, and show the transaction to check before sending it.',
    ),
    default: true,
  }),
})

export const rescueSwapAction = sdk.Action.withInput(
  'rescue-swap',

  async () => ({
    name: i18n('Rescue Swap'),
    description: i18n(
      "With SwapSha stopped: refund SwapSha's lockup or claim the user's, for a swap in the rescue file, signed here with the key from seed.dat.",
    ),
    warning: i18n(
      'Only for when the backend cannot do it: SwapSha must stay stopped until the transaction confirms.',
    ),
    allowedStatuses: 'only-stopped',
    group: i18n('Rescue'),
    visibility: 'enabled',
  }),

  rescueSpec,

  async () => null,

  async ({ effects, input }) => {
    const file = await readRescueFile(await testMode())
    const swap = file?.swaps.find((s) => s.id === input.swap)
    if (!swap) {
      throw new Error(
        i18n('Swap ${id} is not in the rescue file', {
          id: String(input.swap),
        }),
      )
    }

    const r = await rescueSwap(effects, {
      swap,
      address: input.address,
      feeRate: input.feeRate,
      broadcast: input.broadcast,
    })
    const values = {
      id: swap.id,
      chain: chainName(r.chain),
      txid: r.txid ?? '',
    }
    const lines = [
      r.txid
        ? r.kind === 'refund'
          ? i18n('Refund of swap ${id} broadcast on ${chain}: ${txid}', values)
          : i18n('Claim of swap ${id} broadcast on ${chain}: ${txid}', values)
        : r.kind === 'refund'
          ? i18n('Refund of swap ${id} signed, not broadcast:', values)
          : i18n('Claim of swap ${id} signed, not broadcast:', values),
      '',
      i18n('Signature: ${signature}', { signature: r.signature }),
      '',
      '```',
      r.hex,
      '```',
    ]

    return {
      version: '1',
      title: r.txid ? i18n('Swap rescued') : i18n('Rescue signed'),
      message: lines.join('\n'),
      result: null,
    }
  },
)
