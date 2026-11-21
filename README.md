# OpenWeb Linux — TTY

**OpenWeb Linux is being rewritten as a fullscreen web terminal connected to real Ubuntu 24.04 LTS.** The browser no longer simulates an operating system in JavaScript: it displays a TTY while the backend runs Bash inside isolated Ubuntu containers.

> **Status of branch tty-rewrite:** the new TTY interface, WebSocket client, Node.js backend, Ubuntu image, and deployment configuration are included. Real commands require the backend to run on a Linux host with Docker. GitHub Pages hosts only the frontend.

## TTY experience

- Fullscreen pure black screen (#000), without bars, panels, buttons, tabs, or windows.
- xterm.js terminal with keyboard input, history, and ANSI support.
- Backend authentication from the prompt; the token is masked and not stored.
- Interactive Bash session on Ubuntu 24.04 LTS.
- Persistent workspace per browser using a random local identifier.
- Reconnect to an existing workspace.
- No fake shell or simulated command catalogue in the active frontend.

## Architecture

Browser (GitHub Pages) → xterm.js → WebSocket → Node.js backend → node-pty → Docker → Ubuntu 24.04 container.

CloudForge is the planned hosting and integration target. This branch includes a standalone backend that can be tested on a Docker host; it does not claim that CloudForge has already been deployed or connected.

## Run the backend

Host requirements: Linux, Docker Engine, Node.js 20 or newer, and npm. A public deployment must expose the backend through HTTPS/WSS.

1. Build the Ubuntu image from the repository root:

   docker build -t openweb-linux-ubuntu:24.04 ./backend/ubuntu

2. Install backend dependencies:

   cd backend && npm install

3. Copy backend/.env.example to backend/.env. Set OPENWEB_ACCESS_TOKEN to a long random secret of at least 32 characters. Set OPENWEB_ALLOWED_ORIGINS to the exact frontend origin, for example https://reaccionador2jeje.github.io. Never commit the real token or place it in frontend JavaScript.

4. Start the service with the environment variables loaded:

   set -a
   . ./.env
   set +a
   npm start

   The health endpoint is /health and the terminal WebSocket endpoint is /terminal.

5. Set backendUrl in public/js/config.js to the public WSS URL. For local development, a query override is supported, for example ?backend=ws://localhost:8787/terminal. HTTPS pages require WSS.

## Ubuntu shell

The workspace shell is Bash. The user inside the container is openweb, not root. Administrative package operations use sudo:

    whoami
    cat /etc/os-release
    sudo apt update
    sudo apt install -y tree
    python3 --version
    gcc --version
    git --version

## Isolation and persistence

Each workspace has its own Docker container and persistent volume. Containers publish no ports, run without privileged mode, drop Linux capabilities, enable no-new-privileges, and have memory, CPU, and process limits. Workspace data remains in its volume after the container is stopped.

This is container isolation, not a VM or an absolute security boundary. Run the backend on a dedicated, patched Linux host. The backend requires access to the Docker daemon, which is highly privileged; never mount the Docker socket inside user containers. Define storage quotas and a cleanup policy before a public multi-user launch.

## Configuration and design

See backend/.env.example and docs/TTY-ARCHITECTURE.md.

The former JavaScript simulation remains in public/js/app.js as a historical reference, but index.html no longer loads it. The active interface is the TTY.
