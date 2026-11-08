import { i18n } from './i18n'
import { sdk } from './sdk'
import { apiHostId, apiProxyPort } from './utils'

// The API interface (blueprint 6.3, build step A3b): REST and WebSocket, the
// API the web app and Crossbill call, over LAN and Tor. nginx serves it on
// apiProxyPort; StartOS adds TLS in front. On mainnet every new swap is
// turned down until Phase 5 (D37), so for now it answers quotes, pairs,
// fees, node info and status only.
export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const multi = sdk.MultiHost.of(effects, apiHostId)
  const origin = await multi.bindPort(apiProxyPort, {
    protocol: 'http',
    preferredExternalPort: apiProxyPort,
  })

  const api = sdk.createInterface(effects, {
    name: i18n('API'),
    id: 'api',
    description: i18n(
      'REST and WebSocket API for the web app and Crossbill. New swaps on mainnet are turned down until Phase 5.',
    ),
    type: 'api',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  return [await origin.export([api])]
})
