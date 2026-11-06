import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import { pgDatabase, pgMountpoint, pgUser } from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting SwapSha!'))

  const pgPassword = await storeJson.read((s) => s.pgPassword).const(effects)
  if (!pgPassword) throw new Error('store.json has no PostgreSQL password')

  // Build step A1: PostgreSQL only. The backend daemon follows in A2, once
  // its configuration and the Bitcoin dependencies are wired.
  const postgres = sdk.SubContainer.of(
    effects,
    { imageId: 'postgres' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'db',
      subpath: null,
      mountpoint: pgMountpoint,
      readonly: false,
    }),
    'postgres',
  )

  return sdk.Daemons.of(effects).addDaemon('postgres', {
    subcontainer: postgres,
    exec: {
      command: sdk.useEntrypoint(['-c', 'listen_addresses=127.0.0.1']),
      env: {
        POSTGRES_USER: pgUser,
        POSTGRES_PASSWORD: pgPassword,
        POSTGRES_DB: pgDatabase,
      },
    },
    ready: {
      display: null,
      fn: async () => {
        const result = await postgres.exec([
          'pg_isready',
          '-q',
          '-h',
          '127.0.0.1',
          '-d',
          pgDatabase,
          '-U',
          pgUser,
        ])
        if (result.exitCode !== 0) {
          return {
            result: 'starting',
            message: i18n('Waiting for PostgreSQL to be ready'),
          }
        }
        return { result: 'success', message: i18n('PostgreSQL is ready') }
      },
    },
    requires: [],
  })
})
