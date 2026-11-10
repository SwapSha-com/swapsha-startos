# AGENTS.md

This is a StartOS service-package repository: it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

- Change backend code in `SwapSha-com/swapsha-backend`, never in the `swapsha-backend`
  submodule here: a commit made inside the submodule is lost on the next `git submodule update`.
- Build with `make` (or `make x86`), not `start-cli s9pk pack` on its own: the Makefile sets
  `SWAPSHA_COMMIT`, and without it the backend reports no commit.
- Do not add `bitcoin-knots-startos` or `knots-prerdts-startos` to `package.json` to import
  their actions: those modules import the native `diskusage` module. `startos/dependencies.ts`
  describes the two actions it needs (`generate-rpc-dependent`, `autoconfig`) by id and input
  type instead.
- The pair is `BTC/SHA256`: `rate` is SHA-256 coins per BTC and every limit is in SHA-256 sats
  (backend patch 0051). The spread is not a backend setting: `startos/operator.ts` folds it into
  the per-direction fees (Blueprint D43). Change the operator's terms through `store.json`
  (`operator`), never by editing `boltz.conf`, which `main.ts` rewrites on every start.
- The operator dashboard lives inside StartOS (Blueprint D45): the Swaps Overview action and the
  `alerts` health check, both from `startos/overview.ts`. It only reads: the backend's API, its
  admin gRPC through `boltzr-cli` (certificates and `admin.jwt` in `/data/certificates`), the
  database through `psql`, and the nodes' RPC. Do not add a web dashboard interface.
- Test mode (Blueprint D46) is a second configuration in `main.ts`, switched by `store.json`
  `testMode`: keep its data under `main/testnet4` and `main/testnet4-postgres`, and never let it
  read or write mainnet's `main` root files or the `db` volume.
- The rescue (Blueprint D44) works from `rescue.json` alone, never from the database, which may be
  what broke. Keep Rescue Swap `only-stopped`, so the backend cannot spend the same lockup at the
  same time. Keys are derived only inside the action's temporary container (`boltzr-cli tools
derive-key`) and checked against the swap script before signing; never write a key or the seed
  to a file, a log or an action result.
- Rescue Swap records what it signs in `rescued.json` before broadcasting; the backend adopts a
  record only after checking it against the swap and seeing it confirmed (backend patch 0059).
  Never mark a swap from the package side, and never drop the check: a user's claim taken for a
  rescue would make SwapSha skip its own claim.
