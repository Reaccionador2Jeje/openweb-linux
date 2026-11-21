# OpenWeb Linux — Ecosystem Integration

Status: TTY rewrite in progress on branch tty-rewrite. The active browser frontend is a fullscreen xterm.js terminal. Real shell execution is provided by the separate Ubuntu 24.04 container backend.

## Boundaries
- The browser must remain a terminal emulator, not a simulated Linux shell.
- Commands run in a per-workspace Ubuntu container through the backend PTY.
- GitHub Pages hosts static frontend assets only; it is not the Linux execution host.
- Backend access requires authentication; never embed the backend access token in public frontend files.
- Workspaces persist in dedicated Docker volumes and require quotas, retention, and cleanup policies.
- Keep the distinction between container isolation and a full virtual machine explicit.

## Current implementation
- Fullscreen pure-black TTY frontend.
- WebSocket protocol and terminal resize support.
- Node.js backend using node-pty and Docker.
- Ubuntu 24.04 image with Bash, apt, Git, Python, GCC, editors, and common CLI tools.
- Workspace-specific persistent home volume.
- Container CPU, memory, PID, capability, and privilege-gain limits.

## CloudForge direction
CloudForge is the planned infrastructure control plane. The standalone backend in this branch is a deployable first runtime adapter. A future integration should provision the host, route the WSS endpoint, and issue short-lived workspace tickets instead of exposing one shared access token to all users.

## Remaining engineering work
1. Add automated backend protocol and workspace lifecycle tests.
2. Replace shared-token authentication with CloudForge-issued short-lived session tickets.
3. Add per-workspace disk quotas and a user-visible workspace deletion workflow.
4. Add operational metrics, rate limits, and structured audit logs.
5. Run end-to-end tests against a real Docker host before merging and deploying.
