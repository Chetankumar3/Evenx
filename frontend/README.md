# EvenX — Frontend

React + Vite + Tailwind CSS frontend for the EvenX event-booking system.

## Running it

```bash
cd frontend
cp .env.example .env      # adjust URLs if your backend isn't on the defaults
npm install
npm run dev               # http://localhost:5173
```

Other scripts:

- `npm run build` — production build into `dist/`
- `npm run preview` — serve the production build locally

### Environment

| Var                  | Default                 | Used for                          |
| -------------------- | ----------------------- | --------------------------------- |
| `VITE_API_BASE_URL`  | `http://localhost:3000` | main (Express) HTTP API           |
| `VITE_WS_BASE_URL`   | `ws://localhost:8080`   | statesync WebSocket (`/stream/:eventid`) |

The JWT returned by login/register is stored in `localStorage` and sent as
`Authorization: Bearer <token>` on every non-public request. The user id is
read from the JWT `sub` claim by base64-decoding the payload segment (no
library) — see `src/auth/auth.js`.

## The contract.json decoupling

`src/contract/contract.json` is the **single source of truth** for every
wire-format name shared with the backend: endpoint paths, request/response
field names, WebSocket action strings and envelope fields, status enums, the
2-bit seat-status integers, and user-facing message strings.

**No component hardcodes a wire name.** Everything flows through one helper:

```
src/contract/index.js   ->  exports `C` (accessors) + `resolvePath(template, params)`
```

Examples of the indirection in practice:

- `src/api/client.js` resolves endpoint templates (`/events/:eventid/checkout`)
  via `resolvePath()` and reads `C.endpoints`, `C.authHeader`, `C.authScheme`.
- WS frames are built from `C.wsEnvelope` / `C.clientActions` (e.g. the LOCK
  action is `C.clientActions.LOCK`, the field is `C.wsEnvelope.numSeats`), never
  string literals.
- Checkout request bodies are keyed by `C.fields.checkoutBody.general`
  (`num_seats`) or `C.fields.checkoutBody.seat_map` (`seat_nums`).
- Seat colors are derived from `C.seatStatus` (`EMPTY=0`, `LOCKED=1`, `BOOKED=2`).
- All inline notices use `C.messages.*`.

To rename anything on the wire, change it in `contract.json` **and** in the
matching backend service — no component code changes.

## Layout

```
src/
  contract/      index.js (the only importer of contract.json) + contract.json
  api/           client.js — fetch wrapper, auth header injection, typed ApiError
  auth/          auth.js (token storage + JWT decode), AuthContext.jsx
  ws/            useEventSocket.js (WS lifecycle hook), bitmap.js (2-bit decoder)
  lib/           format.js (date/money helpers)
  components/    Header, SearchBar, Layout, EventCard, EventSlider, SeatGrid,
                 Legend, GeneralBooking, Spinner, ProtectedRoute
  pages/         Home, BrowseEvents, SearchResults, EventDetail, SeatMapPage,
                 Checkout, Confirmation, MyBookings, Login, Register
  App.jsx        routes
  main.jsx       entry
```

## Booking flows

**General model** (`model === "general"`): seat-count stepper on the event
page. "Book" opens the WS, sends `{token}` first, waits for
`{type:"INIT", avlbl, book}`, sends `{reqid, action:"LOCK", num_seats:N}`,
shows "Processing…" until the ack. On success it sends `{action:"DONE"}`,
closes the socket and routes to `/checkout`. On failure it shows an error and
stays — no WS side effects.

**Seat-map model** (`model === "seat_map"`): "Open Seat Map" opens the WS,
sends `{token}` first, receives `{type:"INIT", bitmap}` and decodes the 2-bit
bitmap into a seat grid. Clicking an empty seat sends
`{reqid, action:"LOCK", seat_num:[n]}` and shows the seat as **Processing**
(orange sweep) until the ack; seats I lock turn **green**. Live pubsub deltas
`{seat_num, new_status}` keep the grid in sync. "Proceed to Checkout" (enabled
once I hold ≥1 green seat) sends `{action:"DONE"}`, closes the socket and routes
to `/checkout` carrying the locked seat numbers.

**Checkout** (both models): a single `POST /events/:eventid/checkout`. On a
`409` (lock expired) it routes back to the event page and shows
`C.messages.sessionExpired`.

**My Bookings**: whole-booking cancel via `DELETE /events/:eventid/cancel/:bookingid`;
seat-map partial cancel via `DELETE /events/:eventid/cancel` with `{seat_nums}` —
but if **all** seats of a booking are selected, the whole-booking endpoint is
called instead.

## Notes / assumptions

- The seat bitmap may arrive base64- or hex-encoded; `bitmap.js` sniffs which.
  Bits are read MSB-first within each byte (4 seats/byte). If your statesync
  packs LSB-first, flip the shift in `seatStatusAt`.
- Seat numbers are treated as 0-based on the wire and displayed as 1-based.
- `availableSeats` / `amount` / unit price fields are displayed when present;
  if no price field is returned, the checkout summary shows a ticket count.
- Geolocation is best-effort and never blocks rendering. Without a geocoder we
  cannot turn coordinates into a city name, so we fetch the full event list; the
  hook in `Home.jsx` is left in place for future enrichment.
- List/search endpoints are tolerant of either a bare array or `{events:[...]}`;
  `myBookings` accepts a bare array or `{bookings:[...]}`.
```
