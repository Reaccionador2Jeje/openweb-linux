# OpenWeb Linux — TTY

**OpenWeb Linux is a fullscreen terminal interface for isolated Ubuntu containers powered by Docker.** The browser renders xterm.js; a Node.js backend creates one short-lived Docker container per terminal session. NELRoot remains an experimental alternative.

[Open the GitHub Pages demo](https://reaccionador2jeje.github.io/openweb-linux/) · [Source code](https://github.com/Reaccionador2Jeje/openweb-linux) · [Backend setup](backend/README.md) · [Android Local Mode](docs/ANDROID-LOCAL-MODE.md)

 > **Status:** The TTY frontend supports the Docker runtime. Access is restricted to GitHub usernames explicitly approved by the administrator. A separate Docker Engine must be configured; the Render container does not provide its host Docker socket.

## TTY interface

- Fullscreen pure-black terminal; no desktop panels, tabs or simulated shell UI.
- xterm.js with ANSI colors, cursor, scrollback and terminal resizing.
- GitHub sign-in; the administrator token stays on the backend.
- WebSocket PTY connection to a per-session Docker container.
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
  WebSocket + node-pty + Docker CLI
        |
        | create / exec / remove one container per session
        v
Dedicated Docker Engine
        |
        v
Ubuntu container (no network, no host mounts)
```

GitHub Pages serves only static files. It cannot run the Linux backend. The backend requires a dedicated Docker Engine endpoint. The current Render service is itself a container and does not expose its host Docker daemon, so its API may be live while terminal creation remains unavailable. See [backend setup](backend/README.md) for host requirements.

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

For the experimental NELRoot path, see the [native Linux deployment guide](deploy/native/README.md).

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

The service binds to `127.0.0.1:8787` by default. Put it behind a TLS reverse proxy; do not expose the Node.js port directly to the public internet. Configure a dedicated Docker Engine and ensure `ubuntu:24.04` exists on that Engine.

## Current Docker runtime boundaries

This is an integration milestone, not a production multi-tenant cloud workspace:

- Each terminal receives a separate ephemeral container with network disabled, no host mounts, read-only root and temporary storage.
- Memory, CPU, process count, file descriptors and file size are bounded.
- Session files are deleted when the session ends; persistent workspaces and user-managed images are not implemented.
- The backend requires access to a dedicated Docker Engine. The Render web service does not provide the host Docker socket by default.
- Docker Engine access is highly privileged; this is not yet reviewed for public multi-tenant workloads.

Do not use this backend for untrusted public workloads until the missing runtime controls and a security review are complete.

## API

- `GET /health` — backend liveness.
- `GET /auth/github` and `GET /auth/github/callback` — GitHub OAuth sign-in.
- `POST /api/session` — one-time login-code exchange for a short-lived WebSocket ticket.
- `GET /api/status` — administrator-token protected Docker Engine/image preflight and service-manager smoke-test result.
- `GET /terminal?ticket=...` — one-time ticket WebSocket PTY.

The WebSocket client sends JSON `input` and `resize` messages. The server emits `ready`, `output`, `error` and `exit` messages. The permanent administrator token is never sent to the browser.

## Legacy browser simulator

The previous JavaScript simulation files are retained in the repository as historical/reference code. The active `index.html` no longer loads that simulator; it loads only the TTY frontend.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the static frontend from `main` on every push. The TTY frontend is now integrated into `main`; check the GitHub Actions Pages deployment run for publication status. The Docker Engine must be reachable by the backend; deploying the backend container alone does not provide a Docker daemon.

