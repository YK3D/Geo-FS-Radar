# GeoFS Radar

A Tampermonkey userscript that adds an ATC-style radar overlay to [GeoFS](https://www.geo-fs.com/geofs.php?v=3.9). Displays all nearby multiplayer aircraft in real time with callsigns, altitudes, speeds, headings, velocity vectors, range rings, and airport/runway data — all on a draggable circular canvas directly in-game. *Updates Automatically*

---

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Open the Tampermonkey dashboard and create a new script.
3. Paste the full contents of `GeoFS-Radar.js` into a new script and save, OR click [Install](https://github.com/YK3D/Geo-FS-Radar/raw/main/GeoFS-Main.user.js)
4. Open [GeoFS](https://www.geo-fs.com/geofs.php?v=3.9) — the radar appears automatically.

---

## Interface Overview

```
┌──────────────────────────────────────┐
│       [ 5.0 km ]  ← range box        │
│                                 ☰    │  ← settings button
│                                      │
│         ╔══════════╗                 │
│         ║    N     ║                 │  [ NEARBY TRAFFIC / TRACKING / ILS panel ]
│         ║    △     ║  ← you          │
│         ║W  ○ ○   E║  ← other ac     │
│         ║          ║                 │
│         ║    S     ║                 │
│         ╚══════════╝                 │
│                                      │
└──────────────────────────────────────┘
```

The radar canvas is a circle. Your aircraft is always at the centre. Other aircraft appear as red dots or directional triangles. Airports and runways are drawn in blue. Your past flight path can be shown as an orange trail.

---

## Controls

| Action | Effect |
|---|---|
| **Drag** radar canvas | Move it anywhere on screen |
| **Scroll wheel** on radar | Zoom in/out (changes range) |
| **Click** a blip | Lock tracking onto that aircraft |
| **Click** same blip again | Stop tracking, return to nearest |
| **Click** a runway | Activate ILS approach for that runway |
| **Click** same runway again | Deactivate ILS |
| **Click** empty canvas area | Deselect / stop tracking |
| **Alt + Z** | Toggle radar visibility on/off |
| **☰ button** | Open/close settings panel |

---

## Features

### Real-time Traffic
Other players are shown as blips on the radar. Each blip can display callsign, altitude (feet / FL), speed (knots), distance, heading vector, and a directional triangle. All labels are individually toggleable in the settings menu.

### Nearest Traffic HUD
A panel to the right of the radar shows live data for the **closest aircraft in the entire multiplayer session** — not just those within the current radar range. Even if no blips are visible on screen the HUD continues to show their callsign, distance, bearing, altitude delta, speed, and heading.

### Click-to-Track
Clicking any blip locks the HUD onto that specific aircraft by session ID. While tracking, an **Isolate** toggle hides all other blips, and a **Stop Tracking** button returns to nearest-aircraft mode.

### ILS Approach System
Click any runway on the radar to activate an ILS approach display. The ILS panel replaces the Nearby Traffic HUD and shows:

- **CDI instrument** — cross-pointer localizer (vertical bar) and glideslope (horizontal bar) with ±2 dot deflection scale. Colour-coded green/yellow/red by deviation.
- **Bank angle arc** — semicircle indicator with a needle that sits dead-centre when wings-level and deflects left or right as the aircraft banks. Colour-coded by severity.
- **Data grid** — altitude AGL, distance to threshold, vertical speed (fpm), and actual descent angle.
- **Deviation pills** — localizer (ON LOC / LEFT·RIGHT X.X dots) and glideslope (ABOVE / BELOW / ON GS in feet).
- **Radar overlay** — active runway highlighted cyan, extended centreline drawn as a dashed line, ±2.5° lateral guides, and an ILS badge on the airport label.

Deactivate by clicking the same runway again, pressing **✕ CLOSE**, or pressing **Escape**.

### Own-aircraft Trail
When enabled the radar draws an orange fading trail behind your aircraft showing your recent flight path. Newer segments are brighter, older ones fade to near-transparent. Trail length is configurable from 10 to 300 seconds.

### Traffic Filters
- **Hide "Foo" Players** — suppresses aircraft whose callsign is exactly `Foo` (the GeoFS default).
- **Hide Ground Traffic** — suppresses aircraft detected as on the ground (altitude below ~200 ft AGL).

### Airports & Runways
Airport data is loaded from [OurAirports](https://ourairports.com/) on startup. Runways are drawn as white lines with a blue circle at each airport. ICAO codes label each airport. Data refreshes every 5 minutes.

### Dual Data Source (Internal → REST fallback)
The radar first tries to read player data directly from GeoFS's internal multiplayer cache (`geofs.multiplayer`) — real-time, zero HTTP requests, zero rate-limit risk. If unavailable, it falls back to polling `mps.geo-fs.com/map` with exponential backoff.

The API Status row shows which source is active:
- `Internal — N aircraft (real-time)` — reading from GeoFS directly ✓
- `REST — N aircraft` — using the HTTP fallback
- `429 Rate limited — retrying in Xs` — throttled, auto-recovering

### Themes & Pause Dimming
Normal mode is green-on-black; Night mode is red-on-black. When the game is paused the canvas, range box, menu button, settings panel, and HUD all fade to 45% opacity together.

### Orientation Modes
- **N↑ (North-up)** — north is always at the top
- **TRK↑ (Track-up)** — your heading is always up; the map rotates

---

## Settings Menu

Open with the **☰** button. All settings save automatically to `localStorage`. The button and all HUDs are placed so they never overlap each other.

### Display
| Setting | Description |
|---|---|
| Night Mode | Red-on-black colour theme |
| Orientation | N↑ or TRK↑ |
| Player Triangle | Your green centre triangle |
| Range Rings | Concentric distance rings |
| Ring Labels | Distance label on each ring |

### Traffic
| Setting | Description |
|---|---|
| Show Traffic | Master blip toggle |
| Traffic Triangles | Directional triangles (falls back to dots) |
| Callsign | Callsign tag on each blip |
| Altitude | Altitude tag on each blip |
| Speed | Speed tag on each blip |
| Distance | Distance tag on each blip |
| Heading Vectors | Velocity vector lines |
| Tracking / Nearby Traffic | HUD panel visibility |

### Traffic Filters
| Setting | Description |
|---|---|
| Hide "Foo" Players | Suppress aircraft with the default GeoFS callsign |
| Hide Ground Traffic | Suppress aircraft below ~200 ft AGL |

### Map
| Setting | Description |
|---|---|
| Airports & Runways | Airport circles and runway lines |

### My Aircraft
Shows your callsign and position (read-only).

| Setting | Description |
|---|---|
| Show My Callsign | Draws your callsign tag below your triangle |
| Show My Trail | Draws an orange fading trail of your flight path |
| Trail Length | Trail history length in seconds (10–300 s) |

### Radar Preferences

| Setting | Type | Description |
|---|---|---|
| Distance Unit | Radio (km/m · NM) | Switches all distances between metric (km / m) and nautical miles |
| Radar Size | Slider 150–900 px | Canvas diameter |
| Range Bounds | Dual-handle slider | Sets both minimum and maximum zoom range simultaneously. A green line connects the two handle dots showing the active range band. |
| Scroll Step | Slider 0.5–10 km | Range change per scroll wheel tick |
| Update Delay | Slider 50–1000 ms | REST API poll interval (internal source is unaffected) |
| Radar Opacity | Slider 10–100% | Radar canvas transparency |

### API Status
Live readout of which data source is active and how many aircraft are visible.

### Customization
Sliders for every pixel/font size in the UI, grouped by element type. Changes take effect on the next draw frame.

| Group | Controls |
|---|---|
| Blips | Dot size, triangle size, label font |
| Player | Triangle size, callsign font |
| HUD | Callsign font, data font, label font |
| Compass & Rings | Compass font, ring label font |
| Popups | Title font, body font |

---

## ILS Font Size Constants

At the very top of the script, seven named constants control ILS HUD text sizes. Edit them directly to resize individual parts of the ILS panel without touching any other code:

```js
const ILS_FONT_HEADER     = 12;  // Header label (runway + ICAO)
const ILS_FONT_LABEL      = 9;   // Small section labels (ALT AGL, DISTANCE…)
const ILS_FONT_VALUE      = 15;  // Main data values
const ILS_FONT_PILL_LABEL = 9;   // Deviation pill labels (LOCALIZER, GLIDESLOPE)
const ILS_FONT_PILL_VALUE = 13;  // Deviation pill values (ON LOC, ABOVE…)
const ILS_FONT_FOOTER     = 10;  // Footer text
const ILS_FONT_BANK_VALUE = 11;  // Bank angle canvas label
```

---

## Editing Parameters in the Script

### Section 1 — Preference Defaults
Factory defaults used only on first load (menu overrides these thereafter):
```js
const _PREF_DEFAULTS = {
    radarSizePx:        450,     // initial canvas size in px
    radarSizeUnit:      'px',    // 'px'
    minRangeKm:         0.5,     // km
    maxRangeKm:         50,      // km
    scrollIncKm:        0.5,     // km
    fetchDelay:         250,     // ms
    radarOpacity:       1.0,     // 0–1
    useNautical:        false,   // false = km/m, true = NM
    hideFooPlayers:     false,
    hideGroundPlayers:  false,
    showTrail:          false,
    trailLengthSec:     60,      // seconds
};
```

### Section 1b — Fixed Timing Constants
```js
const DRAW_INTERVAL   = 120;    // ms — full radar redraw rate (~8 fps base)
const AIRPORT_REFETCH = 300000; // ms — airport data refresh (5 min)
```

### Section 1c — Font Families
```js
const FONT_SANS   = 'Arial, sans-serif';
const FONT_MONO   = '"Courier New", Courier, monospace';
const FONT_CANVAS = 'Arial';
```

### Section 1d — UI Object
Every pixel size in the UI is a property of the `UI` object — blip radius, font sizes, ring line width, HUD dimensions, etc. Edit here to resize individual elements without touching drawing code. Most of these values are also adjustable live via the **Customization** section of the settings menu.

### Colour Themes
Two palettes in the `THEMES` object (`normal` and `night`). Every colour for every element is a named property — edit or extend to create your own theme. Trail colour is set via the `trailColor` function in each theme (currently orange: `rgba(255,140,0,α)`).

---

## Troubleshooting

**No blips** — check API Status in the menu. Ensure Show Traffic is on. Try zooming out.

**Radar hidden** — press Alt+Z to show it (may have been toggled off).

**429 Rate Limited** — REST fallback is throttled. It self-recovers. If the internal source is active this never appears.

**HUD shows a player not visible on radar** — expected. The HUD tracks the globally nearest player regardless of radar range. Zoom out to see them on canvas.

**Airports not loading** — OurAirports CDN fetch failed. Check the browser console. Retries every 5 minutes.

**ILS not activating** — airport data must finish loading first (allow ~5 seconds after page load). Make sure Airports & Runways is enabled in the Map section.

---

## Changelog

### v10.00
- **Trail** — own-aircraft orange fading trail with configurable length (10–300 s)
- **Traffic Filters** — hide players named "Foo", hide ground traffic
- **Distance Unit** — 3-way radio selector (km/m vs NM) replacing the toggle switch
- **Radar Opacity** — new slider (10–100%)
- **Sliders** — Radar Size, Scroll Step, and Update Delay now use sliders instead of +/− buttons
- **Range Bounds** — dual-handle canvas slider with a green line connecting the two thumb dots showing the active range band
- **Customization section** — sliders for all blip, player, HUD, compass, and popup sizes
- **ILS font constants** — 7 named constants at top of script for easy ILS text resizing
- **Bank angle indicator** — needle now correctly sits at 12 o'clock when wings-level and deflects left/right
- **HUD layout** — menu button and all HUDs repositioned so they never overlap each other
- **Player data** — switched to `geofs.animation.values` for more accurate speed/altitude/heading in ILS and radar

### v9.00
- ILS approach system with CDI instrument, bank angle arc, deviation pills, extended centreline overlay
- Removed sweep line animation

### v8.06
- Internal multiplayer source with REST fallback
- Click-to-track with isolate mode
- Nearest traffic HUD
- Night mode theme
- Airport / runway data from OurAirports
