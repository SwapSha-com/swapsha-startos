# SwapSha backend (boltzd) and its Rust sidecar (boltzr), built from the
# swapsha-backend submodule. Follows swapsha-backend/docker/boltz/Dockerfile,
# with these differences for the package:
# - the source is the submodule, copied in, not cloned;
# - no git runs inside the build (.dockerignore keeps .git out); the commit
#   arrives as SWAPSHA_COMMIT, which parseGitCommit.js reads;
# - only the backend's two Rust binaries are built;
# - the Postgres client matches the Postgres 17 server the package runs.

ARG NODE_VERSION=24-bookworm-slim

FROM node:${NODE_VERSION} AS builder

RUN apt-get update && apt-get -y upgrade && apt-get -y install \
    ca-certificates \
    curl \
    g++ \
    gcc \
    git \
    gnupg2 \
    libc-dev \
    libssl-dev \
    libzmq3-dev \
    lsb-release \
    make \
    pkg-config \
    protobuf-compiler \
    python3 \
    python3-dev \
    rsync \
    wget

RUN wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgres.gpg && \
    sh -c 'echo "deb [signed-by=/usr/share/keyrings/postgres.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    apt-get update && \
    apt-get -y install libpq-dev

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /boltz-backend
COPY swapsha-backend/ .

ARG SWAPSHA_COMMIT=
ENV SWAPSHA_COMMIT=${SWAPSHA_COMMIT}

RUN npm ci
RUN cargo build --release -p boltzr -p boltzr-cli
RUN npm run compile:typescript

# The final image needs no dev dependencies
RUN rm -rf node_modules && npm ci --omit dev

FROM node:${NODE_VERSION} AS final

RUN apt-get update && apt-get -y upgrade && \
    apt-get -y install gnupg2 wget lsb-release zstd && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgres.gpg && \
    sh -c 'echo "deb [signed-by=/usr/share/keyrings/postgres.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    apt-get update && \
    apt-get -y install postgresql-client-17 postgresql-client-common && \
    apt-get clean all && rm -rf /var/lib/apt/lists/*

WORKDIR /boltz-backend
COPY --from=builder /boltz-backend/bin ./bin
COPY --from=builder /boltz-backend/dist ./dist
COPY --from=builder /boltz-backend/node_modules ./node_modules
COPY --from=builder /boltz-backend/target/release/boltzr ./target/release/boltzr
COPY --from=builder /boltz-backend/target/release/boltzr-cli ./target/release/boltzr-cli

ENV NODE_ENV=production
ENV PATH="${PATH}:/boltz-backend/bin:/boltz-backend/target/release"

ENTRYPOINT ["node", "--trace-deprecation", "/boltz-backend/bin/boltzd"]
