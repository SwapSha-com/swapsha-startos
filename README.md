<p align="center">
  <img src="icon.svg" alt="SwapSha logo" width="21%">
</p>

# SwapSha on StartOS

> **Upstream repo:** <https://github.com/SwapSha-com/swapsha-backend>

SwapSha is an open-source, non-custodial swap between Bitcoin (BTC) and coins on the SHA-256 chain (Spamcoin), built on a fork of the Boltz backend. This repository packages it for StartOS.

**Status: work in progress.** This build runs PostgreSQL only. The backend, its configuration and its dependencies come next. SwapSha is test software: it has not been audited, and swaps on mainnet are switched off in the code.

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

The backend's commit reaches the image build as `SWAPSHA_COMMIT`, which the `Makefile` reads from the submodule; no git runs inside the build. The build also needs the backend's own `hold` submodule, for `hold/protos`: after cloning, run `git submodule update --init` and then `git -C swapsha-backend submodule update --init hold`.

## Volume and Data Layout

| Volume    | Mounted at                | Contents                                                         |
| --------- | ------------------------- | ---------------------------------------------------------------- |
| `main`    | not mounted yet           | The backend's data directory (configuration, `seed.dat`, stores) |
| `db`      | `/var/lib/postgresql`     | PostgreSQL data (`PGDATA` is `/var/lib/postgresql/data`)         |
| `startos` | not mounted by any daemon | `store.json`                                                     |

## File Models

| File         | Volume    | Fields                                                      |
| ------------ | --------- | ----------------------------------------------------------- |
| `store.json` | `startos` | `pgPassword`: generated on install, never shown to the user |

## Dependencies

None yet. Planned: Bitcoin on the BLAKE2b chain, the SHA-256 Companion, and Lightning Fork as an optional dependency.

## Network Access and Interfaces

None yet. PostgreSQL listens on `127.0.0.1` only and is not reachable from outside the service.

## Installation and First-Run Flow

On install, a random 32-character PostgreSQL password is written to `store.json`. On first start, PostgreSQL creates its data directory, the `swapsha` user and the `swapsha` database.

## Actions

None.

## Tasks

None.

## Health Checks

| Check      | Shown | What it runs                                           |
| ---------- | ----- | ------------------------------------------------------ |
| `postgres` | No    | `pg_isready` against `127.0.0.1` as the `swapsha` user |

## Backups and Restore

A `pg_dump` of the `swapsha` database (the SDK's `Backups.withPgDump`), plus the `main` and `startos` volumes. On restore, the database is rebuilt from the dump with the password in the restored `store.json`. Not yet tested on a server.

## Limitations and Differences

- Runs no swaps yet: the backend is not started in this build.
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
architectures: [x86_64]
volumes:
  main: backend data directory (not mounted yet)
  db: PostgreSQL at /var/lib/postgresql
  startos: store.json
interfaces: none
dependencies: none yet
actions: none
health_checks: [postgres (pg_isready, not shown)]
backup: pg_dump of swapsha, plus volumes main and startos
```
