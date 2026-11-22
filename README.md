# OpenWeb Linux — TTY

**OpenWeb Linux is a fullscreen terminal interface for a real Ubuntu userspace, powered by NELRoot.** The browser renders xterm.js; a separate Node.js backend launches the interactive shell through NELRoot. This is not the old JavaScript shell simulation.

[Open the GitHub Pages demo](https://reaccionador2jeje.github.io/openweb-linux/) · [Source code](https://github.com/Reaccionador2Jeje/openweb-linux) · [Backend setup](backend/README.md)

> **Status:** The TTY frontend and experimental NELRoot backend are integrated. The browser now uses GitHub sign-in instead of asking users for the administrator token. Access is restricted to GitHub usernames explicitly approved by the administrator. The backend still requires a successful NELRoot host preflight before real shell use.

## TTY interface

- Fullscreen pure-black terminal; no desktop panels, tabs or simulated shell UI.
- xterm.js with ANSI colors, cursor, scrollback and terminal resizing.
- GitHub sign-in; the administrator token stays on the backend.
- WebSocket PTY connection to the NELRoot backend.
- JSON messages for terminal input, output, resize, readiness and exit.
- Backend URL configured in `public/js/config.js`; no permanent token is embedded in frontend source.

## Architecture

```text
Browser / GitHub Pages
  index.html + xterm.js + GitHub OAuth
        |
        | one-time login code -> short-lived ticket
        | WSS /terminal?ticket=...
        v
OpenWeb Linux Node.js backend
  WebSocket + node-pty
        |
        | fixed NELRoot CLI arguments
        v
NELRoot rootless launcher
        |
        v
Ubuntu root filesystem + host Linux kernel
```

GitHub Pages serves only static files. It cannot run the Linux backend. The backend needs a separate Linux host with NELRoot, a registered Ubuntu image, Node.js 22+, npm and the native build requirements for `node-pty`.

## Frontend setup

Set the backend endpoint in `public/js/config.js`:

```js
window.OPENWEB_TTY_CONFIG = Object.freeze({
  backendUrl: "wss://tty-api.example.com/terminal"
});
```

Do not put administrator credentials in frontend files. Users authenticate with the **Sign in with GitHub** control; the backend exchanges that identity for a one-time login code and a short-lived WebSocket ticket.

An HTTPS frontend requires WSS; browsers block insecure WebSocket connections from HTTPS pages.

## User authentication

Create a GitHub OAuth App and configure its callback URL as `https://YOUR-RENDER-SERVICE.onrender.com/auth/github/callback`. Set the OAuth client ID and secret, the backend/frontend public URLs, and the comma-separated `OPENWEB_GITHUB_ALLOWED_USERS` allowlist in Render. The admin token is not a user credential and must never be placed in frontend files.

Read [backend/README.md](backend/README.md) and [NELRoot integration notes](docs/NELROOT-BACKEND.md).

Quick setup on the Linux host:

```sh
cd backend
cp .env.example .env
# Configure a unique random OPENWEB_ACCESS_TOKEN (at least 32 characters).
npm install
npm test
npm run check
npm start
```

The service binds to `127.0.0.1:8787` by default. Put it behind a TLS reverse proxy; do not expose the Node.js port directly to the public internet. NELRoot must be installed and available to the unprivileged service account, and the Ubuntu rootfs image must already be registered.

## Current NELRoot limitations

This is an integration milestone, not a production multi-tenant cloud workspace:

- NELRoot uses the host Linux kernel and requires a same-architecture image; it is not a VM.
- The guest root filesystem is read-only except for bounded temporary storage.
- User, mount, PID and network namespaces, a host-side process supervisor, guest `/proc` and a private tmpfs `/dev` are implemented.
- Address-space, CPU-time, open-file and file-size limits are applied; process-count and storage quotas remain pending.
- Persistent host workspace mounts, complete signal forwarding, standard device nodes and host port publishing remain pending.
- NELRoot's local service daemon and lifecycle CLI exist, but OpenWeb's web interface currently provides an interactive shell only; its backend runs a startup service-manager smoke test when the rootless preflight succeeds.

Do not use this backend for untrusted public workloads until the missing runtime controls and a security review are complete.

## API

- `GET /health` — backend liveness.
- `GET /auth/github` and `GET /auth/github/callback` — GitHub OAuth sign-in.
- `POST /api/session` — one-time login-code exchange for a short-lived WebSocket ticket.
- `GET /api/status` — administrator-token protected NELRoot/image preflight and service-manager smoke-test result.
- `GET /terminal?ticket=...` — one-time ticket WebSocket PTY.

The WebSocket client sends JSON `input` and `resize` messages. The server emits `ready`, `output`, `error` and `exit` messages. The permanent administrator token is never sent to the browser.

## Legacy browser simulator

The previous JavaScript simulation files are retained in the repository as historical/reference code. The active `index.html` no longer loads that simulator; it loads only the TTY frontend.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the static frontend from `main` on every push. The TTY frontend is now integrated into `main`; check the GitHub Actions Pages deployment run for publication status. The NELRoot backend must be deployed separately on a Linux host.

