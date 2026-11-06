# Updating

Upstream is [SwapSha-com/swapsha-backend](https://github.com/SwapSha-com/swapsha-backend), a fork of the Boltz backend, pinned here as the `swapsha-backend` submodule on branch `swapsha/main`.

## Bump the backend

1. Move the pin: `git -C swapsha-backend pull`, or check out the commit to pin. Then `git -C swapsha-backend submodule update --init hold`: the backend's own `hold` submodule supplies `hold/protos`, which both the TypeScript and the Rust builds compile. The backend's other submodule, `regtest`, is not needed.
2. Set the version in `startos/versions/current.ts`. If `version` in `swapsha-backend/package.json` changed, use it with revision `:0`. Otherwise raise the revision, for example `3.13.0:0` to `3.13.0:1`: the fork keeps the Boltz version through its own changes, so most bumps only raise the revision.
3. Build with `make x86`, install, and check that the service starts.

## PostgreSQL

`postgres:17-bookworm` in `startos/manifest/index.ts`: the major version the backend's tests ran against. Moving to another major version needs a dump and a restore of the database, so never change the major version in place.

## Node

`NODE_VERSION` in `Dockerfile` follows `swapsha-backend/docker/build.py`.
