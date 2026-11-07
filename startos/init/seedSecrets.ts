import { utils } from '@start9labs/start-sdk'
import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'
import { RpcNode, rpcNodes } from '../utils'

const random = (charset: string, len: number) =>
  utils.getDefaultString({ charset, len })

// Package-generated secrets, never shown to the user: the PostgreSQL password
// and one RPC login per node. Runs on every init and fills in only what is
// missing, so an install made before a field existed gets it on update.
// Each RPC username has a random suffix: a node's generate-rpc-dependent
// action refuses a username it already has, so a reinstall of SwapSha must
// not ask for the old one again.
export const seedSecrets = sdk.setupOnInit(async (effects) => {
  const store = await storeJson.read().once()

  const rpc: Partial<Record<RpcNode, { user: string; password: string }>> = {}
  for (const id of rpcNodes) {
    if (store?.rpc?.[id]) continue
    rpc[id] = {
      user: `swapsha_${random('a-z,0-9', 8)}`,
      password: random('a-z,A-Z,0-9', 32),
    }
  }
  const pgPassword = store?.pgPassword ? undefined : random('a-z,A-Z,0-9', 32)

  if (!pgPassword && Object.keys(rpc).length === 0) return
  await storeJson.merge(effects, { ...(pgPassword ? { pgPassword } : {}), rpc })
})
