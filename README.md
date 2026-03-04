# GeoFS-Radar v10.00

A Tampermonkey userscript for [GeoFS](https://www.geo-fs.com/geofs.php?v=3.9) that adds a live radar overlay, ILS approach system, TCAS collision warning, and a fully customizable settings panel.

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Create a new script and paste the contents of `GeoFS-Radar.js`.
3. Save and navigate to `https://www.geo-fs.com/geofs.php?v=3.9`.
4. The radar appears in the top-left corner. Press **Alt+Z** to toggle visibility.

---

## Features

### 🛩️ Live Radar
- Circular radar canvas showing nearby aircraft as labeled blips.
- Blips display callsign, altitude, speed, and distance.
- Color-coded heading vector arrows showing each aircraft's 30-second projected path.
- Click any blip to open a popup with full details and a **Track** button.
- Scroll wheel to zoom the radar range in/out.
- North-up or Track-up orientation modes.

### ✈️ Traffic Overlays
- Traffic triangles oriented to heading.
- Nearest aircraft HUD in the corner showing callsign, distance, altitude, and speed.
- Option to isolate/track a single aircraft.

### 🔍 Traffic Filters
| Filter | Description |
|--------|-------------|
| Hide "Foo" Players | Hides aircraft with callsign matching "Foo" |
| Hide Ground Traffic | Hides aircraft detected below 200 ft |
| Altitude Filter | Dual-handle range slider to show only traffic between a min and max altitude (0–60,000 ft) |

The altitude filter uses a canvas slider with two draggable dots connected by a green line — drag the left dot for minimum altitude and the right dot for maximum altitude.

### 🛬 ILS Approach System
Click any runway on the radar to activate an ILS approach HUD for that runway. The HUD shows:

| Field | Description |
|-------|-------------|
| **Localizer** | Horizontal deviation from runway centreline (degrees) |
| **Glideslope** | Vertical deviation from 3° glide path (feet) |
| **CDI** | Cross-shaped course deviation indicator |
| **ALT AGL** | Altitude above ground level using `geofs.animation.values.groundElevationFeet` |
| **Distance** | Distance to runway threshold (NM or km) |
| **Vert Speed** | Vertical speed (ft/min) from `geofs.animation.values.verticalSpeed` |
| **Descent °** | Actual descent angle computed from VS and ground speed |
| **Bank Angle** | Roll angle with arc indicator |

All ILS font sizes are adjustable via sliders in the **🛬 ILS Display** section.

### ⚠️ TCAS Warning System
A real-time collision detection system that projects both your aircraft and all nearby traffic 30 seconds ahead along their current headings.

**How it works:**
- Your 30-second heading vector is drawn as a dashed line from your aircraft nose.
- Each traffic aircraft's 30-second heading vector is computed.
- If the two vector **line segments** intersect (or come within the intersection margin) at roughly the same time fraction, a **TRAFFIC** warning fires.
- The warning shows the **callsign** of the conflicting aircraft and the **predicted time to collision** in seconds.

**Conditions required to trigger:**
- Both aircraft must be above the configured minimum AGL.
- Both aircraft must be moving (≥ 10 m/s).
- Altitude difference must be within the configured band.
- Path vectors must intersect within the intersection margin at a similar time (|s−t| ≤ time tolerance).

**Warning display:**
- Full-screen flashing red **TRAFFIC** text at 50% opacity.
- Orange callsign of the conflicting aircraft below.
- Yellow countdown: `COLLISION IN ~Xs`.
- Optional audio alert (stops immediately when threat clears).

**TCAS settings:**

| Setting | Default | Description |
|---------|---------|-------------|
| TCAS Warning | On | Master enable/disable |
| TCAS Audio | On | Enable/disable the audio alert |
| Lookahead Time | 30 s | How far ahead to project each path |
| Altitude Band | ±200 ft | Max altitude difference to consider a threat |
| Min Altitude (AGL) | 200 ft | Both aircraft must exceed this AGL |
| Intersection Margin | 300 m | Path proximity threshold to trigger |
| Audio Cooldown | 10 s | Minimum gap between audio replays |

If **Hide "Foo" Players** is enabled, those aircraft are also excluded from TCAS detection.

### 🛩️ My Aircraft
- Own-aircraft trail: fading orange line showing recent flight path.
- Trail length (5–300 s) and thickness (1–8 px) configurable.
- Own callsign label on radar.

### ⚙️ Radar Settings
- **Radar Size**: 150–900 px slider.
- **Scroll Step**: 0.5–10 km zoom increment per scroll wheel click.
- **Update Delay**: 50–1000 ms API poll interval.
- **Radar Opacity**: 10–100% canvas transparency — persists across sessions and page reloads.
- **Distance Unit**: km/m or Nautical Miles radio selector.
- **Range Bounds**: Dual-handle canvas slider for min/max radar range.

### 🎨 Customization
Sliders for every visual element size:
- Blip dot and triangle sizes, label font
- Player triangle size and callsign font
- HUD callsign, data, and label fonts
- Compass and ring label fonts
- Popup title and body fonts
- Trail line thickness
- All 7 ILS HUD font sizes

---

## Keyboard Shortcut

| Key | Action |
|-----|--------|
| **Alt+Z** | Toggle radar + all HUDs visibility |

---

## Settings Menu

Open by clicking the **☰** button next to the radar. Sections:

| Section | Contents |
|---------|----------|
| 🖥️ Display | Night mode, player triangle, rings, labels, orientation |
| ✈️ Traffic | Show traffic, triangles, callsigns, altitude, speed, distance, vectors, nearest HUD |
| 🔍 Filters | Hide Foo, hide ground, altitude range filter |
| 🗺️ Map | Airports & runways |
| 🛩️ My Aircraft | Callsign, trail on/off, trail length, trail thickness |
| ⚙️ Radar Settings | Size, scroll step, update delay, opacity, distance unit, range bounds |
| 📡 API Status | Live data source status |
| 🎨 Customization | All size/font sliders, trail thickness, ILS fonts |
| ⚠️ TCAS | Warning enable, audio enable, lookahead, alt band, min alt, margin, cooldown |

---

## Data Sources

The script reads aircraft data from the GeoFS multiplayer REST API and own-aircraft data from `geofs.animation.values` (the same source used by the GeoFS Information Display userscript), which provides accurate pre-computed values for altitude, vertical speed, IAS, ground speed, and ground elevation.

---

## Changelog

### v10.00
- ILS font sizes converted to live sliders (saved to localStorage).
- Radar opacity slider persists correctly — no longer reset by pause detection.
- Trail color changed to orange; trail line thickness slider added.
- Dual-handle canvas range slider for radar min/max range (with connecting line).
- Distance Unit changed to 3-way radio (km/m vs NM).
- Altitude filter added: dual-handle canvas slider to show only traffic in an altitude band.
- TCAS warning system: vector-intersection algorithm, full-screen TRAFFIC overlay.
- TCAS overlay shows conflicting callsign and predicted time to collision.
- TCAS audio stops immediately when threat clears.
- TCAS respects "Hide Foo Players" filter.
- All TCAS parameters exposed as sliders; audio independently toggleable.
- ILS now reads vertical speed and AGL from `geofs.animation.values` for accuracy.
- ILS descent angle uses `atan2(-VS, groundspeed)` for correctness.
- All menu sections have emoji labels for readability.

### v9.00
- ILS approach system with CDI, glideslope, bank angle indicator.
- ILS runway selection by clicking on radar.

### v8.06
- Internal REST API source for multiplayer traffic.
- Aircraft tracking and nearest HUD.
- Night mode toggle.

---

## Author

**YK3D**
