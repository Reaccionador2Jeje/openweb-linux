# OpenWeb Linux backend — Docker runtime

The default runtime is Docker. Each authenticated terminal session gets its own short-lived Ubuntu container, created through a separately managed Docker Engine. NELRoot remains available as an experimental alternative by setting `OPENWEB_RUNTIME=nelroot`.

## Docker host requirement

The backend image includes the Docker CLI, **not a Docker daemon**. It must be connected to a dedicated Docker Engine through either:
- a local Docker socket mounted by a host you control; or
- a remote Docker Engine endpoint protected by mutual TLS or SSH.

The current Render web service runs inside an ordinary container and does not provide its host Docker socket or a privileged nested Docker daemon. Therefore, merely deploying this image to Render does not make sibling-container creation available. The API can start there, but `/api/status` will report Docker as unavailable until a real Engine endpoint is configured.

Never expose an unauthenticated Docker TCP API. Access to the Docker socket or Engine is effectively host-administrator access. Use a dedicated host, restrict access to this backend, and do not share that Engine with unrelated workloads.

## Per-session container profile

OpenWeb creates a new container for each terminal session with:
- configured image (default `ubuntu:24.04`);
- no network (`--network none`);
- no host volume mounts;
- read-only root filesystem;
- temporary `/tmp` and `/run` filesystems;
- 512 MiB memory, 1 CPU, 128 process limit;
- bounded file descriptors and file size;
- all Linux capabilities dropped and `no-new-privileges`;
- unprivileged UID/GID 1000:1000;
- automatic removal when the session ends or times out.

The image must already exist on the configured Docker Engine. OpenWeb does not automatically pull images from user input. The shell path and image are administrator configuration, never user input.

This is a cautious initial profile. It is not yet a reviewed public multi-tenant platform; do not grant access to untrusted users or use a shared production Docker host.

## Configuration

Set these variables in the backend environment:

```dotenv
OPENWEB_RUNTIME=docker
OPENWEB_DOCKER_IMAGE=ubuntu:24.04
OPENWEB_DOCKER_SHELL=/bin/bash
OPENWEB_ACCESS_TOKEN=your-own-random-secret-of-at-least-32-characters
OPENWEB_ALLOWED_ORIGINS=https://reaccionador2jeje.github.io
OPENWEB_MAX_SESSIONS=2
OPENWEB_IDLE_TIMEOUT_MS=1800000
```

For a local Docker Engine, its default socket is used by the Docker CLI if available. The backend process must have permission to access that socket. For a remote Engine, configure Docker CLI's supported `DOCKER_HOST` and authentication environment (SSH or mutual TLS) through the host's secret manager. Never commit credentials or certificate material.

The backend runs as an unprivileged user. Do not solve socket permission problems by running the web backend as root or by exposing an unauthenticated Docker API.

## API and sign-in

- `GET /health` — backend liveness.
- `GET /auth/github` and `GET /auth/github/callback` — GitHub OAuth.
- `POST /api/session` — one-time login-code exchange for a short-lived WebSocket ticket.
- `POST /api/local-session` — optional local-device token exchange; disabled unless explicitly enabled.
- `GET /api/status` — administrator-token protected Docker Engine/image preflight.
- `GET /terminal?ticket=...` — consumes a one-time ticket and opens the PTY.

Only explicitly allowlisted GitHub accounts can sign in. Keep the allowlist small while the runtime is under development.

## Experimental NELRoot runtime

Set `OPENWEB_RUNTIME=nelroot` to select the previous NELRoot integration. It still requires a compatible Linux host, registered image and successful rootless preflight. The current Render container does not pass its mount-propagation check.

## Development checks

```sh
cd backend
npm ci
npm test
npm run check
```

Do not advertise the service as production-ready multi-user cloud execution until resource accounting, cleanup recovery, host isolation review, persistence policy, and operational monitoring have been completed.
