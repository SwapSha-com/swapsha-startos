// PostgreSQL, reachable only inside the package (listen_addresses=127.0.0.1)
export const pgUser = 'swapsha'
export const pgDatabase = 'swapsha'
export const pgMountpoint = '/var/lib/postgresql'

// The two nodes SwapSha logs in to over RPC, by package id: Bitcoin Knots on
// the BLAKE2b chain (BTC) and the SHA-256 Companion
export const rpcNodes = ['bitcoind', 'knots-prerdts'] as const
export type RpcNode = (typeof rpcNodes)[number]

// The nodes' bindings, as their packages define them (startos/utils.ts in
// bitcoin-knots-startos 3c9140ca and knots-prerdts-startos c7c97df0). The
// internal ports and host ids are the stable contract; the bridge ports are
// read at runtime with sdk.host.getBridgeAddress.
export const nodeRpcHostId = 'rpc'
export const nodeRpcPort = 8332 // on the Companion: its btc-rpc-proxy (D38)
export const nodeZmqHostId = 'zmq'
export const nodeZmqBlockPort = 28332
export const nodeZmqTxPort = 28333
// The Companion's bitcoind itself, past the proxy, reachable only over the
// bridge: the D40 wallet setup goes here (the proxy logs failed requests
// with their parameters)
export const companionRpcLocalHostId = 'rpc-local'
export const companionRpcLocalPort = 58332

// The provider wallet on each node, derived from seed.dat (D39, D40)
export const nodeWalletName = 'swapsha'

// The backend (boltzd and its sidecar), all on 127.0.0.1 in the package
export const dataDir = '/data' // the main volume
export const apiPort = 9001
export const grpcPort = 9000
export const sidecarGrpcPort = 9003
export const sidecarWsPort = 9004
export const sidecarApiPort = 9005

// The API interface (A3b): nginx in front of the backend and the sidecar,
// the only port bound for other machines
export const apiHostId = 'api'
export const apiProxyPort = 9006
export const apiProxySubpath = 'nginx' // on main, mounted at /etc/nginx/conf.d

// Lightning Fork (D42), as its package defines it (paulscode/
// lightning-fork-startos 9936a39): gRPC on host `grpc`, port 10009, LND's own
// TLS (passthrough, bound once the wallet is open); `public/` on its main
// volume holds tls.cert and nothing else, for dependents to mount read-only.
// Its cert names the OS bridge address, so no server name override.
export const lfGrpcHostId = 'grpc'
export const lfGrpcPort = 10009
export const lfPublicSubpath = 'public'
export const lfMount = '/lightning-fork'
// The macaroon the operator pastes, written to main for the backend
export const lfMacaroonFile = 'lightning-fork.macaroon'

// The operator's terms (A3c; D5, D19, D43) until the Swaps actions set
// them: the testnet4 values, placeholders to be set with the operator before
// Phase 5. The rate is SHA-256 coins per BTC; the limits are in SHA-256 sats
// for both directions, a BTC amount counting at the rate (patch 0051).
export const operatorDefaults = {
  rate: 1,
  feePercent: 0.5,
  spreadPercent: 0,
  minSwapAmount: 50_000,
  maxSwapAmount: 10_000_000,
  paused: false,
}
