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
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
