# OpenWeb Linux TTY — architecture and operations

## Runtime boundary

The browser is a terminal emulator only. It does not implement a shell, fake filesystem, fake package manager, or command catalogue. Terminal input travels through a WebSocket to a PTY attached to Bash inside a per-workspace Ubuntu 24.04 container.

## Connection protocol

1. The browser creates or retrieves a random workspace UUID in local storage.
2. The browser opens the backend WebSocket endpoint at /terminal.
3. The first WebSocket message is JSON containing type=auth, the access token, workspace UUID, and terminal dimensions.
4. The backend validates the token and UUID, then creates or resumes the workspace container.
5. The backend sends a ready control message.
6. Subsequent frames carry terminal input and output. Resize messages carry the new terminal dimensions.

The access token is entered into the TTY prompt and is not written to local storage. For a public multi-user launch, replace the shared-token gate with short-lived, per-user workspace tickets issued by CloudForge identity/API. Never ship a backend secret in frontend JavaScript.

## Workspace lifecycle

- Each workspace receives a deterministic container and Docker volume name derived from its random UUID.
- The persistent volume is mounted only at /home/openweb.
- Closing the terminal kills the PTY but keeps the container warm for the idle window.
- The idle timer stops the container but does not delete its volume.
- OPENWEB_MAX_WORKSPACES bounds the number of existing OpenWeb containers.

Workspace volumes need an explicit retention and deletion policy before a public launch. Add storage quotas and administrative cleanup before opening registration.

## Container boundary

Containers run without published ports, privileged mode, Linux capabilities, or privilege gain. CPU, memory, and PID limits are applied. The workspace user is unprivileged; only apt and apt-get are permitted through sudo. The container has outbound networking for package downloads. This is useful isolation, not a substitute for a VM boundary against hostile multi-tenant workloads.

The Docker daemon remains highly privileged. Keep it on a dedicated, patched Linux host, restrict access to the backend process, and never mount the Docker socket inside user containers.

## Reverse proxy

Expose the backend only through HTTPS/WSS. Keep the Node process bound to loopback and terminate TLS at a trusted reverse proxy. Forward WebSocket upgrade requests to 127.0.0.1:8787. Configure the exact frontend origin in OPENWEB_ALLOWED_ORIGINS.

## CloudForge integration

The backend is deployable as a service on a Linux node. CloudForge can later provision and monitor the host, route the WSS endpoint, and mint short-lived workspace tickets. This branch currently uses a standalone shared access token; it must not be described as an already completed CloudForge integration.
