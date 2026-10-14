# Changelog

All notable changes to Marrow are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-10-12

First release.

### Added

- **Opening files** — File ▸ Open (`Ctrl/Cmd+O`), drag-and-drop onto the window,
  "Open with Marrow" from the OS, and paths passed as command-line arguments.
  Files handed over before the window exists are queued and opened once the
  renderer is listening. File associations are registered for `.md`,
  `.markdown`, `.mdown` and `.mkd`.
- **Recent files** — persisted, capped at ten, under File ▸ Open Recent and on
  the empty-state screen, with a Clear action.
- **Rendering** — full GitHub Flavored Markdown (tables, task lists,
  strikethrough, autolinks, footnotes), YAML frontmatter used for the tab title,
  Shiki syntax highlighting with a language label and a copy button, KaTeX for
  inline and display maths, and Mermaid diagrams that re-render on theme change
  and report parse errors inline.
- **Local references** — relative images are resolved against the document's
  folder and served over a validated `marrow-file://` protocol; relative links
  to other markdown files open in a new tab; everything else goes to the OS.
- **Navigation** — collapsible outline sidebar that follows the scroll position,
  tabs, find-in-document with a match count and next/previous, zoom, heading
  anchors, and per-file scroll positions for the session.
- **Live reload** — open files are watched and re-rendered on save without
  losing the scroll position.
- **Themes** — light, dark and follow-system, persisted, with a typographic
  stylesheet built for long-form reading.
- **Export** — standalone HTML with styles, web fonts and images inlined; PDF
  rendered in an offscreen window; and printing from the live window.
- **Other** — raw markdown source view, word count and reading time in the
  status bar, native menus on both platforms with every shortcut shown, a
  keyboard-shortcut overlay, and remembered window size and position.

### Security

- `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true` for
  every renderer; `webSecurity` is never disabled.
- The renderer talks to the main process through a small typed `contextBridge`
  API, and every IPC message is validated in main before it reaches the
  filesystem or the shell.
- Rendered HTML is sanitized with `rehype-sanitize` before any trusted
  generator runs, and a strict Content-Security-Policy is served with the app.
  Shiki uses its JavaScript RegExp engine, so `eval` and
  `wasm-unsafe-eval` are not needed anywhere.
- Local assets are only served from folders the user has actually opened.

[unreleased]: https://github.com/your-org/marrow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/marrow/releases/tag/v0.1.0
