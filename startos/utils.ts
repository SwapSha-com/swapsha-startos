// PostgreSQL, reachable only inside the package (listen_addresses=127.0.0.1)
export const pgUser = 'swapsha'
export const pgDatabase = 'swapsha'
export const pgMountpoint = '/var/lib/postgresql'

// The two nodes SwapSha logs in to over RPC, by package id: Bitcoin Knots on
// the BLAKE2b chain (BTC) and the SHA-256 Companion
export const rpcNodes = ['bitcoind', 'knots-prerdts'] as const
export type RpcNode = (typeof rpcNodes)[number]
