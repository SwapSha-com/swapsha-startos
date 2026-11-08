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

  // A3c: the operator's terms and pause
  Swaps: 36,
  'Set Rate and Fees': 37,
  'Set the rate between BTC and SHA-256, the fee and the spread. SwapSha restarts with them; swaps already made keep the amounts they were made with.': 38,
  Rate: 39,
  'How many SHA-256 coins one BTC is worth; 1 is one for one. Swapping BTC, the user gets the amount times the rate; swapping SHA-256, the amount divided by the rate. Fees come off after.': 40,
  'SHA-256 per BTC': 41,
  Fee: 42,
  'What SwapSha keeps on every swap, in both directions.': 43,
  Spread: 44,
  'The gap between the buy and the sell price. Each direction pays half of it on top of the fee (D43).': 45,
  'Rate and fees set': 46,
  'Rate ${rate} SHA-256 per BTC; each swap pays ${percent}% in both directions. SwapSha restarts with them.': 47,
  'Set Limits': 48,
  'Set the smallest and the largest swap. SwapSha restarts with them.': 49,
  'Smallest swap': 50,
  'In SHA-256 sats for both directions: a BTC amount counts at the rate. The backend raises it when miner fees would take too much of a smaller swap.': 51,
  'Largest swap': 52,
  'In SHA-256 sats for both directions: a BTC amount counts at the rate.': 53,
  'The largest swap has to be at least the smallest one': 54,
  'Limits set': 55,
  'Swaps from ${min} to ${max} SHA-256 sats. SwapSha restarts with them.': 56,
  'Pause Swaps': 57,
  'Turn down new swaps while swaps already made carry on to their claim or refund. SwapSha restarts.': 58,
  'Swaps paused': 59,
  'New swaps are turned down. Swaps already made carry on.': 60,
  'Resume Swaps': 61,
  'Let new swaps in again. SwapSha restarts. On mainnet they stay off until Phase 5.': 62,
  'Swaps resumed': 63,
  'New swaps are let in again, except on mainnet before Phase 5.': 64,
  'Paused: new swaps are turned down, swaps already made carry on': 65,
  'The backend does not list the BTC to SHA-256 pair: see the log': 66,
  'Rate ${rate} SHA-256 per BTC, fee ${fee}% each way, swaps from ${min} to ${max} SHA-256 sats': 67,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
