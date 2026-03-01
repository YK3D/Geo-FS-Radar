# GeoFS Radar

A Tampermonkey userscript that adds an ATC-style radar overlay to [GeoFS](https://www.geo-fs.com/geofs.php?v=3.9). Displays all nearby multiplayer aircraft in real time with callsigns, altitudes, speeds, headings, velocity vectors, range rings, and airport/runway data — all on a draggable circular canvas directly in-game. *Updates Automatically*

---

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Open the Tampermonkey dashboard and create a new script.
3. Paste the full contents of `GeoFS-Main.user.js` into a new script and save OR click [Install](https://github.com/YK3D/Geo-FS-Radar/raw/main/GeoFS-Main.user.js) 
4. Open [GeoFS](https://www.geo-fs.com/geofs.php?v=3.9) — the radar appears automatically.

---

## Interface Overview

```
┌──────────────────────────────────────┐
│       [ 5.0 km ]  ← range box        │
│                                 ☰   |  ← settings button 
│                                      │
│         ╔══════════╗                 │
│         ║    N     ║                 │[ NEARBY TRAFFIC panel / TRACKER ]
│         ║    △     ║  ← you          │
│         ║W  ○ ○   E║  ← other ac     │
│         ║          ║                 │
│         ║    S     ║                 │
│         ╚══════════╝                 │
│                                      │
│              │
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
Other players are shown as blips on the radar. Each blip can display callsign, altitude (feet / FL), speed (knots), distance, heading vector, and a directional triangle. All labels are individually toggleable in the settings menu.

### Nearest Traffic HUD
A panel to the right of the radar shows live data for the **closest aircraft in the entire multiplayer session** — not just those within the current radar range. Even if no blips are visible on screen (because you've zoomed in tight or the nearest player is far away), the HUD continues to show their callsign, distance, bearing, altitude delta, speed, and heading.

### Click-to-Track
Clicking any blip locks the HUD onto that specific aircraft by session ID. While tracking an **Isolate** toggle hides all other blips, and a **Stop Tracking** button returns to nearest-aircraft mode.

### Airports & Runways
Airport data is loaded from [OurAirports](https://ourairports.com/) on startup. Runways are drawn as white lines with a blue circle at each airport. ICAO codes label each airport. Data refreshes every 5 minutes.

### Dual Data Source (Internal → REST fallback)
The radar first tries to read player data directly from GeoFS's internal multiplayer cache (`geofs.multiplayer`) — real-time, zero HTTP requests, zero rate-limit risk. If unavailable, it falls back to polling `mps.geo-fs.com/map` with exponential backoff.

The API Status row shows which source is active:
- `Internal — N aircraft (real-time)` — reading from GeoFS directly ✓
- `REST — N aircraft` — using the HTTP fallback
- `429 Rate limited — retrying in Xs` — throttled, auto-recovering

### Smooth Sweep Line
The rotating sweep line uses `requestAnimationFrame` and advances by real elapsed time, so it moves at a constant speed regardless of the data update rate or system load. A faint trailing shadow/glow sits behind the bright line and can be toggled separately.

### Themes & Pause Dimming
Normal mode is green-on-black; Night mode is red-on-black. When the game is paused, the canvas, range box, menu button, settings panel, and HUD all fade to 45% opacity together.

### Orientation Modes
- **N↑ (North-up)** — north is always at the top
- **TRK↑ (Track-up)** — your heading is always up; the map rotates

---

## Settings Menu

Open with the **☰** button. All settings save automatically to `localStorage`.

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

### Map
| Setting | Description |
|---|---|
| Airports & Runways | Airport circles and runway lines |

### My Aircraft
Shows your callsign and position (read-only).

| Setting | Description |
|---|---|
| Show My Callsign | Draws your callsign tag below your triangle |

### Radar Preferences
All values persist to `localStorage`. Every row supports **−/+ buttons** and **click-to-type** keyboard input.

| Setting | Unit | Range | Step | Description |
|---|---|---|---|---|
| Radar Size | px **or** % | 150–900 px / 1–100% | 10 px / 5% | Canvas diameter. In **%** mode, 100% fills the shortest screen dimension. |
| Min Range | km | 0.5–10 km | 0.5 km | Minimum radar zoom level |
| Max Range | km | 1–100 km | 1 km | Maximum radar zoom level |
| Scroll Step | km | 0.5–10 km | 0.5 km | Range change per scroll tick |
| Update Delay | ms | 50–1000 ms | 50 ms | Data refresh rate (REST fallback only) |
| Sweep Line | toggle | — | — | Enable/disable the rotating sweep line |
| Spin Speed | rad/frame | 0.01–0.5 | 0.01 | Sweep rotation speed (time-based, frame-rate independent) |

#### Radar Size — % mode
When the unit is **%**, the value is a percentage of `min(screen width, screen height)`. So 50% on a 1920×1080 display = 540 px. 100% fills the shortest screen dimension completely. Steps are always 5%.

#### Click-to-type
Click the green value display in any preference row to open a text input. Enter your value in the **displayed unit** (km for ranges, % for percent size, etc.), then press **Enter** or click away to commit. Press **Escape** to cancel. Values are automatically clamped to the allowed range and rounded to the nearest step.

---

## Editing Parameters in the Script

### Section 1 — Preference Defaults
Factory defaults used only on first load (menu overrides these thereafter):
```js
const _PREF_DEFAULTS = {
    radarSizePx:   450,   // initial canvas size in px
    radarSizePct:  40,    // initial canvas size in %
    radarSizeUnit: 'px',  // 'px' or '%'
    minRangeKm:    0.5,   // km
    maxRangeKm:    50,    // km
    scrollIncKm:   0.5,   // km
    fetchDelay:    250,   // ms
    spinSpeed:     0.1,   // rad/frame at 60 fps
    spinEnabled:   true,
    spinShadow:    true,
};
```

### Section 1b — Fixed Timing Constants
```js
const DRAW_INTERVAL   = 120;    // ms — full radar redraw rate (~8 fps base)
const AIRPORT_REFETCH = 300000; // ms — airport data refresh (5 min)
```
The sweep line itself runs at native frame rate via `requestAnimationFrame` and is unaffected by `DRAW_INTERVAL`.

### Section 1c — Font Families
```js
const FONT_SANS   = 'Arial, sans-serif';
const FONT_MONO   = '"Courier New", Courier, monospace';
const FONT_CANVAS = 'Arial';
```

### Section 1d — UI Object
Every pixel size in the UI is a property of the `UI` object — blip radius, font sizes, ring line width, HUD dimensions, etc. Edit here to resize individual elements without touching drawing code.

### Colour Themes
Two palettes in the `THEMES` object (`normal` and `night`). Every colour for every element is a named property — edit or extend to create your own theme.

---

## Troubleshooting

**No blips** — check API Status in the menu. Ensure Show Traffic is on. Try zooming out.

**Radar hidden** — press Alt+Z to show it (may have been toggled off).

**429 Rate Limited** — REST fallback is throttled. It self-recovers. If the internal source is active this never appears.

**HUD shows a player not visible on radar** — expected. The HUD tracks the globally nearest player regardless of radar range. Zoom out to see them on canvas.

**Airports not loading** — OurAirports CDN fetch failed. Check the browser console. Retries every 5 minutes.

**Sweep line looks jerky** — still working on this, let me know if you nkow how to fix it
