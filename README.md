# GeoFS-Radar v11.00
<img width="606" height="418" alt="Screenshot 2026-03-04 224124" src="https://github.com/user-attachments/assets/884aa0f0-df6f-467b-aff8-57d09fccb71d" />

A Tampermonkey userscript for [GeoFS](https://www.geo-fs.com/geofs.php?v=3.9) that adds a live radar overlay, ILS approach system, TCAS collision warning, nearest-traffic HUD, aircraft tracker, chase/escort autopilot, and a fully customizable settings panel.

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Create a new script and paste the contents of `GeoFS-Main.user.js`.
3. Save and navigate to [GeoFS](https://www.geo-fs.com/geofs.php?v=3.9).
4. The radar appears in the top-left corner. Press **Alt+Z** to toggle visibility.

---

## Features at a Glance

| Feature | Description |
|---------|-------------|
| 🛩️ Live Radar | Circular sweep showing all nearby aircraft as labeled blips |
| ✈️ Traffic Overlays | Heading triangles, callsigns, altitude, speed, distance labels |
| 🔍 Traffic Filters | Hide Foo, hide ground, altitude band filter |
| 🎯 Click-to-Track | Click any blip to open a popup and lock onto that aircraft |
| 📊 Nearest-Traffic HUD | Live data card for the closest (or tracked) aircraft |
| 🛬 ILS Approach | Full ILS HUD with CDI, glideslope, VS, AGL, bank angle |
| ⚠️ TCAS Warning | Heading-vector intersection alarm with callsign + countdown |
| 🎨 Customization | Sliders for every font, size, and UI element |
| 🔰 Chase / Escort | Autopilot-driven chase and 4-way formation escort mode |

<img width="50%" alt="Screenshot 2026-03-04 224124" src="https://github.com/user-attachments/assets/36224292-59d3-4c30-ad2a-f9e1ada94aef" /><img width="50%" alt="Screenshot 2026-03-04 214213" src="https://github.com/user-attachments/assets/e82842d5-7dc1-4d81-904b-472a3e0c7a28" />

## 🛩️ Live Radar

The radar is a circular canvas drawn in real time from live GeoFS multiplayer API data.

<img width="173" height="187" alt="Radar" src="https://github.com/user-attachments/assets/18ca9ba2-f270-4e75-a68f-8468f72fdf96" />

**What it shows:**
- Your aircraft in the centre as a green triangle pointing in your heading direction.
- All other online aircraft as color-coded triangles or dots with labels.
- A fading orange trail behind your aircraft showing your recent flight path.
- Range rings with distance labels.
- A compass rose.
- Heading vector arrows for each aircraft (30-second projected path line).
- A dashed amber/red line ahead of your aircraft showing your own TCAS lookahead vector.

**Interaction:**
- **Scroll wheel** — zoom radar range in/out by the configured scroll step.
- **Click a blip** — opens a popup with full details and a Track button.
- **Click a runway** — activates ILS approach guidance for that runway.
- **Alt+Z** — toggle visibility of radar and all HUDs.
- **Drag** — move the radar around the screen.

**Orientation modes:**
- **North-up** — map is fixed, your triangle rotates to show heading.
- **Track-up** — your triangle always points up, map rotates around you.

**Range:** Configurable from 0.5 km to 50 km via scroll wheel or the Range Bounds slider.

---

## ✈️ Traffic Overlays

<img width="178" height="236" alt="Traffic" src="https://github.com/user-attachments/assets/8bda0d0a-0293-429b-a10e-52cac122fb18" />

Each traffic aircraft on the radar can display:

| Label | Description |
|-------|-------------|
| **Callsign** | Aircraft registration or player name |
| **Altitude** | Current altitude in ft or m |
| **Speed** | Ground speed in kts or km/h |
| **Distance** | Range from your position in NM or km |
| **Triangle** | Heading-oriented shape (direction = heading) |
| **Vector arrow** | Dashed line showing 30-second projected path |

All labels are individually toggleable in the **✈️ Traffic** section. Triangle size, dot size, label font, and vector line weight are all adjustable in **🎨 Customization**.

---

## 🔍 Traffic Filters

<img width="171" height="137" alt="Filters" src="https://github.com/user-attachments/assets/a6245adc-66d7-43d0-a3c3-04228b6f11d8" />

| Filter | Description |
|--------|-------------|
| **Hide "Foo" Players** | Hides aircraft whose callsign is "Foo" — also excluded from TCAS detection |
| **Hide Ground Traffic** | Hides aircraft below 200 ft AGL |
| **Altitude Filter** | Dual-handle canvas slider: only show traffic between a min and max altitude |

### Altitude Range Slider

The altitude filter uses a canvas-drawn slider with two draggable circular handles connected by a green line. Drag the **left handle** to set the minimum altitude and the **right handle** to set the maximum altitude (0–60,000 ft in 500 ft steps). Labels show the current min/max values. Enable it with the **Altitude Filter** toggle above the slider.

---

## 🎯 Click-to-Inspect Popup

Click any aircraft blip on the radar to open a floating popup showing:

| Field | Description |
|-------|-------------|
| **Callsign** | Aircraft identifier |
| **Distance** | Range in NM or km |
| **Bearing** | Magnetic bearing (degrees + compass direction, e.g. `045° NE`) |
| **Altitude** | Altitude with ▲/▼ delta vs your own altitude (green = above, red = below) |
| **Speed GS** | Ground speed |
| **Heading** | Current heading in degrees |

A **Track** button in the popup locks the Nearest-Traffic HUD onto that aircraft. Click outside the popup or press **Alt+Z** to dismiss it.

---

## 📊 Nearest-Traffic HUD

The Nearest-Traffic HUD is a floating data card that automatically shows the **closest aircraft** on the radar, updating in real time as aircraft move.

**HUD fields:**

| Field | Description |
|-------|-------------|
| **Callsign** | Aircraft identifier |
| **Distance** | Range to the aircraft |
| **Bearing** | Direction from your position (degrees + cardinal) |
| **Altitude** | Altitude with ▲/▼ delta showing how much higher or lower than you |
| **Speed (GS)** | Ground speed |
| **Heading** | Aircraft heading in degrees |

The header reads **NEARBY TRAFFIC** when auto-tracking the nearest aircraft.

**Behaviour:**
- Updates every frame with the nearest aircraft in the current radar range.
- Automatically hidden when ILS approach mode is active (ILS HUD takes priority).
- Can be disabled via the **Tracking / Nearby Traffic** toggle in ✈️ Traffic settings.

---

## 🔰 Chase / Escort Mode

The Chase/Escort system lets you autonomously intercept a tracked aircraft and then maintain a precise formation position around it using GeoFS autopilot.

### Activation

1. Track any aircraft (click a blip on the radar → it locks to the HUD).
2. In the Nearest-Traffic HUD, toggle **Chase / Escort Player** on.

### Phase 1 — Chasing

| What happens | Details |
|---|---|
| Autopilot engages | Heading mode set automatically |
| Heading → target bearing | Your heading is continuously updated to point at the tracked aircraft |
| PID speed control | A PID controller adjusts your autopilot speed to close the gap |
| Escort distance slider | Drag the **Escort distance** slider (0.1 – 5.0 NM) to set how close you want to arrive |
| Phase transition | Once you are within **escort distance × 1.25**, the system switches to Escort phase |

### Phase 2 — Escorting

Once within range, 4 arrow buttons appear in the HUD.  Your heading is changed to match the tracked aircraft's heading.  Click an arrow to select your formation position:

| Arrow | Formation position | Control method |
|---|---|---|
| **▲ Forward** | Directly ahead of target along its flight path | PID speed: speed up to move forward, slow down to fall back |
| **▼ Back** | Directly behind target along its flight path | PID speed: speed up to close gap behind, slow down if too close |
| **◀ Left** | Parallel on the left wing at escort distance | Heading fine-tune: heading corrected left/right to drift to the left side |
| **▶ Right** | Parallel on the right wing at escort distance | Heading fine-tune: heading corrected left/right to drift to the right side |

Click the active arrow again to deselect it (the system will hover at the current position).

### Position Geometry

Relative positions are computed using the **latitude and longitude** of both aircraft:

- A flat-earth projection converts lat/lon offsets to **east/north metre vectors**.
- Those vectors are projected onto the tracked aircraft's **forward axis** (`sin θ, cos θ`) and **lateral axis** (`cos θ, -sin θ`) where `θ` is the tracked aircraft's heading.
- `forwardM > 0` = you are **ahead** of the tracked aircraft; `lateralM > 0` = you are to its **right**.
- Formation targets: `forwardM = ±escortDistMetres` (forward/back), `lateralM = ∓escortDistMetres` (left/right).

### PID Speed Controller

The speed PID uses error in NM (current distance component minus target distance component):

```
error    = currentComponent − targetComponent
integral += error × dt                          (anti-windup clamped ±200)
derivative = (error − prevError) / dt
output   = Kp×error + Ki×integral + Kd×derivative
newSpeed = currentSpeed + output
```

Default gains: `Kp = 8`, `Ki = 0.05`, `Kd = 3`.  Speed is clamped between 60 kt and 600 kt.

### Notes

- Chase/Escort is automatically cancelled when you stop tracking (**STOP TRACKING** button or clicking an empty radar area).
- The escort distance slider persists its value while tracking is active.
- Formation arrows only appear in Escort phase (after arriving within range).

---

## 🔒 Aircraft Tracker

Click any blip → open popup → **Track** to lock the HUD onto a specific aircraft regardless of distance.

When tracking is active:

- The HUD header changes from **NEARBY TRAFFIC** to **TRACKING** in amber.
- The tracked blip gets a glowing **yellow ring** on the radar.
- The HUD border and accent colors turn amber.
- An **Isolate aircraft** toggle appears in the HUD — when enabled, all other traffic disappears from the radar so you can focus solely on the tracked aircraft.
- A **Chase / Escort Player** toggle appears below Isolate — enables the chase/escort autopilot system (see 🔰 Chase / Escort Mode section above).
- A **✕ STOP TRACKING** button appears at the bottom of the HUD.

**To stop tracking:** click **STOP TRACKING**, click an empty area on the radar, or press **Alt+Z**.

Tracking persists across range changes and zoom levels. If the tracked aircraft leaves the API response (out of range or disconnected), the HUD gracefully falls back to the nearest aircraft.

<img width="192" height="235" alt="Screenshot 2026-03-04 213942" src="https://github.com/user-attachments/assets/f3128ebe-3df6-4a72-9bba-7a60d6d570dc" />

---

## 🛬 ILS Approach System

Click any runway on the radar to activate an ILS approach HUD for that runway.

<img width="1914" height="929" alt="ILS" src="https://github.com/user-attachments/assets/97c8da0d-251c-4120-b1cb-6242f996cff0" />
<img width="230" height="361" alt="image" src="https://github.com/user-attachments/assets/1cbb88ee-494a-426e-b3a5-9e821611f940" />

**HUD fields:**

| Field | Source | Description |
|-------|--------|-------------|
| **Localizer** | Geometry | Horizontal deviation from runway centreline (degrees) |
| **Glideslope** | Geometry | Vertical deviation from 3° glide path (feet) |
| **CDI** | Both | Cross-shaped instrument — horizontal needle = LOC, vertical needle = GS |
| **ALT AGL** | `animation.values.groundElevationFeet` | True altitude above the terrain |
| **Distance** | GPS | Distance to runway threshold (NM or km) |
| **Vert Speed** | `animation.values.verticalSpeed` | Vertical speed in ft/min |
| **Descent °** | `atan2(-VS, groundspeed)` | Actual descent angle in degrees |
| **Bank Angle** | `animationValue.roll` | Roll angle with arc indicator canvas |

The glideslope target is a standard **3° approach path**. CDI dots represent approximately 50% deflection per dot.

**To close ILS:** click the runway again, or click the **×** button on the ILS HUD.

All 7 ILS font sizes are independently adjustable via sliders in **🛬 ILS Display** settings.

---

## ⚠️ TCAS Warning System

A real-time collision detection system based on heading-vector intersection geometry.

<img width="169" height="269" alt="TCAS" src="https://github.com/user-attachments/assets/296433fb-fd94-4698-91de-24bb0db46dda" />

### How It Works

1. Your **30-second heading vector** is drawn as a line segment from your aircraft nose: `currentPosition → currentPosition + (speed × lookahead seconds)` in your heading direction.
2. Each traffic aircraft's **30-second heading vector** is computed the same way.
3. The algorithm finds the **closest point of approach (CPA)** between the two segments using parametric geometry — solving for the time fractions `s` (your path) and `t` (their path) that minimise the distance between the two trajectories.
4. A warning fires **only when all of these are true:**
   - CPA distance ≤ **Intersection Margin**
   - `|s − t|` ≤ time tolerance (both aircraft reach the crossing point at the same moment)
   - Both aircraft are above **Min Altitude (AGL)**
   - Altitude difference ≤ **±Altitude Band**
   - Both aircraft are moving (≥ 10 m/s)
   - The other aircraft's callsign does not match yours
   - The other aircraft is not filtered by "Hide Foo Players"

Your TCAS vector is shown on the radar as a dashed **amber** line from your nose. It turns **red** when a threat is active.

### Warning Display

- Full-screen flashing red **TRAFFIC** text at 50% opacity (400 ms flash cycle).
- Orange **callsign** of the conflicting aircraft.
- Yellow **COLLISION IN ~Xs** countdown based on the time-fraction of closest approach.
- Optional audio alert that cuts off immediately when the threat clears.

### TCAS Settings

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| **TCAS Warning** | On | toggle | Master enable/disable |
| **TCAS Audio** | On | toggle | Audio alert independent of visual |
| **Lookahead Time** | 30 s | 5–120 s | How far ahead to project each path |
| **Altitude Band** | ±200 ft | 50–2000 ft | Max altitude difference to consider a threat |
| **Min Altitude (AGL)** | 200 ft | 0–2000 ft | Both aircraft must exceed this height |
| **Intersection Margin** | 300 m | 50–2000 m | Path proximity threshold to trigger |
| **Audio Cooldown** | 10 s | 1–60 s | Minimum gap between audio replays |

---

## 🛩️ My Aircraft

- **Own callsign label** displayed below your triangle on the radar.
- **Flight trail** — a fading orange line showing your recent path.
  - Toggle on/off with **Show Trail**.
  - **Trail Length** slider: 5–300 seconds of history.
  - **Trail Thickness** slider: 1–8 px line width.

<img width="172" height="137" alt="My Aircraft" src="https://github.com/user-attachments/assets/7be82e9c-3aa4-4439-934b-af681d98fd48" />

---

## ⚙️ Radar Settings

<img width="176" height="228" alt="Radar Settings" src="https://github.com/user-attachments/assets/3224f9c9-f6c4-48b3-bd7a-8870c9af38fb" />

| Setting | Range | Description |
|---------|-------|-------------|
| **Radar Size** | 150–900 px | Physical size of the radar canvas |
| **Scroll Step** | 0.5–10 km | Range change per scroll wheel click |
| **Update Delay** | 50–1000 ms | API poll interval |
| **Radar Opacity** | 10–100% | Canvas transparency — persists across sessions |
| **Distance Unit** | km/m · NM | Radio selector for metric or nautical miles |
| **Range Bounds** | dual slider | Minimum and maximum allowed radar range |

---

## 🎨 Customization

<img width="169" height="298" alt="Customization" src="https://github.com/user-attachments/assets/e4a63a79-5e9b-480d-adb5-c73d4ae20fe4" />
<img width="174" height="184" alt="ILS Fonts" src="https://github.com/user-attachments/assets/418a66ca-6003-4384-857a-a6d56f77cc7c" />

| Group | Sliders |
|-------|---------|
| **Blips** | Dot size, triangle size, label font |
| **Player** | Triangle size, callsign font |
| **HUD** | Callsign font, data font, label font |
| **Compass / Rings** | Compass font, ring label font |
| **Popups** | Title font, body font |
| **Trail** | Line thickness (1–8 px) |
| **ILS HUD** | Header, label, value, pill label, pill value, footer, bank label (7 sliders) |

---

## Keyboard Shortcut

| Key | Action |
|-----|--------|
| **Alt+Z** | Toggle radar + all HUDs on/off |

---

## Settings Menu Reference

Open by clicking the **☰** button next to the radar.

| Section | Contents |
|---------|----------|
| 🖥️ **Display** | Night mode, player triangle, range rings, ring labels, orientation mode |
| ✈️ **Traffic** | Show traffic, triangles, callsigns, altitude, speed, distance, vectors, nearest HUD |
| 🔍 **Filters** | Hide Foo, hide ground, altitude range filter with dual-handle slider |
| 🗺️ **Map** | Airports & runways overlay |
| 🛩️ **My Aircraft** | Callsign display, trail on/off, trail length, trail thickness |
| ⚙️ **Radar Settings** | Size, scroll step, update delay, opacity, distance unit, range bounds |
| 📡 **API Status** | Live data source and connection status |
| 🎨 **Customization** | All size/font sliders, trail thickness, ILS font sizes |
| ⚠️ **TCAS** | Warning toggle, audio toggle, lookahead, alt band, min alt, margin, cooldown |

---

## Data Sources

<img width="170" height="48" alt="API" src="https://github.com/user-attachments/assets/98a6f2cd-ddbd-493b-8e9a-ce9673b44070" />

Own-aircraft data is read from `geofs.animation.values` — the same pre-computed values used by the GeoFS Information Display userscript — providing accurate altitude, vertical speed, IAS, ground speed, and ground elevation in real time.

Traffic data comes from the GeoFS multiplayer REST API, polled at the configured **Update Delay** interval.

---

## Changelog

### v11.00
- **Chase / Escort mode** added to the Nearest-Traffic HUD when tracking a player.
- Phase 1 (Chase): autopilot engages, heading set to bearing of target, PID speed controller closes the gap.
- Phase 2 (Escort): once within escort distance, heading matches target; 4 formation arrow buttons appear.
  - ◀ Left: parallel on the left wing — heading fine-tuned to maintain lateral offset.
  - ▶ Right: parallel on the right wing — heading fine-tuned to maintain lateral offset.
  - ▲ Forward: directly ahead along target's heading — PID speed to hold forward offset.
  - ▼ Back: directly behind along target's heading — PID speed to hold rearward offset.
- Escort distance slider (0.1–5.0 NM) shown in the HUD while chase is active.
- Relative position geometry uses lat/lon → flat-earth east/north projection onto target's heading frame.
- PID speed controller with anti-windup integral clamping; speed bounded 60–600 kt.
- Chase state reset automatically when tracking is stopped.

### v10.00
- ILS font sizes converted from hardcoded constants to live sliders (saved to `localStorage`).
- Radar opacity slider now persists correctly — pause detection no longer resets it to 100%.
- Trail color changed to orange; trail line thickness slider added.
- Dual-handle canvas range slider for radar min/max range (with green connecting line).
- Distance Unit changed to radio selector (km/m vs NM).
- Altitude filter added: dual-handle canvas slider, 0–60k ft.
- TCAS warning system with heading-vector intersection algorithm.
- TCAS overlay shows conflicting callsign and predicted collision countdown.
- TCAS audio stops immediately when threat clears.
- TCAS excludes aircraft with same callsign as player (anti-self-detection).
- TCAS respects "Hide Foo Players" filter.
- All TCAS parameters exposed as sliders; audio independently toggleable.
- ILS reads vertical speed and AGL from `geofs.animation.values` for accuracy.
- ILS descent angle uses `atan2(-VS, groundspeed)` for correctness.
- All menu sections have emoji labels.

### v9.00
- ILS approach system with CDI, glideslope, bank angle indicator.
- ILS runway selection by clicking on radar.

### v8.06
- Internal REST API source for multiplayer traffic.
- Aircraft tracking, nearest-traffic HUD, isolate mode.
- Night mode toggle.

---

## Author

**YK3D**
