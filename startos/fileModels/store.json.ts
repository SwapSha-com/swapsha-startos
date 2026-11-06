import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Package-generated secrets. On the startos volume, which no subcontainer mounts.
const shape = z.looseObject({
  pgPassword: z.string().optional().catch(undefined),
})

export const storeJson = FileHelper.json(
  { base: sdk.volumes.startos, subpath: 'store.json' },
  shape,
)
