import { setupManifest } from '@start9labs/start-sdk'
import { long, short } from './i18n'

export const manifest = setupManifest({
  id: 'swapsha',
  title: 'SwapSha',
  license: 'AGPL-3.0',
  packageRepo: 'https://github.com/SwapSha-com/swapsha-startos',
  upstreamRepo: 'https://github.com/SwapSha-com/swapsha-backend',
  marketingUrl: 'https://swapsha.com',
  donationUrl: null,
  description: { short, long },
  // main: the backend's data directory. db: PostgreSQL. startos: store.json,
  // which no subcontainer mounts.
  volumes: ['main', 'db', 'startos'],
  images: {
    // Built from ./Dockerfile out of the swapsha-backend submodule
    swapsha: {
      source: {
        dockerBuild: {
          buildArgs: { SWAPSHA_COMMIT: { env: 'SWAPSHA_COMMIT' } },
        },
      },
      arch: ['x86_64'],
    },
    postgres: {
      source: { dockerTag: 'postgres:17-bookworm' },
      arch: ['x86_64'],
    },
    // The API interface's reverse proxy (A3b), nginx stable
    nginx: {
      source: { dockerTag: 'nginx:1.30.6-trixie' },
      arch: ['x86_64'],
    },
  },
})
