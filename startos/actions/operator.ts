import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { directionFee, operatorTerms, sats } from '../operator'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

// A3c: the operator's terms (D5, D19, D43) and pause. Each action writes
// store.json; main.ts reads it with .const(), so SwapSha restarts with a new
// boltz.conf. Swaps already made keep their amounts: the backend picks them
// up from its database.

const currentTerms = async () =>
  operatorTerms(await storeJson.read((s) => s.operator).once())

const rateSpec = InputSpec.of({
  rate: Value.number({
    name: i18n('Rate'),
    description: i18n(
      'How many SHA-256 coins one BTC is worth; 1 is one for one. Swapping BTC, the user gets the amount times the rate; swapping SHA-256, the amount divided by the rate. Fees come off after.',
    ),
    required: true,
    default: 1,
    min: 0.00000001,
    max: 100_000_000,
    step: null,
    integer: false,
    units: i18n('SHA-256 per BTC'),
  }),
  feePercent: Value.number({
    name: i18n('Fee'),
    description: i18n('What SwapSha keeps on every swap, in both directions.'),
    required: true,
    default: 0.5,
    min: 0,
    max: 10,
    step: null,
    integer: false,
    units: '%',
  }),
  spreadPercent: Value.number({
    name: i18n('Spread'),
    description: i18n(
      'The gap between the buy and the sell price. Each direction pays half of it on top of the fee (D43).',
    ),
    required: true,
    default: 0,
    min: 0,
    max: 20,
    step: null,
    integer: false,
    units: '%',
  }),
})

export const setRate = sdk.Action.withInput(
  'set-rate',

  async () => ({
    name: i18n('Set Rate and Fees'),
    description: i18n(
      'Set the rate between BTC and SHA-256, the fee and the spread. SwapSha restarts with them; swaps already made keep the amounts they were made with.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Swaps'),
    visibility: 'enabled',
  }),

  rateSpec,

  async () => {
    const { rate, feePercent, spreadPercent } = await currentTerms()
    return { rate, feePercent, spreadPercent }
  },

  async ({ effects, input }) => {
    const stored = await storeJson.read((s) => s.operator).once()
    const operator = {
      ...stored,
      rate: input.rate,
      feePercent: input.feePercent,
      spreadPercent: input.spreadPercent,
    }
    await storeJson.merge(effects, { operator })

    return {
      version: '1',
      title: i18n('Rate and fees set'),
      message: i18n(
        'Rate ${rate} SHA-256 per BTC; each swap pays ${percent}% in both directions. SwapSha restarts with them.',
        {
          rate: String(input.rate),
          percent: String(directionFee(operatorTerms(operator))),
        },
      ),
      result: null,
    }
  },
)

const limitsSpec = InputSpec.of({
  minSwapAmount: Value.number({
    name: i18n('Smallest swap'),
    description: i18n(
      'In SHA-256 sats for both directions: a BTC amount counts at the rate. The backend raises it when miner fees would take too much of a smaller swap.',
    ),
    required: true,
    default: 50_000,
    min: 1_000,
    max: 2_100_000_000_000_000,
    step: null,
    integer: true,
    units: 'sats',
  }),
  maxSwapAmount: Value.number({
    name: i18n('Largest swap'),
    description: i18n(
      'In SHA-256 sats for both directions: a BTC amount counts at the rate.',
    ),
    required: true,
    default: 10_000_000,
    min: 1_000,
    max: 2_100_000_000_000_000,
    step: null,
    integer: true,
    units: 'sats',
  }),
})

export const setLimits = sdk.Action.withInput(
  'set-limits',

  async () => ({
    name: i18n('Set Limits'),
    description: i18n(
      'Set the smallest and the largest swap. SwapSha restarts with them.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Swaps'),
    visibility: 'enabled',
  }),

  limitsSpec,

  async () => {
    const { minSwapAmount, maxSwapAmount } = await currentTerms()
    return { minSwapAmount, maxSwapAmount }
  },

  async ({ effects, input }) => {
    if (input.maxSwapAmount < input.minSwapAmount) {
      throw new Error(
        i18n('The largest swap has to be at least the smallest one'),
      )
    }

    const stored = await storeJson.read((s) => s.operator).once()
    await storeJson.merge(effects, {
      operator: {
        ...stored,
        minSwapAmount: input.minSwapAmount,
        maxSwapAmount: input.maxSwapAmount,
      },
    })

    return {
      version: '1',
      title: i18n('Limits set'),
      message: i18n(
        'Swaps from ${min} to ${max} SHA-256 sats. SwapSha restarts with them.',
        { min: sats(input.minSwapAmount), max: sats(input.maxSwapAmount) },
      ),
      result: null,
    }
  },
)

const setPaused = async (
  effects: Parameters<typeof storeJson.merge>[0],
  paused: boolean,
) => {
  const stored = await storeJson.read((s) => s.operator).once()
  await storeJson.merge(effects, { operator: { ...stored, paused } })
}

export const pauseSwaps = sdk.Action.withoutInput(
  'pause-swaps',

  async ({ effects }) => ({
    name: i18n('Pause Swaps'),
    description: i18n(
      'Turn down new swaps while swaps already made carry on to their claim or refund. SwapSha restarts.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Swaps'),
    visibility: (await storeJson.read((s) => s.operator?.paused).const(effects))
      ? 'hidden'
      : 'enabled',
  }),

  async ({ effects }) => {
    await setPaused(effects, true)
    return {
      version: '1',
      title: i18n('Swaps paused'),
      message: i18n('New swaps are turned down. Swaps already made carry on.'),
      result: null,
    }
  },
)

export const resumeSwaps = sdk.Action.withoutInput(
  'resume-swaps',

  async ({ effects }) => ({
    name: i18n('Resume Swaps'),
    description: i18n(
      'Let new swaps in again. SwapSha restarts. On mainnet they stay off until Phase 5.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Swaps'),
    visibility: (await storeJson.read((s) => s.operator?.paused).const(effects))
      ? 'enabled'
      : 'hidden',
  }),

  async ({ effects }) => {
    await setPaused(effects, false)
    return {
      version: '1',
      title: i18n('Swaps resumed'),
      message: i18n(
        'New swaps are let in again, except on mainnet before Phase 5.',
      ),
      result: null,
    }
  },
)
