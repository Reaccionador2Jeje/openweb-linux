# OpenWeb Linux backend — NELRoot

This backend replaces the Docker execution path with the installed NELRoot CLI. It is a Linux-host service that creates a real interactive PTY by launching:

```sh
nelroot run-rootless ubuntu -- /bin/bash --noprofile --norc -i
```

The image and shell are administrator configuration, never user input.

## Current integration boundary

NELRoot's current rootless launcher uses the host Linux kernel and supports same-architecture native programs. It is not a VM, a complete syscall emulator, or a complete security sandbox.

The current NELRoot rootless contract has important limitations:
- the imported guest root filesystem is mounted read-only, with bounded writable temporary storage;
- persistent host workspace bind mounts are not available yet;
- user, mount, PID and network namespaces are created with a host-side supervisor; graceful signal forwarding and complete PID-1 semantics remain incomplete;
- guest `/proc` and a private tmpfs `/dev` are mounted, but the full standard device-node set is not yet provided;
- address-space, CPU-time, open-file and file-size limits are applied; process-count and storage quotas are not implemented; guest networking is private and is not published to the host;
- package installation with `apt` should not be advertised as working in this stage.

The backend reports these limitations through `GET /api/status`. Before allowing a terminal session, it requires NELRoot, valid machine-readable engine status, the configured image, and a successful real `run-rootless <image> -- /bin/true` probe. This confirms the host can launch a basic process, but it does not turn NELRoot into a complete security sandbox.

On backend startup, OpenWeb runs a bounded service-manager smoke test unless `OPENWEB_NELROOT_SERVICE_SMOKE_TEST=false`: it creates a temporary server-environment definition, starts the local NELRoot service daemon, launches `/bin/sleep` as an isolated guest service, verifies `running`, stops it, and cleans up the test environment. The result is written to backend logs and included in the administrator-protected `GET /api/status` response. This checks process lifecycle only; the OpenWeb web UI still does not expose service-management controls or guest port publishing.


## Host requirements

- Linux host, same CPU architecture as the registered Ubuntu image.
- NELRoot installed and available to the backend service account.
- A registered Ubuntu rootfs image named by `NELROOT_IMAGE` (default: `ubuntu`).
- User/mount namespace and mount operations permitted by host kernel and hosting policy. **Current Render deployment check:** `run-rootless` reaches the private mount-propagation step but receives `Permission denied (os error 13)` from `mount(MS_REC | MS_PRIVATE)`. On this Render service, the TTY therefore remains disabled. This is a host capability restriction, not a missing Ubuntu image or NELRoot executable; changing the guest image or falling back to `chroot` would not fix it.
- Node.js 22 or newer, npm, and native build prerequisites for `node-pty`.

Do not run this backend as host root. NELRoot's rootless launcher intentionally rejects host UID 0. Run it as an unprivileged service user.

## Configure

```sh
cd backend
cp .env.example .env
# Set OPENWEB_ACCESS_TOKEN to a random secret of at least 32 characters.
npm install
npm test
npm run check
```

Export the variables from `.env` with your service manager or a protected environment loader. This repository intentionally does not load dotenv files or commit secrets.

Start:

```sh
npm start
```

By default it binds to `127.0.0.1:8787`. Put it behind a TLS reverse proxy and expose only the proxy. Do not bind it publicly without TLS and an explicit origin allowlist.

## User sign-in and API

Create a GitHub OAuth App with:
- Homepage URL: the public GitHub Pages URL.
- Authorization callback URL: `https://YOUR-RENDER-SERVICE.onrender.com/auth/github/callback`.

Set these server-side variables in Render (never in frontend JavaScript):
- `OPENWEB_GITHUB_CLIENT_ID`
- `OPENWEB_GITHUB_CLIENT_SECRET`
- `OPENWEB_BACKEND_PUBLIC_URL` — public HTTPS URL of this backend.
- `OPENWEB_FRONTEND_URL` — public GitHub Pages URL, including the repository path and trailing slash.
- `OPENWEB_GITHUB_ALLOWED_USERS` — comma-separated GitHub usernames approved to use the terminal. An empty list denies all sign-ins.

The browser uses **Sign in with GitHub**. The backend verifies the GitHub identity, checks the allowlist, issues a one-time login code, and exchanges it for a 30-second WebSocket ticket. The permanent administrator token is never sent to the browser. The GitHub OAuth client secret remains in Render.

API:
- `GET /health` — liveness only; no secret required.
- `GET /auth/github` — starts GitHub OAuth.
- `GET /auth/github/callback` — verifies OAuth state and GitHub identity.
- `POST /api/session` — exchanges a one-time login code for a short-lived WebSocket ticket.
- `POST /api/local-session` — optional same-device token exchange for Local Mode; disabled unless `OPENWEB_ENABLE_LOCAL_AUTH=true`, requires the exact allowed Origin and the backend bearer token.
- `GET /api/status` — administrator-token protected NELRoot/image preflight.
- `GET /terminal?ticket=...` — consumes a one-time ticket and opens the PTY.

Only explicitly allowlisted GitHub accounts can sign in. Never add untrusted accounts while the runtime isolation review is incomplete.

WebSocket messages are JSON:
- client input: `{"type":"input","data":"ls\r"}`
- resize: `{"type":"resize","cols":100,"rows":30}`
- optional ping: `{"type":"ping"}`
- server ready: `{"type":"ready","session_id":"...","runtime":"NELRoot","image":"ubuntu"}`
- server output: `{"type":"output","data":"..."}`
- server exit: `{"type":"exit","exit_code":0}`

The administrator access token is never returned by the API or sent to the browser. Browser users authenticate with GitHub and receive only a one-time login code and short-lived WebSocket ticket.

## Security boundaries

- fixed executable and arguments; no arbitrary command endpoint;
- exact Origin allowlist for browser WebSocket connections;
- constant-time token comparison;
- bounded input payloads, terminal dimensions and concurrent sessions;
- idle session termination;
- backend binds to loopback by default;
- never expose this service without TLS and a reverse proxy.

This is an integration milestone, not production multi-tenant hosting. Do not use it for untrusted public workloads until NELRoot has persistent per-session workspace mounts, complete signal/PID supervision, process and storage quotas, explicit network publishing policy and a stronger isolation review.


## Same-device Local Mode

For experimental Android/Termux development, see [Android Local Mode](../docs/ANDROID-LOCAL-MODE.md). Set `HOST=127.0.0.1`, `OPENWEB_ENABLE_LOCAL_AUTH=true`, and allow only the canonical GitHub Pages origin. Open the frontend with `?mode=local`; it connects to `ws://127.0.0.1:8787/terminal` and exchanges the device token for a short-lived ticket.

The local access token is not embedded in frontend source or stored by the page. The backend must remain bound to loopback. Android compatibility is not guaranteed: `node-pty` may not build and Android policy may reject NELRoot namespaces or mount operations. A failed NELRoot preflight must keep the real terminal unavailable.
