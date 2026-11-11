<p align="center">
  <img src="icon.svg" alt="SwapSha logo" width="21%">
</p>

# SwapSha on StartOS

> **Upstream repo:** <https://github.com/SwapSha-com/swapsha-backend>

SwapSha is an open-source, non-custodial swap between Bitcoin (BTC) and coins on the SHA-256 chain (Spamcoin), built on a fork of the Boltz backend. This repository packages it for StartOS.

**Status: work in progress.** The backend runs against the two Knots nodes (and Lightning Fork, when connected) and turns down every new swap on mainnet until Phase 5. The operator sets the rate, fees, limits and a pause through actions. SwapSha is test software: it has not been audited, and swaps on mainnet are switched off in the code.

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [File Models](#file-models)
- [Dependencies](#dependencies)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Actions](#actions)
- [Tasks](#tasks)
- [Health Checks](#health-checks)
- [Backups and Restore](#backups-and-restore)
- [Limitations and Differences](#limitations-and-differences)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

## Image and Container Runtime

| Image      | Source                                                                                                                                                      | Architectures |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `swapsha`  | Built from `./Dockerfile` out of the `swapsha-backend` submodule: Node 24, the backend (`boltzd`) and its Rust sidecar (`boltzr`), Postgres 17 client tools | x86_64        |
| `postgres` | Official `postgres:17-bookworm`                                                                                                                             | x86_64        |
| `nginx`    | Official `nginx:1.30.6-trixie` (stable), the API interface's reverse proxy                                                                                  | x86_64        |

The backend's commit reaches the image build as `SWAPSHA_COMMIT`, which the `Makefile` reads from the submodule; no git runs inside the build. The build also needs the backend's own `hold` submodule, for `hold/protos`: after cloning, run `git submodule update --init` and then `git -C swapsha-backend submodule update --init hold`.

## Volume and Data Layout

| Volume    | Mounted at                | Contents                                                                                                                                                                                                                                                                 |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main`    | `/data` (backend)         | The backend's data directory: `boltz.conf`, `seed.dat`, certificates, the D38 stores, and `rescue.json` (D44). In test mode (D46) the backend gets `main/testnet4` as `/data` instead, and PostgreSQL gets `main/testnet4-postgres`; mainnet's files stay where they are |
| `db`      | `/var/lib/postgresql`     | PostgreSQL data (`PGDATA` is `/var/lib/postgresql/data`)                                                                                                                                                                                                                 |
| `startos` | not mounted by any daemon | `store.json`                                                                                                                                                                                                                                                             |

## File Models

| File                    | Volume    | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store.json`            | `startos` | `pgPassword`; `rpc.bitcoind` and `rpc.knots-prerdts`, each `{ user, password }`, generated by the package and never shown; `lightningFork.macaroon` (hex), from Connect Lightning Fork; `operator` (`rate`, `feePercent`, `spreadPercent`, `minSwapAmount`, `maxSwapAmount`, `paused`), from the Swaps actions, each field falling back to `operatorDefaults` in `startos/utils.ts`; `testMode` (`host`, and `lnd` with the provider node's macaroon and cert), from Enter Test Mode; `walletRecovery` (`request`, `testMode`), from Recover Node Wallets |
| `boltz.conf`            | `main`    | The backend's config, written whole by `main.ts` on every start from `store.json` and the nodes' bridge addresses                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `testnet4/boltz.conf`   | `main`    | The same for test mode, written instead of `boltz.conf` while `store.json` has `testMode`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `rescue.json`           | `main`    | The rescue file (D44): for every open swap, SwapSha's own lockup to refund and the user's lockup to claim, each with its address, transaction, timeout, swap tree and SwapSha's key path in `seed.dat`, plus the preimage once known. Checked against the database once a minute by the `rescue` health check and rewritten when the open swaps change (write to `rescue.json.new`, then rename). No keys, no seed                                                                                                                                        |
| `testnet4/rescue.json`  | `main`    | The same for test mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `rescued.json`          | `main`    | What Rescue Swap signed (D44, third amendment): swap ID, refund or claim, chain, transaction ID and hex, time, whether it was broadcast. Written before broadcasting. The backend (patch 0059) reads it at startup and at every block, checks each record against its swap's lockup and script, and once the transaction is confirmed marks the swap refunded or claimed, cancelling a type 2 hold invoice. Kept as history                                                                                                                               |
| `testnet4/rescued.json` | `main`    | The same for test mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `wallet-recovery.json`  | `main`    | Written by the backend (patch 0063) after a wallet recovery: the request it did, when it finished, and for each node wallet the method (rescan or block filters), blocks rescanned, blocks fetched back from peers and the confirmed balance. A request already in it is not done again. In test mode under `testnet4/`                                                                                                                                                                                                                                   |

## Dependencies

| Package id      | Title                            | Version range            | Kind    | Health checks               | Settings asked for            |
| --------------- | -------------------------------- | ------------------------ | ------- | --------------------------- | ----------------------------- |
| `bitcoind`      | Bitcoin Knots                    | `>=#knots:29.4.3:1`      | running | `bitcoind`, `sync-progress` | `txindex`, `zmqEnabled`       |
| `knots-prerdts` | Bitcoin Knots (SHA256) Companion | `>=#knotsprerdts:31.2:0` | running | `bitcoind`, `sync-progress` | `zmqEnabled`, `wallet.enable` |

Only the Knots flavor of `bitcoind` is accepted.

`lightning-fork` (`>=0.21.6-beta.23:0`, running, health check `lnd`) is optional (D42): it turns on once the operator runs Connect Lightning Fork with its Read only macaroon. SwapSha reaches its gRPC (host `grpc`, port 10009, LND's own TLS, bound only while its wallet is open) and mounts only its `public/` folder, read-only, for `tls.cert`; Lightning Fork keeps that folder for dependents and puts nothing else in it. The cert names the OS bridge address. The icon in `dep-icons/lightning-fork.png` is Lightning Fork's own (paulscode/lightning-fork-startos, MIT), scaled to 128 px.

The two nodes' hidden actions (`generate-rpc-dependent`, `autoconfig`) are described locally in `startos/dependencies.ts` instead of imported from their packages: their action modules import the native `diskusage` module, which would otherwise ship in this bundle. When either package changes those actions' ids or inputs, update the descriptions to match.

The dependency icons in `dep-icons/` are copied from the two packages (`dep-icon.svg` from Start9Labs/bitcoin-knots-startos at `0a05715b`, `dep-icon.png` from paulscode/knots-prerdts-startos at `c7c97df0`), both MIT.

## Network Access and Interfaces

| Interface | Type | Port                           | What it serves                                                                                                                                                                                                                                                                                             |
| --------- | ---- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API       | api  | 9006 (nginx, StartOS adds TLS) | The backend's REST API (`/`), the sidecar's API (`/v2/swap/rescue`, `/v2/swap/restore`, `/v2/quote`, `/v2/lightning/`, `/v2/asset`, swap stats, `/streamswapstatus`) and its WebSocket (`/v2/ws`), routed as `swapsha-backend/docker/nginx.conf` routes them, with the same open CORS headers. LAN and Tor |

`startos/apiProxy.ts` holds the nginx config; `main.ts` writes it to `main` (`nginx/api.conf`), mounted read-only at `/etc/nginx/conf.d`. Behind it, PostgreSQL (5432), the backend's API (9001) and gRPC (9000), and the sidecar (9003 to 9005) listen on `127.0.0.1` only.

On mainnet the API turns down every new swap until Phase 5 (D37), so it answers pairs, quotes, fees, node info and status. `GET /v2/nodes` lists Lightning Fork's node ID and the addresses it advertises, as Boltz's API does for every provider.

The backend reaches the nodes through the host bridge, at addresses read with `sdk.host.getBridgeAddress` from their bindings (host id and internal port, from each package's `startos/utils.ts`):

| Node            | RPC                                                    | ZeroMQ blocks / transactions | Wallet setup (D40)                   |
| --------------- | ------------------------------------------------------ | ---------------------------- | ------------------------------------ |
| `bitcoind`      | `rpc`, 8332 (bitcoind)                                 | `zmq`, 28332 / 28333         | through RPC                          |
| `knots-prerdts` | `rpc`, 8332 (its btc-rpc-proxy, fetches pruned blocks) | `zmq`, 28332 / 28333         | `rpc-local`, 58332 (bitcoind itself) |

The ZeroMQ addresses go into the config (`[currencies.chain.zmq]`, patch 0048), because the bridge ports differ from the ports the nodes report. The D40 wallet setup goes past the Companion's proxy (`seedWalletRpc`), because the proxy logs failed requests with their parameters. While any of these addresses is missing, the backend does not start and the Nodes health check says why.

## Installation and First-Run Flow

On install, a random 32-character PostgreSQL password and one RPC login per node are written to `store.json`. Each RPC username is `swapsha_` plus 8 random characters, so a reinstall never asks a node for a username it already has. On first start, PostgreSQL creates its data directory, the `swapsha` user and the `swapsha` database.

Then StartOS shows the tasks below on the two nodes.

## Actions

| Action                    | Group     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect Lightning Fork    | Lightning | Takes Lightning Fork's Read only macaroon (hex or base64). Refuses any macaroon that grants more than read, or any `uri` permission: it reads the grants from the macaroon's identifier (`startos/macaroon.ts`). Stores it; SwapSha restarts with Lightning Fork configured                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Disconnect Lightning Fork | Lightning | Removes the macaroon; SwapSha restarts with chain swaps only. Hidden while not connected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Export Rescue Data        | Rescue    | Shows `rescue.json`: a table of the open swaps and what SwapSha's side of each is, then the file itself. Works in any state, from the file alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Rescue Swap               | Rescue    | Only while SwapSha is stopped (D44): for a swap from `rescue.json`, an address and a fee rate, claims the user's lockup once the preimage is known, else refunds SwapSha's own after its timeout. In a temporary `swapsha` container with the data directory read-only, `boltzr-cli tools derive-key` (backend patch 0056) derives the key at the swap's path from `seed.dat`, the key is checked against the swap script, and `boltzr-cli tx refund` or `tx claim` signs, with `--blake2b` (`0x21`) on BTC. The lockup comes from the node wallet, the node's index, or the UTXO set and its block. Recorded in `rescued.json` for the backend, then broadcast through the node, or only signed and shown. The seed and keys never leave the container |
| Recover Node Wallets      | Rescue    | D40, second amendment: for a node wallet that was lost and made again empty from `seed.dat`. Stores a one-time request (`store.json` `walletRecovery`, for the current mode) that `main.ts` passes as `recoverNodeWallets` in `boltz.conf`; SwapSha restarts, and at startup the backend (patch 0063) recovers both wallets from the BLAKE2b fork block: `rescanblockchain` on an archival node; on the pruned Companion, `scanblocks` over the block filters, `getblockfrompeer` for each pruned block and a rescan of that block. Any state                                                                                                                                                                                                           |
| Swaps Overview            | Swaps     | The operator dashboard (blueprint 6.4, D45), read fresh each time: new swaps open or turned down and why; the terms as the backend serves them; liquidity (the `swapsha` wallets and Lightning Fork, from the backend's admin gRPC through `boltzr-cli wallet get-balance`) against the largest swap; each node's blocks and headers (RPC `getblockchaininfo`); open swaps from the database with the block each one expires at; alerts. Only while running                                                                                                                                                                                                                                                                                             |
| Set Rate and Fees         | Swaps     | Rate (SHA-256 coins per BTC), fee and spread, in percent. Each direction pays the fee plus half the spread (D43): `fee`, `chainSwap.buyFee` and `chainSwap.sellFee` in `boltz.conf`. SwapSha restarts; swaps already made keep their amounts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Set Limits                | Swaps     | Smallest and largest swap, in SHA-256 sats for both directions (a BTC amount counts at the rate, backend patch 0051). The backend raises the smallest when miner fees would take too much                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Pause Swaps               | Swaps     | `pauseNewSwaps = true` in `boltz.conf` (backend patch 0052): new swaps are turned down, swaps already made carry on to their claim or refund. Hidden while paused                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Resume Swaps              | Swaps     | Lifts the pause. Hidden while not paused. On mainnet new swaps stay off until Phase 5 either way                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Enter Test Mode           | Testing   | Test mode (D46): the Mac's LAN address, and optionally the testnet4 provider Lightning Fork node's macaroon and TLS cert. SwapSha restarts on testnet4 against the Mac's nodes (`swapsha_testnet4.sh lan`), with its own data and database, and wallets `swapsha-start9`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Leave Test Mode           | Testing   | Back to mainnet (stage 1). The test data and database stay for the next test. Hidden while not in test mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Tasks

All are critical: StartOS will not start SwapSha until they are done.

| On              | Action                   | When                                                                     |
| --------------- | ------------------------ | ------------------------------------------------------------------------ |
| `bitcoind`      | `generate-rpc-dependent` | Until the node's `bitcoin.conf` has an `rpcauth` line for SwapSha's user |
| `bitcoind`      | `autoconfig`             | While `txindex` or `zmqEnabled` is not on                                |
| `knots-prerdts` | `generate-rpc-dependent` | Until the node's `bitcoin.conf` has an `rpcauth` line for SwapSha's user |
| `knots-prerdts` | `autoconfig`             | While `zmqEnabled` or `wallet.enable` is not on                          |

To check for the RPC login, init mounts the node's `main` volume read-only in a throwaway container and reads `bitcoin.conf`.

## Health Checks

| Check       | Shown             | What it runs                                                                                                                                                                                                                                |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres`  | No                | `pg_isready` against `127.0.0.1` as the `swapsha` user                                                                                                                                                                                      |
| `backend`   | Yes               | The API port (9001) listening; starting until it is, which is after every startup check                                                                                                                                                     |
| `api`       | Yes               | nginx listening on 9006; after `backend`                                                                                                                                                                                                    |
| `nodes`     | Yes               | Only while a node address or RPC login is missing; the backend is off then                                                                                                                                                                  |
| `lightning` | Yes               | Disabled until Connect Lightning Fork; then success once the backend lists Lightning Fork in `GET /v2/nodes`, which it does only after the D42 checks pass                                                                                  |
| `swaps`     | Yes               | Disabled while paused; otherwise the rate, fee and limits of the BTC to SHA-256 chain pair as the backend serves them in `GET /v2/swap/chain`                                                                                               |
| `alerts`    | Yes               | Every two minutes: REPLAY_FLAGGED chain swaps still open, a node behind its headers or not answering, and, only while new swaps can be made, a wallet or Lightning Fork channel side that cannot cover the largest swap. Failure lists them |
| `rescue`    | Yes               | Every minute: reads the open swaps from the database and rewrites `rescue.json` when they changed; says how many have something of SwapSha's to refund or claim. Failure keeps the last file                                                |
| `test-mode` | Only in test mode | Says test mode is on, with the Mac's address                                                                                                                                                                                                |

## Backups and Restore

A `pg_dump` of the `swapsha` database (the SDK's `Backups.withPgDump`), plus the `main` and `startos` volumes, which hold `seed.dat` and `rescue.json`. On restore, the database is rebuilt from the dump with the password in the restored `store.json`. Backup, uninstall and restore passed on a server in build step A4a.

## Limitations and Differences

- Runs no swaps: on mainnet the backend turns down every new swap until Phase 5 (Blueprint D7, D37; backend patch 0045). It runs its startup checks against the nodes: chain identity, the D40 wallets, the D26 guard.
- On its first start the backend creates a `swapsha` wallet on each node, derived from its `seed.dat` (D40): BTC account 0', SHA-256 account 1'. It refuses to start if a `swapsha` wallet there holds other keys.
- Until the Swaps actions are run, the rate, fees and limits are placeholders (the testnet4 values: rate 1, fee 0.5%, no spread, 50,000 to 10,000,000 sats); timeouts are the testnet4 values; no pace bounds yet (D30). Lightning swap types only with Lightning Fork connected, and like all swaps on mainnet they are turned down until Phase 5. Until then Lightning Fork is reached with its Read only macaroon only (D42); the D31 macaroon comes in Phase 5.
- Test mode (D46) swaps on testnet4 against nodes on a Mac on the LAN, for stage 2 of D37; it needs the Mac awake with its nodes started after `swapsha_testnet4.sh lan`. Its PostgreSQL data is backed up as files, not as a dump.
- A rescue is adopted by the backend only once its transaction is confirmed and matches the swap's own script (backend patch 0059). A record that does not match is logged and left alone; the swap then stays open as before.
- Rescue Swap does not settle a hold invoice. When the user has claimed SwapSha's lockup in a Lightning swap of type 2 while the backend is down, the preimage is in their claim, and the hold invoice has to be settled with it in Lightning Fork before it expires.
- x86_64 only.
- Swaps on mainnet are switched off in the code until the project's final review phase.

## Quick Reference for AI Consumers

```yaml
package_id: swapsha
upstream: SwapSha-com/swapsha-backend (submodule swapsha-backend, branch swapsha/main)
upstream_version: 3.13.0 (swapsha-backend package.json)
images:
  swapsha: local build (./Dockerfile)
  postgres: postgres:17-bookworm
  nginx: nginx:1.30.6-trixie (API reverse proxy)
architectures: [x86_64]
volumes:
  main: backend data directory at /data (boltz.conf, seed.dat, rescue.json)
  db: PostgreSQL at /var/lib/postgresql
  startos: store.json
interfaces: [api (port 9006, nginx: backend REST, sidecar API and /v2/ws)]
dependencies:
  bitcoind: '>=#knots:29.4.3:1' (running; tasks generate-rpc-dependent, autoconfig txindex+zmqEnabled)
  knots-prerdts: '>=#knotsprerdts:31.2:0' (running; tasks generate-rpc-dependent, autoconfig zmqEnabled+wallet.enable)
  lightning-fork: '>=0.21.6-beta.23:0' (optional, running, health lnd; on with Connect Lightning Fork; mounts public/ only)
actions: [enter-test-mode and leave-test-mode (D46, testnet4 on the Mac), swaps-overview (dashboard, read only), set-rate (rate, fee, spread; D43), set-limits, pause-swaps, resume-swaps, connect-lightning-fork (read-only macaroon only), disconnect-lightning-fork, export-rescue-data (D44, any state), rescue-swap (D44, only while stopped), recover-node-wallets (D40, restarts with a one-time recovery)]
health_checks: [postgres (pg_isready, not shown), backend (API port 9001 listening), api (nginx 9006), nodes (only while a node is missing), lightning (Lightning Fork in GET /v2/nodes), swaps (pair as served in GET /v2/swap/chain, disabled while paused), alerts (every 2 min: REPLAY_FLAGGED, node sync, liquidity while swaps are open), rescue (every minute: rescue.json from the database)]
backup: pg_dump of swapsha, plus volumes main and startos
```
