#!/bin/sh
set -eu

if [ "$(id -u)" -eq 0 ]; then
  echo "OpenWeb Linux must run as an unprivileged user; refusing to start as root." >&2
  exit 1
fi

: "${OPENWEB_ACCESS_TOKEN:?Set OPENWEB_ACCESS_TOKEN in the hosting environment (32+ random characters).}"
if [ "${#OPENWEB_ACCESS_TOKEN}" -lt 32 ]; then
  echo "OPENWEB_ACCESS_TOKEN must contain at least 32 characters." >&2
  exit 1
fi

RUNTIME="${OPENWEB_RUNTIME:-docker}"
case "$RUNTIME" in
  docker)
    echo "OpenWeb Linux starting with Docker runtime; checking configured Docker Engine."
    if ! docker info >/dev/null 2>&1; then
      echo "WARNING: Docker Engine is not reachable. The API will start, but terminal sessions remain unavailable until a dedicated Engine is configured." >&2
    fi
    ;;
  nelroot)
    mkdir -p "$NELROOT_HOME"
    nelroot setup
    if ! nelroot image inspect "$NELROOT_IMAGE" >/dev/null 2>&1; then
      nelroot image register "$NELROOT_IMAGE" "$OPENWEB_ROOTFS" --architecture x86_64
    fi
    ;;
  *)
    echo "OPENWEB_RUNTIME must be docker or nelroot." >&2
    exit 1
    ;;
esac

echo "OpenWeb Linux backend starting with runtime: $RUNTIME."
exec node src/server.js
