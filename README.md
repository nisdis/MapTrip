# MapTrip

[Edit in StackBlitz next generation editor ⚡️](https://stackblitz.com/~/github.com/nisdis/MapTrip)

## Trips

- **Local (free, no account):** record a GPS trip or save a planned route from
  Directions. Trips are stored in the browser (IndexedDB) and listed in the
  **Trips** tab.
- **Cloud (optional, needs sign-in):** "Save to cloud" asks for an email
  (magic link) only at that moment. Powered by Supabase.

### Enabling cloud save
1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. In Supabase → Authentication → URL configuration, add your Vercel URL(s) as
   Site URL / Redirect URLs.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`) in
   Vercel → Project → Settings → Environment Variables, then redeploy.

Without these variables the app works fully, local-only.

### Recording a trip
Tap **Record** in the bottom bar. The map follows you and draws your path,
coloured by speed (blue is slow, red is fast). The panel shows speed, max
speed, distance, time and altitude. **Pause** for stops; **hold** the red button
to finish. The screen stays awake while recording, and an unfinished trip is
recovered if the tab closes.

### Live sharing

While recording, the radio button shares a live link (sign-in required; anyone
with the link can watch, no account needed). Choose 1 hour, 8 hours or until the
trip ends; every link also ends when the trip finishes and after 24 hours at
most (+1 hour extends it within that limit). The phone uploads every 20 s and
viewers refresh every 20 s from a CDN-cached answer. Viewers see the route, the
current position, speed and stats, but never anything within 300 m of where the
trip started. When sharing stops, the location data is deleted.

Limitation: phone browsers pause web pages when the screen locks, so viewers
see "No signal" until the phone is unlocked. Keep the screen on (pocket mode).

### Sharing trips and Explore

Trips saved to the cloud are **private** until their owner shares them (Trips ›
Share): **Unlisted** (anyone with the `/t/<id>` link) or **Public** (also in
Explore). Sharing needs a public name (never the email). The owner chooses how
much of the start and end to hide (300 m, 500 m by default, 1 km, or off with a
warning) and ticks which photos to show; shared photos are served with their
metadata (EXIF/GPS) removed. Only the date is shown, not the time of day.

Explore (More › Explore trips) lists public trips through the area on the map,
ranked by unique views per day (counted with a one-way hash kept for two days),
worth less as trips age. Signed-in viewers can report a trip; reports from 3
different accounts take it out of Explore until an admin reviews it (Account ›
Reported trips, for emails in `ADMIN_EMAILS`).

### Offline

- The app itself works offline (service worker: `src/sw/sw.ts`).
- Maps you've looked at stay available for about a week.
- **More › Offline maps › Save** keeps the area on screen (up to 30 km across,
  zoom 0–14) until you remove it. Saved tiles are stored without OpenFreeMap's
  data version, so they keep working after it publishes new data.
- Signed in, trips and their photos back up to your account by themselves
  (private) as soon as there's a connection.
- Trips › **GPX** exports a trip; **Import GPX** adds one (marked "Imported",
  also when shared).

### People (follows, leaderboard, achievements)

More › **People**. Following is by request: the person approves, and approved
followers also see their Unlisted trips (never Private ones). Profiles are at
`/u/<id>`; find someone from their trips (author name) or a shared profile link
(there's no people search). Block removes follows both ways and stops requests.
The leaderboard (last 7/30 days, distance) is opt-in and only includes you and
people you follow. Achievements (milestones) are computed from trips recorded in
the app (not imports) and shown on your profile only if you switch that on.

### Deleting an account

Account › **Delete my account** (password required, even when just signed in)
removes the account and everything in it: cloud trips and their photos, shared
and live links, views and reports on those trips, saved places, the public name,
reports made, and all sessions (`api/account.ts`; linked rows go by
`on delete cascade`). Trips on the device stay unless the person ticks
"Also remove the trips saved on this device".

### Place details
Tap the map to see what's there: a place icon (cafe, shop, ...) gives its name,
category, address, phone, website and opening hours, with "Open · Closes 9:00 PM"
judged on the place's own clock. Tap blank map for an address. **Directions**
starts from your current location. Details come from OpenStreetMap, so hours
appear only where contributors have added them.

### Nearby and place sheets
Chips under the header (Restaurants, Cafes, Petrol, ATMs, Hotels, Hospitals,
Pharmacies) list those places in the visible map, nearest first, with an
"Open now" filter. A place sheet has Directions / Call / Website / Share, drive
time from you, and expands to full details: weekly hours, contacts, payment,
diet, accessibility, and a photo and description for notable places (from
Wikipedia). Share links look like `/?place=lat,lng`.
Ratings, reviews and most photos aren't available from free map data.

### Local routing server (optional)
`server/` runs OSRM with India-only data. The app uses the public worldwide
router unless you set `VITE_OSRM_URL=http://localhost:5000/route/v1` in `.env.local`.

## Development
```bash
pnpm install
pnpm dev            # app (set API_PROXY_TARGET to serve /api, see tests/e2e/api-server.ts)
pnpm lint && pnpm typecheck
pnpm test           # unit tests; API tests run too when DATABASE_URL points at a Postgres
pnpm build && pnpm test:e2e   # browser tests (outside services are mocked)
```
CI (`.github/workflows/ci.yml`) runs all of the above on every push. It's advisory.
