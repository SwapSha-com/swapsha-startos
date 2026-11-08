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
