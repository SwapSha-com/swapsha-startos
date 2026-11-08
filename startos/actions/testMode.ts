import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { decodeMacaroon, macaroonOps } from '../macaroon'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

// A5 test mode (D46): SwapSha on this server, swapping on testnet4 against the
// Mac's nodes over the LAN. main.ts gives the backend its own data directory
// and database while it is on, so stage 1's mainnet state is left alone.

const inputSpec = InputSpec.of({
  host: Value.text({
    name: i18n("Mac's address"),
    description: i18n(
      "The Mac's IP address on your LAN, where the testnet4 nodes run with their lan option, for example 192.168.1.23.",
    ),
    required: true,
    default: null,
    patterns: [
      {
        regex: '^[A-Za-z0-9.-]+$',
        description: i18n('An IP address or host name, without a port'),
      },
    ],
  }),
  lndMacaroon: Value.text({
    name: i18n('Provider node macaroon'),
    description: i18n(
      "To test Lightning: the testnet4 provider node's swapsha.macaroon (D31), in hex or base64. Leave empty for chain swaps only.",
    ),
    required: false,
    default: null,
    masked: true,
  }),
  lndCert: Value.textarea({
    name: i18n('Provider node TLS certificate'),
    description: i18n(
      "To test Lightning: the provider node's tls.cert, the whole PEM text. Leave empty for chain swaps only.",
    ),
    required: false,
    default: null,
    minRows: 3,
    maxRows: 8,
  }),
})

export const enterTestMode = sdk.Action.withInput(
  'enter-test-mode',

  async () => ({
    name: i18n('Enter Test Mode'),
    description: i18n(
      "Swap on testnet4 against the nodes on your Mac. SwapSha restarts with its own test data and database; mainnet's stay where they are.",
    ),
    warning: i18n(
      "SwapSha restarts on testnet4 and opens swaps there. Mainnet's data is kept aside and comes back with Leave Test Mode.",
    ),
    allowedStatuses: 'any',
    group: i18n('Testing'),
    visibility: 'enabled',
  }),

  inputSpec,

  async () => {
    const test = await storeJson.read((s) => s.testMode).once()
    return test
      ? {
          host: test.host,
          lndMacaroon: test.lnd?.macaroon ?? null,
          lndCert: test.lnd?.cert ?? null,
        }
      : null
  },

  async ({ effects, input }) => {
    const macaroon = input.lndMacaroon?.trim() || null
    const cert = input.lndCert?.trim() || null
    if (!!macaroon !== !!cert) {
      throw new Error(
        i18n('Give both the macaroon and the certificate, or neither'),
      )
    }

    let lnd: { macaroon: string; cert: string } | undefined
    if (macaroon && cert) {
      let bytes: Buffer
      try {
        bytes = decodeMacaroon(macaroon)
        macaroonOps(bytes)
      } catch (e) {
        throw new Error(
          i18n('This is not an LND macaroon: ${reason}', {
            reason: (e as Error).message,
          }),
        )
      }
      if (!cert.includes('-----BEGIN CERTIFICATE-----')) {
        throw new Error(i18n('This is not a PEM certificate'))
      }
      lnd = { macaroon: bytes.toString('hex'), cert: `${cert}\n` }
    }

    await storeJson.merge(effects, {
      testMode: { host: input.host.trim(), lnd },
    })

    return {
      version: '1',
      title: i18n('Test mode on'),
      message: i18n(
        'SwapSha restarts on testnet4 against ${host}. On first start it creates "swapsha-start9" wallets on both Mac nodes from its own test seed; fund them there.',
        { host: input.host.trim() },
      ),
      result: null,
    }
  },
)

export const leaveTestMode = sdk.Action.withoutInput(
  'leave-test-mode',

  async ({ effects }) => ({
    name: i18n('Leave Test Mode'),
    description: i18n(
      'Go back to mainnet (stage 1). The test data and database stay on the server for the next test.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Testing'),
    visibility: (await storeJson.read((s) => s.testMode).const(effects))
      ? 'enabled'
      : 'hidden',
  }),

  async ({ effects }) => {
    await storeJson.merge(effects, { testMode: undefined })
    return {
      version: '1',
      title: i18n('Test mode off'),
      message: i18n(
        'SwapSha restarts on mainnet, where new swaps stay turned down until Phase 5.',
      ),
      result: null,
    }
  },
)
