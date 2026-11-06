# AGENTS.md

This is a StartOS service-package repository: it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

- Change backend code in `SwapSha-com/swapsha-backend`, never in the `swapsha-backend`
  submodule here: a commit made inside the submodule is lost on the next `git submodule update`.
- Build with `make` (or `make x86`), not `start-cli s9pk pack` on its own: the Makefile sets
  `SWAPSHA_COMMIT`, and without it the backend reports no commit.
