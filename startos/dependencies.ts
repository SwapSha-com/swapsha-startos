import { readFile } from 'fs/promises'
import { T } from '@start9labs/start-sdk'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import { RpcNode } from './utils'

// The nodes' hidden actions, described here rather than imported from their
// packages. Their action modules load fileModels/bitcoin.conf.ts, which
// imports the native `diskusage` module, and importing them would put that in
// this bundle. createTask reads only `id`; `_INPUT` carries the input type so
// `accept` and `set` are checked. The shapes match bitcoin-knots-startos
// 0a05715b and knots-prerdts-startos c7c97df0
// (startos/actions/generateRpcUserDependent.ts and config/autoconfig.ts).
type NodeAction<Id extends string, Input extends Record<string, any>> = {
  readonly id: Id
  readonly _INPUT: Input
}
const nodeAction = <Input extends Record<string, any>, Id extends string>(
  id: Id,
): NodeAction<Id, Input> => ({ id, _INPUT: undefined as unknown as Input })

// Same id and input on both nodes. Username `^[a-zA-Z0-9_]+$`; password at
// least 20 characters of `^[A-Za-z0-9_-]+$`.
const generateRpcDependent = nodeAction<
  { username: string; password: string },
  'generate-rpc-dependent'
>('generate-rpc-dependent')

const bitcoindAutoconfig = nodeAction<
  { txindex: boolean | null; zmqEnabled: boolean | null },
  'autoconfig'
>('autoconfig')

const companionAutoconfig = nodeAction<
  { zmqEnabled: boolean | null; wallet: { enable: boolean | null } },
  'autoconfig'
>('autoconfig')

const rpcLoginReplayId = (id: RpcNode) => `${id}:generate-rpc-dependent`

// Whether the node's bitcoin.conf already has an rpcauth line for `user`.
// Mounts the node's main volume read-only in a throwaway container. Any
// failure (node not installed yet, no bitcoin.conf) counts as "no".
async function nodeHasRpcUser(
  effects: T.Effects,
  id: RpcNode,
  user: string,
): Promise<boolean> {
  try {
    return await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'swapsha' },
      sdk.Mounts.of().mountDependency({
        dependencyId: id,
        volumeId: 'main',
        subpath: null,
        mountpoint: '/mnt/node',
        readonly: true,
      }),
      `read-${id}-conf`,
      async (sub) => {
        const conf = await readFile(
          `${sub.rootfs}/mnt/node/bitcoin.conf`,
          'utf8',
        )
        return conf.split('\n').some(
          (line) =>
            line
              .trim()
              .match(/^rpcauth\s*=\s*([^:]+):/)?.[1]
              ?.trim() === user,
        )
      },
    )
  } catch {
    return false
  }
}

// Asks the user to run the node's generate-rpc-dependent action with the
// login from store.json, until the node's bitcoin.conf has it. The task has no
// `when`, so StartOS drops it once the action runs; each init checks the
// node's config again and raises it only if the login is still missing.
const rpcLogin = (id: RpcNode) => async (effects: T.Effects) => {
  const login = await storeJson.read((s) => s.rpc?.[id]).const(effects)
  if (!login) return // seedSecrets fills this in earlier in init

  if (await nodeHasRpcUser(effects, id, login.user)) {
    await sdk.action.clearTask(effects, rpcLoginReplayId(id))
    return
  }

  const input = { username: login.user, password: login.password }
  await sdk.action.createTask(effects, id, generateRpcDependent, 'critical', {
    replayId: rpcLoginReplayId(id),
    reason: i18n('Create the RPC login SwapSha uses on this node'),
    input: { kind: 'partial', accept: [input], set: input },
  })
}

// Bitcoin Knots on the BLAKE2b chain (BTC). Needs txindex for the archival
// oracle and ZeroMQ for new blocks and transactions. Only the Knots flavor:
// the BTC wallet relies on Knots behavior (D23, D26).
const bitcoind = sdk.Dependency.required('bitcoind', {
  description: i18n(
    'The BTC node. SwapSha reads the chain over RPC and ZeroMQ, and its BTC wallet lives here.',
  ),
  metadata: { title: 'Bitcoin Knots', icon: 'dep-icons/bitcoind.svg' },
  versionRange: '>=#knots:29.4.3:1',
  kind: 'running',
  healthChecks: ['bitcoind', 'sync-progress'],
})
  .withInit(rpcLogin('bitcoind'))
  .withInit(async (effects) => {
    const want = { txindex: true, zmqEnabled: true }
    await sdk.action.createTask(
      effects,
      'bitcoind',
      bitcoindAutoconfig,
      'critical',
      {
        reason: i18n('Turn on the transaction index and ZeroMQ for SwapSha'),
        input: { kind: 'partial', accept: [want], set: want },
        when: { condition: 'input-not-matches', once: false },
      },
    )
  })

// The SHA-256 Companion (pruned). Needs ZeroMQ, and its wallet for the
// SHA-256 provider wallet (D39).
const companion = sdk.Dependency.required('knots-prerdts', {
  description: i18n(
    'The SHA-256 node. SwapSha reads the chain over RPC and ZeroMQ, and its SHA-256 wallet lives here.',
  ),
  metadata: {
    title: 'Bitcoin Knots (SHA256) Companion',
    icon: 'dep-icons/knots-prerdts.png',
  },
  versionRange: '>=#knotsprerdts:31.2:0',
  kind: 'running',
  healthChecks: ['bitcoind', 'sync-progress'],
})
  .withInit(rpcLogin('knots-prerdts'))
  .withInit(async (effects) => {
    const want = { zmqEnabled: true, wallet: { enable: true } }
    await sdk.action.createTask(
      effects,
      'knots-prerdts',
      companionAutoconfig,
      'critical',
      {
        reason: i18n('Turn on ZeroMQ and the wallet for SwapSha'),
        input: { kind: 'partial', accept: [want], set: want },
        when: { condition: 'input-not-matches', once: false },
      },
    )
  })

export const dependencies = sdk.Dependencies.of()
  .addDependency(bitcoind)
  .addDependency(companion)
