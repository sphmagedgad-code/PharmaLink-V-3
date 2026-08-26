# PharmaLink Android Live WhatsApp Layer

## Purpose
Android Companion Layer for the existing PharmaLink PWA. It captures new WhatsApp notifications with `NotificationListenerService`, persists them in a durable SQLite queue, and feeds queued events into the existing PharmaLink JS classifier/repositories through a WebView bridge.

## Real-device target
- Realme C12
- Android 11

## Flow
WhatsApp notification -> NotificationListenerService -> SQLite queue -> WebView/PWA -> `liveWhatsApp.js` -> existing classifier/repositories.

## Source filtering
The native setup screen accepts group/contact names separated by newline, comma, or semicolon. An empty filter means all WhatsApp notifications are accepted. Matching is case-insensitive substring matching against the conversation and sender fields available in the notification.

## Durability
Events are persisted before processing. Status values are `QUEUED`, `FAILED`, or `PROCESSED`. Failed events remain retryable. Duplicate notification events use a SHA-256 event key with a SQLite unique constraint.

## Important runtime limitation
This layer is designed for legitimate notification-level ingestion. It does not read WhatsApp's private database and does not use AccessibilityService as a scraping mechanism. If Android kills the PharmaLink process, new notifications remain in SQLite and are processed when PharmaLink is opened again. When the WebView process is alive, the listener immediately asks the live bridge to drain the queue.

## Build
Open the `android` directory in a current Android Studio / cloud Android environment with JDK 17 and allow Gradle to resolve dependencies. Build the `app` debug APK.

## Real-device acceptance test
1. Install the debug APK on the Realme C12 (Android 11).
2. Open PharmaLink Android.
3. Enable the notification-listener permission.
4. Configure one test WhatsApp group in the source filter.
5. Send a new WhatsApp message in that group containing a real medicine name and a BUY or SELL signal.
6. Keep PharmaLink open and confirm the medicine appears without TXT export.
7. Force-stop PharmaLink, send another message, reopen PharmaLink, and confirm the queued message is processed exactly once.
8. Repeat the same notification/event and verify no duplicate medicine/message is created.

## Verification status
The Android source is statically checked in this repository. It has NOT been compiled or installed in this Linux environment, and it has NOT been tested against a real WhatsApp notification on a Realme C12.
