import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// The backend's config (swapsha-backend lib/Config.ts), on the main volume.
// main.ts writes it whole on every start, from store.json and the nodes'
// bridge addresses; nothing else edits it.
export const boltzConf = FileHelper.toml(
  { base: sdk.volumes.main, subpath: 'boltz.conf' },
  z.looseObject({}),
)

// A5 test mode (D46): the same, for the backend's test data directory
export const boltzConfTest = FileHelper.toml(
  { base: sdk.volumes.main, subpath: 'testnet4/boltz.conf' },
  z.looseObject({}),
)
