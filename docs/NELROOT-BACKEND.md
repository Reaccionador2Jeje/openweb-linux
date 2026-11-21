# OpenWeb Linux — NELRoot backend integration

OpenWeb Linux delegates terminal process creation to NELRoot. The backend does not emulate Linux commands and does not invoke Docker.

## Request path

```text
Browser / xterm.js
       |
       | WebSocket (terminal input/output + resize)
       v
OpenWeb Node.js backend
       |
       | fixed PTY command
       v
NELRoot CLI
       |
       | run-rootless <image> -- <shell>
       v
Linux host kernel + registered Ubuntu rootfs
```

## Why this is a staged integration

The NELRoot rootless runtime currently launches a same-architecture program from a read-only rootfs with a temporary writable `/tmp`. It does not yet offer persistent host workspace mounts, PID-namespace supervision, guest `/proc` and `/dev`, resource quotas or isolated networking. Consequently this backend currently provides an interactive shell integration target, not a full cloud development workspace.

OpenWeb Linux must not claim that `apt install`, persistent files, background services or arbitrary multi-user workloads are supported until the corresponding NELRoot capabilities exist and pass integration tests.

## Configuration

See [backend/README.md](../backend/README.md) and [backend/.env.example](../backend/.env.example).

The image name and shell executable are operator-controlled environment variables. User messages are never interpolated into a host shell command.
