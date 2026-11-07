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
})

export const storeJson = FileHelper.json(
  { base: sdk.volumes.startos, subpath: 'store.json' },
  shape,
)
