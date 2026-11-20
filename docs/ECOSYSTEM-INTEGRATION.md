# OpenWeb Linux — Ecosystem Integration

Status: planning document. OpenWeb Linux remains a browser-based JavaScript simulation, not a real virtual machine or host Linux shell.

## Boundaries
- Keep command execution inside the simulated filesystem and JavaScript runtime.
- Do not present simulated package/service operations as host OS changes.
- Keep persistence local to the browser and explain reset/export behavior.
- Do not transmit filesystem contents to a server without a clear user action.

## Next tasks
1. Add tests for command parsing, pipelines and redirection.
2. Add tests for path normalization and simulated filesystem boundaries.
3. Document persistence, export and recovery behavior.
4. Keep the distinction between simulation and real Linux visible in the UI and README.