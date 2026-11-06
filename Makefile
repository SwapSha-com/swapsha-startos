ARCHES := x86
# The backend submodule's commit, read by the image build
# (startos/manifest/index.ts, buildArgs) and shown in the backend's version
export SWAPSHA_COMMIT := $(shell git -C swapsha-backend rev-parse --short=8 HEAD 2>/dev/null)
# overrides to s9pk.mk must precede the include statement
include node_modules/@start9labs/start-sdk/s9pk.mk
