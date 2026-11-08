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
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
