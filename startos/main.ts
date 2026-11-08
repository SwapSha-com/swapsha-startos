import { rm } from 'fs/promises'
import { boltzConf } from './fileModels/boltz.conf'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import {
  apiPort,
  companionRpcLocalHostId,
  companionRpcLocalPort,
  dataDir,
  grpcPort,
  lfGrpcHostId,
  lfGrpcPort,
  lfMacaroonFile,
  lfMount,
  lfPublicSubpath,
  nodeRpcHostId,
  nodeRpcPort,
  nodeWalletName,
  nodeZmqBlockPort,
  nodeZmqHostId,
  nodeZmqTxPort,
  pgDatabase,
  pgMountpoint,
  pgUser,
  RpcNode,
  sidecarApiPort,
  sidecarGrpcPort,
  sidecarWsPort,
} from './utils'

// "10.0.3.1:18432" -> host and port
const hostPort = (address: string) => {
  const i = address.lastIndexOf(':')
  return { host: address.slice(0, i), port: Number(address.slice(i + 1)) }
}

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting SwapSha!'))

  const store = await storeJson.read().const(effects)
  const pgPassword = store?.pgPassword
  if (!pgPassword) throw new Error('store.json has no PostgreSQL password')

  // Each node's addresses on the host bridge. null while a node is not
  // installed, or its ZeroMQ is off; .const() restarts main when one changes.
  // Only the http RPC bindings publish a TLS address too, hence ssl there.
  const bridge = (
    packageId: RpcNode,
    hostId: string,
    internalPort: number,
    ssl?: false,
  ) =>
    sdk.host
      .getBridgeAddress(effects, {
        packageId,
        hostId,
        internalPort,
        ...(ssl === false ? { ssl } : {}),
      })
      .const()

  const btcRpc = await bridge('bitcoind', nodeRpcHostId, nodeRpcPort, false)
  const btcZmqBlock = await bridge('bitcoind', nodeZmqHostId, nodeZmqBlockPort)
  const btcZmqTx = await bridge('bitcoind', nodeZmqHostId, nodeZmqTxPort)
  const shaRpc = await bridge(
    'knots-prerdts',
    nodeRpcHostId,
    nodeRpcPort,
    false,
  )
  const shaRpcLocal = await bridge(
    'knots-prerdts',
    companionRpcLocalHostId,
    companionRpcLocalPort,
  )
  const shaZmqBlock = await bridge(
    'knots-prerdts',
    nodeZmqHostId,
    nodeZmqBlockPort,
  )
  const shaZmqTx = await bridge('knots-prerdts', nodeZmqHostId, nodeZmqTxPort)

  const btcLogin = store?.rpc?.bitcoind
  const shaLogin = store?.rpc?.['knots-prerdts']

  // D42: Lightning Fork, once the operator has given SwapSha its Read only
  // macaroon. Its gRPC binding exists only while its wallet is open; the
  // TLS passthrough binding publishes one address, so no ssl filter.
  const lfMacaroon = store?.lightningFork?.macaroon
  const lfGrpc = lfMacaroon
    ? await sdk.host
        .getBridgeAddress(effects, {
          packageId: 'lightning-fork',
          hostId: lfGrpcHostId,
          internalPort: lfGrpcPort,
        })
        .const()
    : null

  const postgres = sdk.SubContainer.of(
    effects,
    { imageId: 'postgres' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'db',
      subpath: null,
      mountpoint: pgMountpoint,
      readonly: false,
    }),
    'postgres',
  )

  const daemons = sdk.Daemons.of(effects).addDaemon('postgres', {
    subcontainer: postgres,
    exec: {
      command: sdk.useEntrypoint(['-c', 'listen_addresses=127.0.0.1']),
      env: {
        POSTGRES_USER: pgUser,
        POSTGRES_PASSWORD: pgPassword,
        POSTGRES_DB: pgDatabase,
      },
    },
    ready: {
      display: null,
      fn: async () => {
        const result = await postgres.exec([
          'pg_isready',
          '-q',
          '-h',
          '127.0.0.1',
          '-d',
          pgDatabase,
          '-U',
          pgUser,
        ])
        if (result.exitCode !== 0) {
          return {
            result: 'starting',
            message: i18n('Waiting for PostgreSQL to be ready'),
          }
        }
        return { result: 'success', message: i18n('PostgreSQL is ready') }
      },
    },
    requires: [],
  })

  // No address is made up for a node that is not there: the backend stays
  // off and this check says why, until .const() brings main back
  if (
    !btcRpc ||
    !btcZmqBlock ||
    !btcZmqTx ||
    !shaRpc ||
    !shaRpcLocal ||
    !shaZmqBlock ||
    !shaZmqTx ||
    !btcLogin ||
    !shaLogin
  ) {
    return daemons.addHealthCheck('nodes', {
      ready: {
        display: i18n('Nodes'),
        fn: () => ({
          result: 'failure',
          message: i18n(
            'Waiting for Bitcoin Knots and the Companion: both installed and running, with ZeroMQ on and their tasks done',
          ),
        }),
      },
      requires: [],
    })
  }

  // The macaroon file the backend reads, only while it is in use
  const lfMacaroonPath = sdk.volumes.main.subpath(lfMacaroonFile)
  if (lfMacaroon && lfGrpc) {
    await sdk.volumes.main.writeFile(
      lfMacaroonFile,
      Buffer.from(lfMacaroon, 'hex'),
      { mode: 0o600 },
    )
  } else {
    await rm(lfMacaroonPath, { force: true })
  }

  // Stage 1 of Phase 3 (Blueprint D37): Mike's mainnet nodes. The backend
  // runs its startup checks against them and turns down every new swap until
  // Phase 5 (patch 0045). Pair rate, fees, limits and timeouts are the
  // testnet4 values as placeholders, to be set with the operator before then
  // (D19); pace bounds wait for measured mainnet data (D30), so the nominal
  // block time applies. Lightning swap types only with Lightning Fork (D42).
  const chain = (
    rpc: string,
    login: { user: string; password: string },
    zmqBlock: string,
    zmqTx: string,
  ) => ({
    ...hostPort(rpc),
    user: login.user,
    password: login.password,
    wallet: nodeWalletName,
    zmq: { rawblock: `tcp://${zmqBlock}`, rawtx: `tcp://${zmqTx}` },
    feeFloor: 1,
  })

  await boltzConf.write(effects, {
    network: 'mainnet',
    loglevel: 'info',
    api: { host: '127.0.0.1', port: apiPort },
    grpc: { host: '127.0.0.1', port: grpcPort },
    postgres: {
      host: '127.0.0.1',
      port: 5432,
      database: pgDatabase,
      username: pgUser,
      password: pgPassword,
    },
    pairs: [
      {
        base: 'BTC',
        quote: 'SHA256',
        rate: 1,
        fee: 0.5,
        maxSwapAmount: 10_000_000,
        minSwapAmount: 50_000,
        swapTypes: lfGrpc ? ['chain', 'submarine', 'reverse'] : ['chain'],
        chainSwap: { minSwapAmount: 50_000 },
        timeoutDelta: {
          chain: 120,
          reverse: 360,
          swapMinimal: 120,
          swapMaximal: 240,
          swapTaproot: 1100,
        },
      },
    ],
    currencies: [
      {
        symbol: 'SHA256',
        network: 'bitcoinMainnet',
        preferredWallet: 'core',
        minWalletBalance: 0,
        maxSwapAmount: 10_000_000,
        minSwapAmount: 10_000,
        maxZeroConfAmount: 0,
        chain: {
          ...chain(shaRpc, shaLogin, shaZmqBlock, shaZmqTx),
          // D40: the SHA-256 wallet, account 1', set up past the proxy
          seedAccount: 1,
          seedWalletRpc: hostPort(shaRpcLocal),
        },
      },
      {
        symbol: 'BTC',
        network: 'bitcoinMainnet',
        blake2b: true,
        preferredWallet: 'core',
        minWalletBalance: 0,
        maxSwapAmount: 10_000_000,
        minSwapAmount: 10_000,
        maxZeroConfAmount: 0,
        chain: {
          ...chain(btcRpc, btcLogin, btcZmqBlock, btcZmqTx),
          // D40: the BTC wallet, account 0'
          seedAccount: 0,
        },
        // D42: startup checks the node (BLAKE2b, feature bit 512, no simple
        // taproot channels) and stops if it fails them
        ...(lfGrpc
          ? {
              lnds: [
                {
                  ...hostPort(lfGrpc),
                  certpath: `${lfMount}/tls.cert`,
                  macaroonpath: `${dataDir}/${lfMacaroonFile}`,
                },
              ],
            }
          : {}),
      },
    ],
    swap: {
      deferredClaimSymbols: [],
      batchClaimInterval: '*/15 * * * *',
      expiryTolerance: 120,
      cltvDelta: 20,
    },
    routing: { default: 0.0035 },
    rates: { interval: 1 },
    sidecar: {
      grpc: { host: '127.0.0.1', port: sidecarGrpcPort },
      ws: { host: '127.0.0.1', port: sidecarWsPort },
      api: { host: '127.0.0.1', port: sidecarApiPort },
    },
  })

  let backendMounts = sdk.Mounts.of().mountVolume({
    volumeId: 'main',
    subpath: null,
    mountpoint: dataDir,
    readonly: false,
  })
  if (lfGrpc) {
    // Only Lightning Fork's public/ (tls.cert), never its macaroons (D42)
    backendMounts = backendMounts.mountDependency({
      dependencyId: 'lightning-fork',
      volumeId: 'main',
      subpath: lfPublicSubpath,
      mountpoint: lfMount,
      readonly: true,
    })
  }

  return daemons
    .addDaemon('backend', {
      subcontainer: sdk.SubContainer.of(
        effects,
        { imageId: 'swapsha' },
        backendMounts,
        'backend',
      ),
      exec: {
        // The log file goes to the container's /tmp, not the backed-up volume;
        // StartOS keeps the output
        command: sdk.useEntrypoint([
          '--datadir',
          dataDir,
          '--configpath',
          `${dataDir}/boltz.conf`,
          '--logpath',
          '/tmp/boltz.log',
        ]),
        // Release sidecar (target/release/boltzr)
        env: { NODE_ENV: 'production' },
      },
      ready: {
        display: i18n('Backend'),
        // The API listens once every startup check has passed. A port check,
        // not a fetch: checkWebUrl logs a stack trace for every refused try.
        fn: async () => {
          const check = await sdk.healthCheck.checkPortListening(
            effects,
            apiPort,
            {
              successMessage: i18n(
                'The backend is running. New swaps stay turned down on mainnet until Phase 5.',
              ),
              errorMessage: i18n(
                'Waiting for the backend: chain checks, wallets and sidecar',
              ),
            },
          )
          return check.result === 'success'
            ? check
            : { result: 'starting', message: check.message }
        },
      },
      requires: ['postgres'],
    })
    .addHealthCheck('lightning', {
      ready: {
        display: i18n('Lightning'),
        fn: async () => {
          if (!lfMacaroon) {
            return {
              result: 'disabled',
              message: i18n(
                'Not connected: chain swaps only. Run Connect Lightning Fork to check the node (D42).',
              ),
            }
          }
          if (!lfGrpc) {
            return {
              result: 'failure',
              message: i18n(
                "Waiting for Lightning Fork's gRPC: installed, running, with its wallet open",
              ),
            }
          }
          // The backend lists a node only once it has connected and passed
          // the D42 checks
          try {
            const res = await fetch(`http://127.0.0.1:${apiPort}/v2/nodes`, {
              signal: AbortSignal.timeout(2_000),
            })
            const nodes = (await res.json()) as {
              BTC?: { LND?: { publicKey?: string } }
            }
            const key = nodes.BTC?.LND?.publicKey
            if (key) {
              return {
                result: 'success',
                message: i18n(
                  'Connected to Lightning Fork (node ${key}) with the read-only macaroon. Lightning swaps stay off until Phase 5.',
                  { key: `${key.slice(0, 10)}...` },
                ),
              }
            }
            return {
              result: 'failure',
              message: i18n(
                'The backend did not connect to Lightning Fork: see the log',
              ),
            }
          } catch {
            return {
              result: 'starting',
              message: i18n('Waiting for the backend'),
            }
          }
        },
      },
      requires: ['backend'],
    })
})
