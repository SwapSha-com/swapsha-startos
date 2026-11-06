import { storeJson } from './fileModels/store.json'
import { sdk } from './sdk'
import { pgDatabase, pgMountpoint, pgUser } from './utils'

// D40: the database (as a pg_dump), the backend's data directory (config,
// seed.dat, the D38 stores) and store.json
export const { createBackup, restoreInit } = sdk.setupBackups(async () =>
  sdk.Backups.withPgDump({
    imageId: 'postgres',
    dbVolume: 'db',
    mountpoint: pgMountpoint,
    pgdataPath: '/data',
    database: pgDatabase,
    user: pgUser,
    password: async () => {
      const password = await storeJson.read((s) => s.pgPassword).once()
      if (!password) throw new Error('store.json has no PostgreSQL password')
      return password
    },
  })
    .addVolume('main')
    .addVolume('startos'),
)
