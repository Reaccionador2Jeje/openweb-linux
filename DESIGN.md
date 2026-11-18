# OpenWeb Linux — Design Direction

## Product
OpenWeb Linux is a Spanish-language, browser-local terminal simulator inspired by Alpine Linux. Its primary job is to let curious users explore shell commands, simulated packages, services, and multiple terminal sessions without installing a virtual machine.

## Visual concept: observatorio técnico
The interface should feel like a compact instrument console for exploring a system: calm, precise, tactile, and readable. The terminal remains the visual center; chrome supports it rather than competing with it.

## Tokens
- Deep ocean ink: `#0b141d` — page background.
- Night terminal: `#071019` — terminal output surface.
- Slate panel: `#12212d` — dialogs and structural surfaces.
- Raised blue slate: `#192d3a` — interactive surfaces.
- Signal cyan: `#70d6d0` — prompts, active tabs, and positive system signals.
- Warm amber: `#ffbd78` — caution and important notices.
- Mist text: `#e7f1f2` — primary reading color.
- Muted steel: `#91a8ad` — supporting information.
- Borders: `#29404d` / `#203541` — structural separation.

## Typography
- Interface: system sans-serif stack, with compact but comfortable labels.
- Terminal and commands: Cascadia Code / SFMono / Consolas / monospace stack.
- Use monospace for shell output, command examples, session names, and status readouts only.

## Layout
- A compact top action bar anchors the product identity and utility actions.
- A single framed terminal workspace fills the remaining viewport.
- Terminal chrome distinguishes window controls, sessions, output, and touch keyboard.
- Dialogs are focused utility surfaces; they must remain scrollable on short screens.
- Mobile collapses toolbar labels into icon controls and preserves a usable terminal and touch keyboard.

## Signature
A framed, ocean-toned terminal console with soft cyan system signals and a warm amber caution voice. This is deliberately not the usual black-and-neon-green terminal theme.

## Interaction and accessibility
- Keep all existing terminal behavior, IDs, semantics, and JavaScript hooks intact.
- Preserve visible keyboard focus, touch-sized controls, and reduced-motion support.
- Keep scrollbars visible and styled; never suppress scrolling to preserve appearance.
- Use cyan for active/positive terminal signals, amber for caution, and red only for errors.
- The product runs locally in the browser; do not imply that commands execute on a real Linux host or that user data leaves the browser.
