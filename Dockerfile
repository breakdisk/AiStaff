# ── Build stage ───────────────────────────────────────────────────────────────
# Single workspace Dockerfile — set ARG SERVICE to the cargo crate name.
# Example: docker build --build-arg SERVICE=license_service .
FROM rust:1.94-bookworm AS builder

ARG SERVICE
ENV SQLX_OFFLINE=true

# rdkafka cmake-build feature needs cmake + C toolchain
RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Workspace manifests + lock (layer-cached until these change)
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/

# SQLx offline query cache (required for macros without live DB)
COPY .sqlx/ ./.sqlx/

# Build only the target crate in release mode
RUN cargo build --release -p "${SERVICE}" \
    && cp "target/release/${SERVICE}" /usr/local/bin/service

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/service /usr/local/bin/service

CMD ["/usr/local/bin/service"]
