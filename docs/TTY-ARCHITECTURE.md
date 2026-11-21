# OpenWeb Linux TTY architecture

## Components

1. `index.html` loads xterm.js, its fit addon, `public/css/tty.css`, `public/js/config.js` and `public/js/tty.js`.
2. The frontend asks for the access token in the terminal prompt and masks the typed characters.
3. The browser opens a WebSocket to the configured `/terminal` endpoint with the token query parameter.
4. The backend validates the token and browser Origin before accepting the connection.
5. The backend creates a PTY using `node-pty` and launches the fixed, administrator-configured NELRoot command.
6. Terminal input/output and resize events are exchanged as JSON messages.

## WebSocket protocol

Client to server:

- `{"type":"input","data":"pwd\r"}`
- `{"type":"resize","cols":100,"rows":30}`

Server to client:

- `{"type":"ready","session_id":"...","runtime":"NELRoot","image":"ubuntu"}`
- `{"type":"output","data":"..."}`
- `{"type":"error","message":"..."}`
- `{"type":"exit","exit_code":0}`

## Configuration

Set `backendUrl` in `public/js/config.js` to the public WSS endpoint ending in `/terminal`. Never put the access token in frontend source. The backend reads `OPENWEB_ACCESS_TOKEN` from its protected process environment.

The current token-in-query method is suitable only for controlled integration testing. A production deployment should exchange a login/session credential for a short-lived, one-use WebSocket ticket so long-lived secrets do not appear in request URLs or reverse-proxy logs.

## Deployment split

GitHub Pages serves static frontend assets only. The Node.js backend, NELRoot executable and registered Ubuntu image run on a separate Linux host behind a TLS reverse proxy.

## Runtime limitations

NELRoot's current rootless runtime is not a VM or a complete security sandbox. Its root filesystem is read-only except for temporary `/tmp`. Persistent workspace mounts, PID namespace supervision, guest `/proc` and `/dev`, resource quotas and isolated networking are not available in this integration stage. Do not claim persistent files, `apt` installation, full Linux service management or safe public multi-user hosting yet.
