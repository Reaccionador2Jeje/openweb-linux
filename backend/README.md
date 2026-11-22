# OpenWeb Linux backend — NELRoot

This backend replaces the Docker execution path with the installed NELRoot CLI. It is a Linux-host service that creates a real interactive PTY by launching:

```sh
nelroot run-rootless ubuntu --cwd / -- /bin/bash --noprofile --norc -i
```

The image and shell are administrator configuration, never user input.

## Current integration boundary

NELRoot's current rootless launcher uses the host Linux kernel and supports same-architecture native programs. It is not a VM, a complete syscall emulator, or a complete security sandbox.

The current NELRoot rootless contract has important limitations:
- the imported guest root filesystem is mounted read-only;
- only the launcher's bounded temporary `/tmp` is writable;
- no persistent host workspace bind mount is available yet;
- PID namespace supervision and signal forwarding are incomplete;
- guest `/proc` and `/dev` mounts are not implemented;
- networking is not isolated and resource limits are not yet enforced by NELRoot;
- package installation with `apt` should not be advertised as working in this stage.

The backend reports these limitations through `GET /api/status`. It refuses to call the runtime ready unless NELRoot, its machine-readable engine status and the configured image are all present. A successful API status check is a preflight, not proof that the image can complete a shell session on every host.

## Host requirements

- Linux host, same CPU architecture as the registered Ubuntu image.
- NELRoot installed and available to the backend service account.
- A registered Ubuntu rootfs image named by `NELROOT_IMAGE` (default: `ubuntu`).
- User/mount namespace and mount operations permitted by host kernel and hosting policy.
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

This is an integration milestone, not production multi-tenant hosting. Do not use it for untrusted public workloads until NELRoot has writable per-session workspace mounts, PID supervision, resource controls, networking policy and a stronger isolation review.
