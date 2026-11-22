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
