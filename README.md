# PharmaLink OS

Offline-first PWA for pharmaceutical brokerage operations (Egypt).
Vanilla JS ES Modules + IndexedDB + PWA standards. No frameworks.

## Current Phase: 1 - Foundation

Implemented:
- App bootstrap (`index.html`)
- Hash-based router/nav shell (`src/ui/nav.js`)
- IndexedDB schema, connection, validation guards, atomic transaction helper (`src/db/`)
- Shared in-memory pub/sub store (`src/state/appStore.js`)
- Shared constants, logger, centralized error handling (`src/shared/`)
- Theme system + RTL/LTR support (`src/ui/styles.css`)
- PWA manifest + offline-capable service worker

Not yet implemented (Phase 2+): dashboard, medicines, suppliers, deals,
WhatsApp import, search, backup, settings screens and their repositories.

## Deployment (GitHub Pages)

1. Push this folder to a GitHub repository.
2. Enable GitHub Pages, serving from the repository root.
3. IndexedDB and ES Modules require serving over HTTP(S) - `file://`
   will not work. GitHub Pages serves over HTTPS by default.

## Deployment (Realme C12 / local testing)

ES Modules cannot be opened via `file://` on Android WebView. Serve the
folder via a local HTTP server app (e.g. from Google Play), then open
`http://localhost:<port>/index.html` in the browser.

## Architecture reference

See `docs/architecture.md` for frozen schema/field-name contracts.
