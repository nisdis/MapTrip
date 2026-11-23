# Record My Trip app (Android, iOS)

The phone app for [map.recordmytrip.com](https://map.recordmytrip.com). It shows
the web app in a web view and adds what a web page can't do on a phone:

- **Recording with the screen off.** GPS runs in the app (on Android as a
  foreground service with a "Recording your trip" notification; on iOS with
  background location). Every fix is saved to a file until the page confirms
  it, so nothing is lost while the page is frozen, or if the app is killed.
- **Live sharing while locked.** The page tells the app about its live share;
  while the phone is locked the app keeps sending updates every 20 s.
- **Native share sheet** for place and live links.

Only "while using the app" location permission is needed.

## How it talks to the page

See `src/services/appBridge.ts` in the web app (the protocol) and
`lib/web_shell.dart` (this side). The page learns it is in the app from
`window.__RMT_APP__`, set before any page code runs, and only on the app's own
origins (`lib/config.dart`); links elsewhere open in the browser.

| Page → app (`callHandler("rmt", …)`) | |
|---|---|
| `hello` | app state, unconfirmed fixes, live share kept by the app |
| `recording` | `idle` / `recording` / `paused`: background GPS on or off |
| `ack` | fixes up to `seq` are safe in the page |
| `share` | live share details (token, stats, last point) or `null` |
| `shareText` | open the share sheet |

| App → page (`window.__rmtReceive(…)`) | |
|---|---|
| `fixes` | GPS fixes, numbered; a backlog arrives in one batch on unlock |

## Build and run

```bash
flutter pub get
flutter test
flutter run                         # a connected phone
flutter build apk --debug           # sideloadable test build
flutter run --dart-define=APP_URL=https://<preview>.vercel.app   # test a preview
```

Android application id / iOS bundle id: `com.recordmytrip.map` (permanent once
published). Release signing is not set up yet; release builds use the debug key.

## Testing background recording on a real phone

1. Install, open, allow location, start recording a trip.
2. Lock the phone and travel a few minutes (the notification stays).
3. Unlock: the whole route appears at once, without the dashed "gap" line.
4. With a live share on, the viewer keeps moving while the phone is locked.
