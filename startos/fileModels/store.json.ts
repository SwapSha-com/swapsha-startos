import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

const rpcLogin = z.object({ user: z.string(), password: z.string() })

// Package-generated secrets. On the startos volume, which no subcontainer mounts.
const shape = z.looseObject({
  pgPassword: z.string().optional().catch(undefined),
  // One RPC login per node, keyed by the node's package id (utils.rpcNodes)
  rpc: z
    .looseObject({
      bitcoind: rpcLogin.optional().catch(undefined),
      'knots-prerdts': rpcLogin.optional().catch(undefined),
    })
    .catch({}),
  // D42: Lightning Fork's read-only macaroon, hex, from the Connect
  // Lightning Fork action. Its presence turns the optional dependency on.
  lightningFork: z
    .looseObject({ macaroon: z.string() })
    .optional()
    .catch(undefined),
  // A5 test mode (D46): the Mac's LAN address, and the provider Lightning
  // Fork node's macaroon (hex) and TLS cert (PEM) when Lightning is tested
  testMode: z
    .looseObject({
      host: z.string(),
      lnd: z
        .looseObject({ macaroon: z.string(), cert: z.string() })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
  // A4b-3, D40 (second amendment): a one-time request to recover the seed
  // wallets on the nodes, from Recover Node Wallets, for the mode it was
  // made in. The backend does each request once (wallet-recovery.json).
  walletRecovery: z
    .looseObject({ request: z.string(), testMode: z.boolean() })
    .optional()
    .catch(undefined),
  // A3c: the operator's terms and pause, from the Swaps actions. A field
  // left unset falls back to utils.operatorDefaults (operator.ts).
  operator: z
    .looseObject({
      rate: z.number().positive().optional().catch(undefined),
      feePercent: z.number().min(0).optional().catch(undefined),
      spreadPercent: z.number().min(0).optional().catch(undefined),
      minSwapAmount: z.number().int().positive().optional().catch(undefined),
      maxSwapAmount: z.number().int().positive().optional().catch(undefined),
      paused: z.boolean().optional().catch(undefined),
    })
    .catch({}),
})

export const storeJson = FileHelper.json(
  { base: sdk.volumes.startos, subpath: 'store.json' },
  shape,
)
