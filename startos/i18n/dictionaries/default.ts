export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting SwapSha!': 0,
  'Waiting for PostgreSQL to be ready': 1,
  'PostgreSQL is ready': 2,

  // dependencies.ts
  'The BTC node. SwapSha reads the chain over RPC and ZeroMQ, and its BTC wallet lives here.': 3,
  'The SHA-256 node. SwapSha reads the chain over RPC and ZeroMQ, and its SHA-256 wallet lives here.': 4,
  'Create the RPC login SwapSha uses on this node': 5,
  'Turn on the transaction index and ZeroMQ for SwapSha': 6,
  'Turn on ZeroMQ and the wallet for SwapSha': 7,

  // main.ts
  Backend: 8,
  'The backend is running. New swaps stay turned down on mainnet until Phase 5.': 9,
  'Waiting for the backend: chain checks, wallets and sidecar': 10,
  Nodes: 11,
  'Waiting for Bitcoin Knots and the Companion: both installed and running, with ZeroMQ on and their tasks done': 12,

  // Lightning Fork (D42): actions, dependency, main.ts
  'Read only macaroon': 13,
  "From Lightning Fork's dashboard: the Read only macaroon, in hex or base64. SwapSha refuses any macaroon that can do more than read.": 14,
  'Connect Lightning Fork': 15,
  "Give SwapSha Lightning Fork's Read only macaroon, so the backend can check the node. Lightning swaps stay off until Phase 5.": 16,
  Lightning: 17,
  'This is not an LND macaroon: ${reason}': 18,
  'This macaroon can do more than read (${grants}). Until Phase 5 SwapSha takes only the Read only macaroon (D42).': 19,
  'Lightning Fork connected': 20,
  'SwapSha restarts with the read-only macaroon. Its log shows the Lightning checks.': 21,
  'Disconnect Lightning Fork': 22,
  'Remove the macaroon. SwapSha restarts without Lightning, with chain swaps only.': 23,
  'Lightning Fork disconnected': 24,
  'SwapSha restarts without Lightning.': 25,
  'Lightning on the BLAKE2b chain. SwapSha connects with its Read only macaroon to check the node; Lightning swaps stay off until Phase 5.': 26,
  'Not connected: chain swaps only. Run Connect Lightning Fork to check the node (D42).': 27,
  "Waiting for Lightning Fork's gRPC: installed, running, with its wallet open": 28,
  'Connected to Lightning Fork (node ${key}) with the read-only macaroon. Lightning swaps stay off until Phase 5.': 29,
  'The backend did not connect to Lightning Fork: see the log': 30,
  'Waiting for the backend': 31,

  // A3b: the API interface
  API: 32,
  'REST and WebSocket API for the web app and Crossbill. New swaps on mainnet are turned down until Phase 5.': 33,
  'The API interface is answering. New swaps on mainnet are turned down until Phase 5.': 34,
  'The API interface is not answering': 35,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
