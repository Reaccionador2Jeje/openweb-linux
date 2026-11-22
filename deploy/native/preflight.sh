#!/bin/sh
set -eu

NELROOT_BIN="${NELROOT_BIN:-nelroot}"
NELROOT_IMAGE="${NELROOT_IMAGE:-ubuntu}"

fail() {
  printf 'OpenWeb native preflight: FAILED: %s\n' "$1" >&2
  exit 1
}

command -v "$NELROOT_BIN" >/dev/null 2>&1 || fail "NELRoot executable not found: $NELROOT_BIN"

printf '%s\n' "== NELRoot version =="
"$NELROOT_BIN" --version || fail "NELRoot could not report its version"

printf '\n%s\n' "== Engine status =="
"$NELROOT_BIN" engine status --json || fail "NELRoot engine status failed"

printf '\n%s\n' "== Image =="
"$NELROOT_BIN" image inspect "$NELROOT_IMAGE" || fail "Image '$NELROOT_IMAGE' is not registered"

printf '\n%s\n' "== Rootless namespace + mount probe =="
"$NELROOT_BIN" run-rootless "$NELROOT_IMAGE" -- /bin/true \
  || fail "Host denied the rootless launch. Check user namespaces, mount namespaces and mount propagation permissions."

printf '\n%s\n' "PASS: this host passed NELRoot's real rootless launch probe."
printf '%s\n' "This is a capability check, not a complete security certification."
