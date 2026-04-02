# ── Stage 1: Install cargo-chef (layer cached until rust image changes) ────────
FROM rust:1.94-bookworm AS chef
RUN cargo install cargo-chef --locked
WORKDIR /build

# ── Stage 2: Generate dependency recipe from workspace manifests ───────────────
# Only reads Cargo.toml / Cargo.lock — never touches src files.
# Re-runs only when manifests change.
FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 3: Cook (pre-compile) all workspace dependencies ────────────────────
# This layer is cached as long as recipe.json (= Cargo.toml/Cargo.lock) is unchanged.
# A source-only change skips this entire stage → 10x faster rebuilds.
FROM chef AS builder
ARG SERVICE
ENV SQLX_OFFLINE=true

# rdkafka cmake-build feature needs cmake + C toolchain
RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY --from=planner /build/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# ── Stage 4: Compile only the changed source ──────────────────────────────────
# Deps are already compiled above. Only crate source is compiled here.
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
COPY .sqlx/ ./.sqlx/
COPY migrations/ ./migrations/

RUN cargo build --release -p "${SERVICE}" \
    && cp "target/release/${SERVICE}" /usr/local/bin/service

# ── Stage 5: Minimal runtime image ────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/service /usr/local/bin/service

CMD ["/usr/local/bin/service"]
