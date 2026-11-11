import { mkdir, rm } from 'fs/promises'
import { apiProxyConf } from './apiProxy'
import { boltzConf, boltzConfTest } from './fileModels/boltz.conf'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { directionFee, operatorTerms, sats } from './operator'
import { gatherOverview, overviewAlerts } from './overview'
import { updateRescueFile } from './rescue'
import { sdk } from './sdk'
import {
  apiPort,
  apiProxyPort,
  apiProxySubpath,
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
  testDataSubpath,
  testLndCertFile,
  testLndMacaroonFile,
  testLndPort,
  testNodes,
  testPgSubpath,
  testRpcLogin,
  testWalletName,
} from './utils'

// "10.0.3.1:18432" -> host and port
const hostPort = (address: string) => {
  const i = address.lastIndexOf(':')
  return { host: address.slice(0, i), port: Number(address.slice(i + 1)) }
}

// A5 test mode (D46): the Mac's testnet4 nodes over the LAN, as the Phase 1
// and 2 runs used them (swapsha-backend swapsha-testnet4/boltz.conf), with
// the measured testnet4 pace bounds (D30) and a wallet of its own on each
const testCurrencies = (host: string, lnd: boolean) => {
  const chain = (symbol: keyof typeof testNodes, seedAccount: number) => ({
    host,
    port: testNodes[symbol].rpcPort,
    user: testRpcLogin.user,
    password: testRpcLogin.password,
    wallet: testWalletName,
    zmq: {
      rawblock: `tcp://${host}:${testNodes[symbol].zmqRawBlock}`,
      rawtx: `tcp://${host}:${testNodes[symbol].zmqRawTx}`,
    },
    feeFloor: 1,
    seedAccount,
  })
  return [
    {
      symbol: 'SHA256',
      network: 'bitcoinTestnet',
      pace: {
        fastMinutesPerBlock: 6.17,
        slowMinutesPerBlock: 18.92,
        maxTipAgeMinutes: 120,
      },
      preferredWallet: 'core',
      minWalletBalance: 0,
      maxSwapAmount: 10_000_000,
      minSwapAmount: 10_000,
      maxZeroConfAmount: 0,
      chain: chain('SHA256', 1),
    },
    {
      symbol: 'BTC',
      network: 'bitcoinTestnet',
      pace: {
        fastMinutesPerBlock: 20.26,
        slowMinutesPerBlock: 59.44,
        maxTipAgeMinutes: 120,
      },
      blake2b: true,
      preferredWallet: 'core',
      minWalletBalance: 0,
      maxSwapAmount: 10_000_000,
      minSwapAmount: 10_000,
      maxZeroConfAmount: 0,
      chain: chain('BTC', 0),
      // The node's cert names localhost, not the Mac's LAN address
      ...(lnd
        ? {
            lnds: [
              {
                host,
                port: testLndPort,
                sslTargetNameOverride: 'localhost',
                certpath: `${dataDir}/${testLndCertFile}`,
                macaroonpath: `${dataDir}/${testLndMacaroonFile}`,
              },
            ],
          }
        : {}),
    },
  ]
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
  // A5 test mode (D46): the Mac's testnet4 stack instead of the StartOS
  // dependencies; mainnet's Lightning Fork stays out of it
  const test = store?.testMode
  const lfGrpc =
    lfMacaroon && !test
      ? await sdk.host
          .getBridgeAddress(effects, {
            packageId: 'lightning-fork',
            hostId: lfGrpcHostId,
            internalPort: lfGrpcPort,
          })
          .const()
      : null

  if (test) {
    await mkdir(sdk.volumes.main.subpath(testPgSubpath), { recursive: true })
    await mkdir(sdk.volumes.main.subpath(testDataSubpath), { recursive: true })
  }

  const postgres = sdk.SubContainer.of(
    effects,
    { imageId: 'postgres' },
    // Test mode keeps its database apart, on main (backed up as files,
    // with the service stopped); mainnet's stays on db (pg_dump, D40)
    test
      ? sdk.Mounts.of().mountVolume({
          volumeId: 'main',
          subpath: testPgSubpath,
          mountpoint: pgMountpoint,
          readonly: false,
        })
      : sdk.Mounts.of().mountVolume({
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
    !test &&
    (!btcRpc ||
      !btcZmqBlock ||
      !btcZmqTx ||
      !shaRpc ||
      !shaRpcLocal ||
      !shaZmqBlock ||
      !shaZmqTx ||
      !btcLogin ||
      !shaLogin)
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

  // Test mode's Lightning Fork node: its macaroon and cert, while given
  const testLnd = test?.lnd
  for (const [file, content] of [
    [
      testLndMacaroonFile,
      testLnd ? Buffer.from(testLnd.macaroon, 'hex') : null,
    ],
    [testLndCertFile, testLnd ? testLnd.cert : null],
  ] as const) {
    const path = `${testDataSubpath}/${file}`
    if (content !== null) {
      await sdk.volumes.main.writeFile(path, content, { mode: 0o600 })
    } else {
      await rm(sdk.volumes.main.subpath(path), { force: true })
    }
  }

  // Stage 1 of Phase 3 (Blueprint D37): Mike's mainnet nodes. The backend
  // runs its startup checks against them and turns down every new swap until
  // Phase 5 (patch 0045). Rate, fees, limits and the pause come from the
  // Swaps actions (A3c; D19, D43); timeouts are the testnet4 values as
  // placeholders. Pace bounds wait for measured mainnet data (D30), so the
  // nominal block time applies. Lightning swap types only with Lightning
  // Fork (D42).
  const terms = operatorTerms(store?.operator)
  const fee = directionFee(terms)
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

  const lightning = test ? !!testLnd : !!lfGrpc
  const conf = {
    network: test ? 'testnet' : 'mainnet',
    loglevel: 'info',
    // A3c, patch 0052: new swaps turned down, swaps already made carry on
    pauseNewSwaps: terms.paused,
    // A4b-3, D40: recover the node wallets once (backend patch 0063), only
    // in the mode the request was made in
    ...(store?.walletRecovery && store.walletRecovery.testMode === !!test
      ? { recoverNodeWallets: store.walletRecovery.request }
      : {}),
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
        // SHA-256 coins per BTC; limits in SHA-256 sats (patch 0051)
        rate: terms.rate,
        // D43: the fee plus half the spread, each direction; `fee` also
        // covers the Lightning swap types
        fee,
        maxSwapAmount: terms.maxSwapAmount,
        minSwapAmount: terms.minSwapAmount,
        swapTypes: lightning ? ['chain', 'submarine', 'reverse'] : ['chain'],
        chainSwap: {
          minSwapAmount: terms.minSwapAmount,
          maxSwapAmount: terms.maxSwapAmount,
          buyFee: fee, // SHA-256 to BTC
          sellFee: fee, // BTC to SHA-256
        },
        timeoutDelta: {
          chain: 120,
          reverse: 360,
          swapMinimal: 120,
          swapMaximal: 240,
          swapTaproot: 1100,
        },
      },
    ],
    currencies: test
      ? testCurrencies(test.host, !!testLnd)
      : [
          {
            symbol: 'SHA256',
            network: 'bitcoinMainnet',
            preferredWallet: 'core',
            minWalletBalance: 0,
            maxSwapAmount: 10_000_000,
            minSwapAmount: 10_000,
            maxZeroConfAmount: 0,
            chain: {
              ...chain(shaRpc!, shaLogin!, shaZmqBlock!, shaZmqTx!),
              // D40: the SHA-256 wallet, account 1', set up past the proxy
              seedAccount: 1,
              seedWalletRpc: hostPort(shaRpcLocal!),
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
              ...chain(btcRpc!, btcLogin!, btcZmqBlock!, btcZmqTx!),
              // D40: the BTC wallet, account 0'
              seedAccount: 0,
            },
            // D42: startup checks the node (BLAKE2b, feature bit 512, no simple
            // taproot channels) and stops if it fails them
            ...(lfGrpc
              ? {
                  lnds: [
                    {
                      ...hostPort(lfGrpc as string),
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
  }
  await (test ? boltzConfTest : boltzConf).write(effects, conf)

  // The API interface's nginx config (A3b)
  await mkdir(sdk.volumes.main.subpath(apiProxySubpath), { recursive: true })
  await sdk.volumes.main.writeFile(`${apiProxySubpath}/api.conf`, apiProxyConf)

  let backendMounts = sdk.Mounts.of().mountVolume({
    volumeId: 'main',
    subpath: test ? testDataSubpath : null,
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

  return (
    daemons
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
                successMessage: test
                  ? i18n(
                      'TEST MODE: the backend is running against the testnet4 nodes at ${host}.',
                      { host: test.host },
                    )
                  : i18n(
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
      .addDaemon('api', {
        subcontainer: sdk.SubContainer.of(
          effects,
          { imageId: 'nginx' },
          sdk.Mounts.of().mountVolume({
            volumeId: 'main',
            subpath: apiProxySubpath,
            mountpoint: '/etc/nginx/conf.d',
            readonly: true,
          }),
          'api',
        ),
        exec: { command: sdk.useEntrypoint() },
        ready: {
          display: i18n('API'),
          fn: () =>
            sdk.healthCheck.checkPortListening(effects, apiProxyPort, {
              successMessage: test
                ? i18n('TEST MODE: the API interface is answering.')
                : i18n(
                    'The API interface is answering. New swaps on mainnet are turned down until Phase 5.',
                  ),
              errorMessage: i18n('The API interface is not answering'),
            }),
        },
        requires: ['backend'],
      })
      .addHealthCheck('lightning', {
        ready: {
          display: i18n('Lightning'),
          fn: async () => {
            if (test && !testLnd) {
              return {
                result: 'disabled',
                message: i18n(
                  'TEST MODE without Lightning: chain swaps only. Enter Test Mode again with the macaroon and cert to add it.',
                ),
              }
            }
            if (!test && !lfMacaroon) {
              return {
                result: 'disabled',
                message: i18n(
                  'Not connected: chain swaps only. Run Connect Lightning Fork to check the node (D42).',
                ),
              }
            }
            if (!test && !lfGrpc) {
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
                  message: test
                    ? i18n(
                        'TEST MODE: connected to the Lightning Fork node at ${host} (node ${key})',
                        { host: test.host, key: `${key.slice(0, 10)}...` },
                      )
                    : i18n(
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
      .addHealthCheck('swaps', {
        ready: {
          display: i18n('Swaps'),
          fn: async () => {
            if (terms.paused) {
              return {
                result: 'disabled',
                message: i18n(
                  'Paused: new swaps are turned down, swaps already made carry on',
                ),
              }
            }
            // What the backend took from boltz.conf, as the API shows it
            try {
              const res = await fetch(
                `http://127.0.0.1:${apiPort}/v2/swap/chain`,
                { signal: AbortSignal.timeout(2_000) },
              )
              const pairs = (await res.json()) as {
                BTC?: {
                  SHA256?: {
                    rate: number
                    fees: { percentage: number }
                    limits: { minimal: number; maximal: number }
                  }
                }
              }
              const pair = pairs.BTC?.SHA256
              if (!pair) {
                return {
                  result: 'failure',
                  message: i18n(
                    'The backend does not list the BTC to SHA-256 pair: see the log',
                  ),
                }
              }
              return {
                result: 'success',
                message: i18n(
                  'Rate ${rate} SHA-256 per BTC, fee ${fee}% each way, swaps from ${min} to ${max} SHA-256 sats',
                  {
                    rate: String(pair.rate),
                    fee: String(pair.fees.percentage),
                    min: sats(pair.limits.minimal),
                    max: sats(pair.limits.maximal),
                  },
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
      // A3d: blueprint 6.4's alerts, every two minutes. Liquidity is read only
      // while new swaps can be made. The first check runs a second after the
      // backend is up; cooldownTrigger would wait the full two minutes first
      // and keep SwapSha "Starting" that long (A4a, Nov 8).
      .addHealthCheck('alerts', {
        ready: {
          display: i18n('Alerts'),
          trigger: sdk.trigger.statusTrigger(120_000, { starting: 1_000 }),
          fn: async () => {
            const alerts = overviewAlerts(
              await gatherOverview(effects, {
                withBalances: !!test && !terms.paused,
              }),
            )
            return alerts.length
              ? { result: 'failure', message: alerts.join('; ') }
              : { result: 'success', message: i18n('No alerts') }
          },
        },
        requires: ['backend'],
      })
      // A4b, D44: the rescue file, checked against the database once a minute
      // and rewritten when the open swaps change, for every backup to hold
      .addHealthCheck('rescue', {
        ready: {
          display: i18n('Rescue file'),
          trigger: sdk.trigger.statusTrigger(60_000, { starting: 1_000 }),
          fn: () => updateRescueFile(effects, { test: !!test, pgPassword }),
        },
        requires: ['backend'],
      })
      .addHealthCheck('test-mode', {
        ready: {
          display: test ? i18n('Test mode') : null,
          fn: () =>
            test
              ? {
                  result: 'success',
                  message: i18n(
                    'TEST MODE on testnet4, nodes at ${host}. Mainnet data is kept aside; Leave Test Mode brings it back.',
                    { host: test.host },
                  ),
                }
              : { result: 'disabled', message: null },
        },
        requires: [],
      })
  )
})
