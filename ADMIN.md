# Bluecrest administration

Type `admin` outside inputs or editable fields on any page to open the admin login. On mobile, append `?admin=1` (or `&admin=1` when a query already exists) or `#admin` to any page URL. `/admin?admin=1` also opens login directly.

The super admin email is `support@bluecrestshipping.com`. The generated initial password is stored in the ignored `.env` file as `BLUECREST_SUPER_ADMIN_PASSWORD`. The client includes its SHA-256 verifier in `lib/admin-bootstrap.ts`.

Admin accounts and sessions use browser localStorage, matching the requested Atlas workflow. Added admins are available only in the browser profile where they were created. Clearing browser storage removes those accounts and sessions. Role filtering is a browser behavior, not server authorization.

Super admins can see all available shipment records and add admins. Regular admins see the records they created. Shipment codes begin with `BC-`. The dashboard supports creating records, changing status/location/ETA, uploading and replacing a photo, copying tracking codes, and deleting records.

Shipments use the Firebase `shipments` collection. Creates, updates, and deletes report success only after Firestore acknowledges the operation. Shipment data no longer falls back to localStorage; existing old browser caches are not deleted, but are not used as cloud records. If the service does not respond within 15 seconds, the app reports an unconfirmed operation and asks the operator to refresh before retrying. Public tracking is at `/track?code=TRACKING_CODE`.

Photos use Supabase Storage bucket `blue`, configured by `NEXT_PUBLIC_SUPABASE_SHIPMENT_PHOTOS_BUCKET`. Uploads require existing bucket policies that allow the configured client access. No Firebase rules or Supabase policies were changed by this implementation.

Run `node scripts/check-admin.mjs` with the development server on port 3000 for isolated browser tests. The test simulates denied cloud access and checks that failures never become successful local-only shipments. It reads the bootstrap password from `.env` without logging it.

Live verification on 2026-09-14 after the policy updates: Supabase uploads to bucket blue pass, including byte-for-byte public image read-back. The real admin dashboard successfully created a shipment with an uploaded photo in Firebase. A separate visitor session loaded that photo and verified route, ETA, delivered status, progress, homepage tracking navigation, and unknown-code handling. Temporary Firebase records were removed and their deletion verified; test photos were removed from Supabase. Browser-local admin sessions remain separate from Supabase Auth sessions.

Run `node --env-file=.env scripts/verify-cloud.mjs` for temporary cloud upload/write/read-back/cleanup checks, or `node --env-file=.env scripts/check-live-tracking.mjs` for the live dashboard-to-tracking browser workflow. Both create only clearly identified temporary records and clean up their test data.

## Detailed shipment tracking

The public `/track?code=...` and `/trackingresult?code=...` pages share the full tracking layout: sender and receiver information, progress milestones, shipment history, route map, parcel information, fees, photo, and customer note.

In **Create shipment**, expand **Full tracking details** to enter sender / receiver contacts, parcel details, fees, milestone dates, and route stops. A custom tracking number is optional. In **Update shipment**, edit the collapsible sections and click **Save shipment details**. Receiver name is the existing shipment customer-name field, now labeled explicitly as the receiver. Existing shipments remain compatible; missing data displays as not provided or not recorded.

Shipment creation and saved admin changes automatically add dated history entries with the status and location at that time. Status changes record milestone dates unless the admin explicitly supplies one. Changes and their history entry are committed in the same Firestore transaction. Saving unchanged fields does not duplicate history, and failed writes do not publish history entries. Manual history entries and corrections remain available.

Route stops accept a label, marker type, latitude, and longitude, in travel order. With coordinates, the tracking page shows the full route with colored markers and connecting lines. Older records without route coordinates use a Google Maps route view. The tile provider defaults to OpenStreetMap and can be set through `NEXT_PUBLIC_MAP_TILE_URL` using `{z}`, `{x}`, and `{y}` placeholders; retain appropriate provider attribution when changing it. See [OpenStreetMap tile usage requirements](https://operations.osmfoundation.org/policies/tiles/).

The admin sets **Fee name** and **Fee amount** under **Parcel details & fees**. The button displays them directly, for example **Pay Storage Fee ($500.00)**, and lets the visitor choose WhatsApp or email with the shipment and fee details. Existing shipments without a fee name retain **Clearance Fee** as the label. **Print Receipt** prints the shipment information with navigation and action buttons hidden.

Earlier progress stages without a recorded date inherit the selected stage's date, falling back to the shipment update or creation date. Existing recorded dates remain unchanged; future undated stages display **Pending**. General site text uses a smaller 14px base, while mobile form fields retain 16px text to avoid browser zoom.

Verification: `node scripts/check-shipment-history.mjs` checks automatic activity history, no-op / failed saves, and concurrent history preservation. With the local app running, `node --env-file=.env scripts/check-tracking-details.mjs` creates and removes a temporary Firebase shipment to verify editor persistence, live tracking, map markers, mobile layout, and printing. Third-party map tiles are mocked in that browser check.

## WhatsApp and language controls

Payment buttons offer WhatsApp or email to support@bluecrestshipping.com with the same prepared details. The WhatsApp option and floating WhatsApp button open `https://wa.me/19152019157` for **+1 (915) 201-9157**. Payment messages include the tracking number, editable fee name and amount, sender / receiver details, cargo, route, status, and delivery estimate. Opening the link prepares a message; the visitor sends it in WhatsApp. A shipment's old payment-support email does not override this destination.

The floating language icon offers English, French, Spanish, Arabic, German, Portuguese, and Simplified Chinese. Interface translations are bundled locally, the choice is remembered in browser storage, and Arabic uses right-to-left layout. Customer-entered names and shipment notes remain as entered. Translation dictionaries are in `lib/languages.ts` and `lib/international-translations.ts`; public page text is localized in `app/reference-page.tsx` and React interfaces through `app/language-provider.tsx`.

Run `node scripts/check-language-whatsapp.mjs` with the local server running to check payment message contents, the floating buttons, language persistence, and Arabic mobile layout without cloud writes or sending WhatsApp messages.

The tracking map builds its route from the origin, chronological shipment activity locations, additional admin route stops, current location, and destination. Consecutive duplicate locations share a marker. Matching admin route coordinates take priority; other place names are resolved using Photon (https://photon.komoot.io/) and cached in the browser session. Only location labels are sent for lookup. Unresolved locations remain listed and can be given coordinates in the route editor. Lines connect recorded stops; they are not road directions or live GPS traces.
