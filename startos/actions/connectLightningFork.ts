import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { beyondReadOnly, decodeMacaroon, macaroonOps } from '../macaroon'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  macaroon: Value.text({
    name: i18n('Read only macaroon'),
    description: i18n(
      "From Lightning Fork's dashboard: the Read only macaroon, in hex or base64. SwapSha refuses any macaroon that can do more than read.",
    ),
    required: true,
    default: null,
    masked: true,
  }),
})

// D42: SwapSha reaches Lightning Fork with its built-in Read only macaroon
// until Phase 5, enough for the startup checks (BLAKE2b chain, feature bit
// 512, no simple taproot channels) and no power to pay, invoice or move funds
export const connectLightningFork = sdk.Action.withInput(
  'connect-lightning-fork',

  async ({ effects }) => ({
    name: i18n('Connect Lightning Fork'),
    description: i18n(
      "Give SwapSha Lightning Fork's Read only macaroon, so the backend can check the node. Lightning swaps stay off until Phase 5.",
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Lightning'),
    visibility: 'enabled',
  }),

  inputSpec,

  async () => null,

  async ({ effects, input }) => {
    let ops: ReturnType<typeof macaroonOps>
    try {
      ops = macaroonOps(decodeMacaroon(input.macaroon))
    } catch (e) {
      throw new Error(
        i18n('This is not an LND macaroon: ${reason}', {
          reason: (e as Error).message,
        }),
      )
    }

    const extra = beyondReadOnly(ops)
    if (extra.length > 0) {
      throw new Error(
        i18n(
          'This macaroon can do more than read (${grants}). Until Phase 5 SwapSha takes only the Read only macaroon (D42).',
          { grants: extra.join(', ') },
        ),
      )
    }

    await storeJson.merge(effects, {
      lightningFork: {
        macaroon: decodeMacaroon(input.macaroon).toString('hex'),
      },
    })

    return {
      version: '1',
      title: i18n('Lightning Fork connected'),
      message: i18n(
        'SwapSha restarts with the read-only macaroon. Its log shows the Lightning checks.',
      ),
      result: null,
    }
  },
)

export const disconnectLightningFork = sdk.Action.withoutInput(
  'disconnect-lightning-fork',

  async ({ effects }) => ({
    name: i18n('Disconnect Lightning Fork'),
    description: i18n(
      'Remove the macaroon. SwapSha restarts without Lightning, with chain swaps only.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Lightning'),
    visibility: (await storeJson.read((s) => s.lightningFork).const(effects))
      ? 'enabled'
      : 'hidden',
  }),

  async ({ effects }) => {
    await storeJson.merge(effects, { lightningFork: undefined })
    return {
      version: '1',
      title: i18n('Lightning Fork disconnected'),
      message: i18n('SwapSha restarts without Lightning.'),
      result: null,
    }
  },
)
