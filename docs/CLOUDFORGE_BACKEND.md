# CloudForge backend integration

## Current state

OpenWeb Linux is still a browser-side JavaScript shell. It does not run a
Linux kernel, Ubuntu userspace, Bash, apt, or real host processes.

The CloudForge repository is the selected control plane, but its current
compute implementation is not yet capable of provisioning a guest:
- `POST /v1/instances` stores pending VM metadata only.
- The Ubuntu image catalog entry is not yet a verified bootable artifact.
- QEMU/KVM support is currently read-only preflight and validation-only planning.
- Trusted node enrollment, scheduling, storage/network execution, and VM
  lifecycle operations are not yet implemented.
- No terminal ticket broker or WebSocket PTY gateway exists.

Therefore, changing the browser's distro label or replacing `apk` with
`apt` would only create another simulation. This project will not present
that as a real Ubuntu host.

## Target architecture

- Static frontend: GitHub Pages.
- Control plane: CloudForge API Gateway.
- Data plane: dedicated Ubuntu 24.04 LTS VM provisioned by CloudForge.
- Terminal transport: authenticated WebSocket PTY gateway.
- Identity: CloudForge user session exchanged server-side for a short-lived,
  single-use terminal ticket.
- Isolation: one guest per user initially, with bounded CPU, memory, disk,
  process count, session duration, and network policy.

See the CloudForge design and security gates:
https://github.com/Reaccionador2Jeje/CloudForge/blob/main/docs/architecture/terminal-sessions.md

## Frontend integration contract

The frontend must expose explicit states:
- `unavailable`: backend or real guest is not provisioned.
- `connecting`: a short-lived ticket is being exchanged and the WebSocket is
  opening.
- `connected`: terminal I/O is attached to the real guest PTY.
- `disconnected`: the session ended or the connection was lost.

The frontend must never fall back to the JavaScript shell while showing a
"connected" or "Ubuntu host" status. A local demo, if retained, must be
visibly labeled as a simulation and kept separate from the real-host mode.

## Activation gate

Do not enable the real terminal until CloudForge has a verified Ubuntu 24.04
image, trusted compute node, working VM lifecycle, tenant ownership checks,
isolated networking/storage, terminal ticket issuance, and tested WebSocket
PTY gateway. Never expose a public unauthenticated shell or the host's
hypervisor/container runtime socket to browser users.
