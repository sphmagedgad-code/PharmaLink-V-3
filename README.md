# PharmaLink OS — Web + Android

PharmaLink OS is an offline-first Arabic (RTL) medicine-brokerage workspace. The standalone web application is at the repository root; the Android wrapper and its original embedded web copy remain under `android/`.

## Web app
- Entry point: `index.html`
- Local UI modules: `src/`
- Offline/PWA assets: `manifest.json`, `service-worker.js`, `offline.html`, `assets/`
- Data is stored locally in the browser with IndexedDB; this project does not require a hosted database.
- WhatsApp import accepts individual `.txt` exports and classic `.zip` archives containing TXT files. ZIP import is local/offline and supports stored or Deflate entries; password-protected and ZIP64 archives are rejected with an explanation.
- Search uses the local indexed search store and ranks full-token matches above prefix-only matches.
- Sales opportunities are suggestions only. Ranking considers urgency, shortage language, configured medicine categories, freshness, estimated order value, and the completeness of buyer/seller details. The user remains responsible for confirming a match and converting it into a deal.

## Deploying the web app
Serve the repository root over HTTPS or localhost. Do not open `index.html` as a `file://` URL: ES modules, IndexedDB and service workers require a supported web origin. The web app files were copied from the embedded PWA source; the Android version remains in place.

## Android companion
The Android layer can receive permitted WhatsApp notification events through Android's notification-listener permission, queue them locally, and pass them into the same classification pipeline. It does not read WhatsApp's private database.

## Verification status
The Android APK workflow is configured and runs on pushes. A successful Android build does not verify the browser search/import flows. Before treating this branch as production-ready, test ZIP imports on the target Android browser and desktop, compare ranked opportunities against a labelled sample of real WhatsApp exports, and verify duplicate handling across renamed archives.
