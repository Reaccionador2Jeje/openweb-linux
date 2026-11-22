# OpenWeb Linux backend image: NELRoot + Ubuntu rootfs + Node.js TTY API.
# Render currently runs this as an ordinary container, not a VM. NELRoot
# namespace support must be verified on the selected host before enabling shells.

FROM rust:1.89-bookworm AS nelroot-build
ARG NELROOT_COMMIT=43e3a7f809a29fcc163c08f0a0dd1dfad5074694
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git pkg-config     && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/Reaccionador2Jeje/NELRoot.git /src/nelroot \
    && git -C /src/nelroot checkout "${NELROOT_COMMIT}" \
    && cargo build --manifest-path /src/nelroot/Cargo.toml --locked --release

FROM ubuntu:24.04 AS ubuntu-rootfs

FROM node:22-bookworm AS node-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    NELROOT_BIN=/usr/local/bin/nelroot \
    NELROOT_IMAGE=ubuntu \
    NELROOT_SHELL=/bin/bash \
    NELROOT_HOME=/home/openweb/.nelroot \
    OPENWEB_ROOTFS=/opt/nelroot/ubuntu \
    OPENWEB_MAX_SESSIONS=2 \
    OPENWEB_IDLE_TIMEOUT_MS=1800000 \
    OPENWEB_MAX_INPUT_BYTES=16384 \
    NELROOT_MEMORY=512M \
    NELROOT_CPU_TIME=300 \
    NELROOT_MAX_FILES=256 \
    NELROOT_MAX_FILE_SIZE=64M

RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 --shell /bin/bash openweb
WORKDIR /app/backend
COPY --from=node-deps /app/backend/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=nelroot-build /src/nelroot/target/release/nelroot /usr/local/bin/nelroot
COPY --from=ubuntu-rootfs / /opt/nelroot/ubuntu/
COPY docker/entrypoint.sh /usr/local/bin/openweb-entrypoint
RUN chmod 0755 /usr/local/bin/nelroot /usr/local/bin/openweb-entrypoint \
    && mkdir -p /home/openweb/.nelroot \
    && chown -R openweb:openweb /home/openweb
USER openweb
EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/openweb-entrypoint"]
