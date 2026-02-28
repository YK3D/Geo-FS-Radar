# GeoFS Radar

A Tampermonkey userscript that adds an ATC-style radar overlay to [GeoFS](https://www.geo-fs.com/geofs.php?v=3.9). Displays all nearby multiplayer aircraft in real time with callsigns, altitudes, speeds, headings, velocity vectors, range rings, and airport/runway data — all on a draggable circular canvas directly in-game.

---

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Open the Tampermonkey dashboard and create a new script.
3. Paste the full contents of `GeoFS_Radar.user.js` and save.
4. Navigate to `https://www.geo-fs.com/geofs.php?v=3.9` — the radar appears automatically.

---

## Interface Overview

```
┌──────────────────────────────────────┐
│  [ 5.0 km ]  ← range box            │
│  ☰  ← settings button               │
│                                      │
│         ╔══════════╗                 │
│         ║  N       ║                 │
│         ║    △     ║  ← you         │
│         ║  ○ ○     ║  ← other ac    │
│         ║      W E ║                 │
│         ║    S     ║                 │
│         ╚══════════╝                 │
│                                      │
│  [ NEARBY TRAFFIC panel ]            │
└──────────────────────────────────────┘
```

The radar canvas is a circle. Your aircraft is always in the centre. Other aircraft appear as red dots or directional triangles. Airports and runways are drawn in blue.

---

## Controls

| Action | Effect |
|---|---|
| **Drag** radar canvas | Move it anywhere on screen |
| **Scroll wheel** on radar | Zoom in/out (changes range) |
| **Click** a blip | Lock tracking onto that aircraft |
| **Click** same blip again | Stop tracking, return to nearest |
| **Click** empty canvas area | Deselect / stop tracking |
| **Alt + Z** | Toggle radar visibility on/off |
| **☰ button** | Open/close settings panel |

---

## Features

### Real-time Traffic
Other players are shown as blips on the radar. Each blip can display:
- **Callsign** — the pilot's identifier
- **Altitude** — in feet (below FL100) or flight level (FL100+)
- **Speed** — in knots
- **Distance** — from your aircraft in metres or kilometres
- **Heading vector** — a dashed line projecting ~30 seconds ahead at current speed
- **Directional triangle** — when heading data is available, blips point in the aircraft's direction

All of these labels are individually toggleable in the settings menu.

### Nearest Traffic HUD
A panel to the right of the radar shows live data for the closest aircraft (or a tracked one). It displays callsign, distance, bearing, altitude (with a delta from your altitude), speed, and heading.

### Click-to-Track
Clicking any blip locks the HUD onto that specific aircraft by session ID — not just callsign — so it works correctly even when multiple players share the default "Foo" name. While tracking:
- The blip turns gold and gets a selection ring
- An **Isolate** toggle hides all other blips so only your target is visible
- A **Stop Tracking** button returns you to nearest-aircraft mode

### Airports & Runways
Airport data is loaded from [OurAirports](https://ourairports.com/) on startup. Runways are drawn as white lines with a blue circle around each airport. ICAO codes label each airport; full names appear when zoomed in close. Data refreshes every 5 minutes.

### Dual Data Source (Internal → REST fallback)
The radar first tries to read player data directly from GeoFS's internal multiplayer cache (`geofs.multiplayer`) — this is real-time, costs zero HTTP requests, and has no rate-limit risk. If the internal cache is unavailable, it falls back to polling `mps.geo-fs.com/map` with automatic exponential backoff.

The API Status row in the settings panel shows which source is active:
- `Internal — N aircraft (real-time)` — reading from GeoFS directly ✓
- `REST — N aircraft` — using the HTTP fallback
- `429 Rate limited — retrying in Xs` — being throttled, will auto-recover

### Themes
- **Normal mode** — green-on-black phosphor radar aesthetic
- **Night mode** — deep red tones for dark environments

Themes apply to the canvas, HUD, range box, menu, and all UI elements simultaneously.

### Orientation Modes
- **N↑ (North-up)** — north is always at the top; your triangle rotates
- **TRK↑ (Track-up)** — your heading is always up; the map rotates around you

### Visibility Toggle
**Alt + Z** hides and shows the entire radar UI (canvas, range box, menu button, HUD). State is remembered across sessions.

---

## Settings Menu

Open with the **☰** button. Settings are saved automatically to `localStorage`.

### Display
| Setting | Description |
|---|---|
| Night Mode | Switch to red-on-black colour theme |
| Orientation | N↑ (north up) or TRK↑ (track up / heading up) |
| Player Triangle | Show/hide the green triangle at the canvas centre |
| Range Rings | Show/hide the three concentric distance rings |
| Ring Labels | Show/hide the distance label on each ring |

### Traffic
| Setting | Description |
|---|---|
| Show Traffic | Master toggle for all other-aircraft blips |
| Traffic Triangles | Directional triangles when heading is known; falls back to dots |
| Callsign | Show other pilots' callsigns on their blip |
| Altitude | Show altitude tag on each blip |
| Speed | Show speed tag on each blip |
| Distance | Show distance-from-you tag on each blip |
| Heading Vectors | Dashed velocity vector lines projecting from each blip |
| Tracking / Nearby Traffic | Show or hide the HUD panel |

### Map
| Setting | Description |
|---|---|
| Airports & Runways | Show/hide airport circles and runway lines |

### My Aircraft
Displays your current callsign and position (read-only). Also contains:
| Setting | Description |
|---|---|
| Show My Callsign | Draws your callsign tag below your triangle on the canvas |

---

## Editing Parameters

All tuneable constants are grouped at the top of the script in clearly labelled sections. You do not need to touch any drawing code to change behaviour or appearance.

### Section 1 — Radar Constants
```js
const radarSize  = 450;    // px  — canvas diameter
const MIN_RANGE  = 500;    // m   — minimum zoom range
const MAX_RANGE  = 50000;  // m   — maximum zoom range
const SCROLL_INC = 500;    // m   — range step per scroll tick
```

### Section 1b — Timing & Intervals
```js
const FETCH_DELAY_BASE     = 250;    // ms — normal REST poll interval
const FETCH_DELAY_MAX      = 2000;   // ms — maximum backoff after 429s
const FETCH_DELAY_INITIAL  = 500;    // ms — delay before very first REST fetch
const AIRPORT_FETCH_INITIAL = 2000;  // ms — delay before first airport fetch
const AIRPORT_REFETCH       = 300000;// ms — how often to refresh airport data (5 min)
const DRAW_INTERVAL         = 120;   // ms — canvas redraw rate (~8 fps)
const SPIN_SPEED            = 0.1;   // rad/frame — sweep line rotation speed
```
Increase `DRAW_INTERVAL` to reduce CPU usage. Decrease `SPIN_SPEED` for a slower sweep.

### Section 1c — Font Families
```js
const FONT_SANS   = 'Arial, sans-serif';              // menus, labels, buttons
const FONT_MONO   = '"Courier New", Courier, monospace'; // HUD and popup data rows
const FONT_CANVAS = 'Arial';                           // canvas 2D drawing
```
Change any of these strings to globally swap the typeface across that category.

### Section 1d — UI Object (sizes in pixels)
Every size used in the UI — blip radius, label font sizes, ring stroke width, range box dimensions, menu widths, HUD font sizes, etc. — is an entry in the `UI` object. Examples:

```js
const UI = {
    blipDotR:            5,   // radius of a plain dot blip
    blipTriTip:          11,  // nose-to-centre distance of a triangle blip
    ringLineW:           6,   // stroke width of range rings
    compassFont:         22,  // N/E/S/W letter size
    playerTriTip:        15,  // size of your own triangle
    rangeBoxW:           130, // range pill width
    menuW:               280, // settings panel width
    hudCallsignFont:     18,  // callsign value in HUD
    hudDataFont:         15,  // distance/bearing/alt/speed values in HUD
    // ...
};
```

### Colour Themes
Two full colour palettes live in the `THEMES` object (`normal` and `night`). Every colour used anywhere in the UI — canvas background, ring colours, blip colours, HUD panel colours, menu chrome — is a named property you can edit. Switch between them with the Night Mode toggle in the settings menu, or edit the palettes directly to make your own theme.

---

## Troubleshooting

**No blips appearing**
- Check the API Status row in the settings menu. If it shows an error, the REST fallback may be blocked. The internal source will activate automatically once GeoFS finishes loading.
- Make sure "Show Traffic" is enabled.
- Try increasing the range with the scroll wheel.

**Radar appears but immediately hides**
- You may have previously pressed Alt+Z to hide it. Press Alt+Z again to show it.

**429 Rate Limited message**
- The script is using the REST fallback and is being throttled. It will recover automatically with exponential backoff. If the internal source is active, this message will not appear.

**Airports not loading**
- OurAirports data is fetched from an external CDN on startup. If it fails, open the browser console to see the error. The data retries every 5 minutes.
