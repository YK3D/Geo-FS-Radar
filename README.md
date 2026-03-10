# GeoFS-Radar
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
| 🔎 Callsign Search | Type a callsign to instantly track any online aircraft |
| 📊 Nearest-Traffic HUD | Live data card for the closest (or tracked) aircraft |
| 🛬 ILS Approach | Full ILS HUD with CDI, glideslope, VS, AGL, bank angle, approach profile diagram |
| ⚠️ TCAS Warning | Heading-vector intersection alarm with callsign + countdown |
| 🔰 Chase / Escort | Autopilot-driven chase and 4-way formation escort mode |
| 🎛️ Semi-Auto AP | Manual flying with computed HDG/ALT/SPD fed live to autopilot |
| 🗺️ Flight Plan | Active GeoFS waypoints overlaid on radar with customisable shapes |
| 🎨 Customization | Sliders for every font, size, and UI element |

<img width="50%" alt="Screenshot" src="https://github.com/user-attachments/assets/36224292-59d3-4c30-ad2a-f9e1ada94aef" /><img width="50%" alt="Screenshot" src="https://github.com/user-attachments/assets/e82842d5-7dc1-4d81-904b-472a3e0c7a28" />

---

## 🛩️ Live Radar

The radar is a circular canvas drawn in real time from live GeoFS multiplayer API data.

**What it shows:**
- Your aircraft in the centre as a green triangle pointing in your heading direction.
- All other online aircraft as color-coded triangles or dots with labels.
- A fading orange trail behind your aircraft showing your recent flight path.
- Range rings with distance labels and compass rose.
- Heading vector arrows for each aircraft (30-second projected path line).
- A dashed amber/red TCAS lookahead vector from your nose.
- Active GeoFS flight plan waypoints with connecting lines and ident labels.

**Interaction:**
- **Scroll wheel** — zoom range in/out.
- **Click a blip** — opens a popup with full details and a Track button.
- **Click a runway** — activates ILS approach guidance.
- **Alt+Z** — toggle visibility of radar and all HUDs.
- **Drag** — move the radar anywhere on screen.

**Orientation:** North-up or Track-up (configurable). **Range:** 0.5–50 km.

---

## ✈️ Traffic Overlays

Each aircraft on the radar can display callsign, altitude, speed, distance, a heading triangle, and a 30-second projected path vector. All labels are individually toggleable. Triangle size, dot size, label font, and vector weight are adjustable in **🎨 Customization**.

---

## 🔍 Traffic Filters

| Filter | Description |
|--------|-------------|
| **Hide "Foo" Players** | Hides callsign "Foo" aircraft; also excluded from TCAS |
| **Hide Ground Traffic** | Hides aircraft below 200 ft AGL |
| **Altitude Filter** | Dual-handle canvas slider: only show traffic between a min and max altitude (0–60,000 ft) |

---

## 🎯 Click-to-Inspect Popup

Click any aircraft blip to open a popup showing callsign, distance, bearing, altitude delta, speed, and heading. A **Track** button locks the HUD onto that aircraft.

---

## 🔎 Callsign Search Bar

A compact search bar sits at the top of the Nearest-Traffic HUD at all times. Type a callsign (partial matches supported) and press **Enter** or **Go** to instantly start tracking that aircraft. The input flashes red briefly if no match is found. The HUD will not rebuild while the input is focused, so you have uninterrupted time to type.

---

## 📊 Nearest-Traffic HUD

Floating data card showing the closest aircraft (or the currently tracked one): callsign, aircraft type name, distance, bearing, altitude delta, speed, heading. Updates every frame. Hidden when ILS is active.

---

## 🔒 Aircraft Tracker

Track a specific aircraft via blip-click → Track, or via the **Callsign Search Bar**. While tracking:

- HUD header shows **TRACKING** in amber; tracked blip gets a yellow glow ring.
- **Isolate** toggle hides all other traffic from the radar.
- **Semi Auto Chase/Escort** and **Auto Chase/Escort (Beta)** toggles appear.
- **✕ STOP TRACKING** button cancels tracking and resets all chase/semi state.

---

## 🔰 Auto Chase / Escort Mode *(Beta)*

Fully automatic intercept and formation flying using GeoFS autopilot. Autopilot and the GeoFS AP panel are engaged automatically on activation.

**Phase 1 — Chase:** autopilot heading is set to the bearing of the target; a PID controller adjusts speed to close the gap. The **Escort distance** slider (0.1–5.0 NM) sets the arrival radius.

**Phase 2 — Escort:** 4 formation buttons appear. Heading matches target. Select position:

| Button | Position |
|--------|----------|
| ▲ Forward | Directly ahead along target's heading |
| ▼ Back | Directly behind |
| ◀ Left | Parallel left wing |
| ▶ Right | Parallel right wing |

Additional modes: **Above** and **Below** for vertical formation. **Fine-tune nudge buttons** allow real-time positional adjustments. **Re-chase threshold** re-enters chase if the gap exceeds the escort distance. **Airbrake logic** deploys spoilers when overspeed relative to target. **Overshoot guard** reduces approach speed near the target.

### PID Speed Controller

```
error     = currentComponent − targetComponent
integral += error × dt          (anti-windup clamped ±200)
derivative = (error − prevError) / dt
output    = Kp×error + Ki×integral + Kd×derivative
```

Default gains: `Kp=8  Ki=0.05  Kd=3`. Adjustable via Dev Mode sliders in the menu.

---

## 🎛️ Semi-Auto Chase / Escort

You fly manually; the script feeds computed **HDG / ALT / SPD** autopilot targets every 250 ms based on the tracked aircraft's live data. Autopilot is engaged automatically. All values auto-reset 1 second after activation.

AP commands are only pushed when the computed value changes from the previous tick. If the tracked aircraft's heading, altitude, or speed changes, the AP is updated immediately.

### HDG Row

| Control | Behaviour |
|---------|-----------|
| **BRG** *(default)* | AP heading = bearing from you to tracked aircraft |
| **HDG** | AP heading = tracked aircraft's heading |
| **− / +** | Offset computed heading by ±1° |
| **↺** | Reset offset; unfix |
| **🔓 / 📌** | Fix heading at current value or resume live tracking |
| **Click value** | Opens inline number input; Enter sets as offset (not fixed) |

### ALT / SPD Rows

Same pattern: offset (±10 ft / ±10 kt), reset, fix/unfix, click-to-type. Typing a value sets it as an offset from the current live reading — the value stays live and tracks changes.

---

## 🛬 ILS Approach System

Click any runway on the radar to activate an ILS HUD.

### CDI Instrument

Cross-pointer: horizontal needle = localiser deviation, vertical needle = glideslope deviation. Colour-coded green/amber/red by dot count.

### Bank Angle Indicator

Analogue arc with needle, tick marks at 10°/20°/30°, L/R labels.

### Approach Profile Diagram

A fixed-height side-view canvas showing a live picture of your approach:

- **Aircraft image** (Plane.png) rotated to match your actual descent angle.
- **Runway** drawn at a fixed canvas height — it moves **upward** as you descend, reaching the aircraft belly at touchdown.
- **Runway shifts left/right** based on your lateral position relative to the centreline, with a perspective effect that grows as you get closer.
- **Vertical connector** line from the aircraft to the runway centre shows displacement.
- Runway is visible from **650 ft AGL** and below.
- **ANGLE** label: descent = negative, climb = positive. Colour-coded green/amber/red.

### Distance Calculation

Distance to the runway is measured via **haversine** directly from your GPS position to the runway threshold — not a flat-earth projection. This eliminates drift errors at oblique approach angles. The correct threshold (the one you are flying toward) is selected by comparing your heading against the runway's own heading, not the bearing from you to each end.

### Data Readouts

| Field | Description |
|-------|-------------|
| **Distance** | Distance to threshold (NM), positive = approaching |
| **Alt AGL** | Altitude above ground (ft) |
| **Vert Speed** | Vertical speed (fpm) |
| **Descent angle** | Actual descent angle (°) |
| **Bank** | Bank angle L/R (°) |
| **GS error** | Glideslope error (ft + ABOVE/BELOW/ON GS) |
| **LOC / GS dots** | Dot deviation for localiser and glideslope |

**To close ILS:** click the **×** button on the ILS HUD.

### ILS Customisation (menu)

- **ILS HUD Scale** slider (40–100%) — shrinks the whole HUD, applied instantly.
- Font size sliders for: header, label, value, pill label, pill value, footer, bank value.

---

## ⚠️ TCAS Warning System

Heading-vector intersection detection. Fires when CPA ≤ margin, timing coincides, altitude within band, both aircraft above min AGL, and different callsigns.

- Flashing **TRAFFIC** overlay + callsign + **COLLISION IN ~Xs** countdown.
- TCAS vector on radar: amber normally, red when threat is active.
- Audio alert cuts off immediately when threat clears.

| Setting | Default |
|---------|---------|
| Lookahead Time | 30 s |
| Altitude Band | ±200 ft |
| Min Altitude (AGL) | 200 ft |
| Intersection Margin | 300 m |
| Audio Cooldown | 10 s |

---

## 🗺️ Flight Plan Waypoint Overlay

Active GeoFS flight plan waypoints drawn on radar with connecting lines and ident labels. Customisable in the Map menu section:

| Setting | Range |
|---------|-------|
| Line Width | 0.5–5 px |
| Dot Size | 2–14 px |
| Label Size | 6–18 px |
| Shape | Star, circle-full, circle-empty, square, star4, star5 |

---

## 🛩️ My Aircraft

- Own callsign label displayed below your triangle.
- **Flight trail** — fading orange line, toggle on/off, trail length 5–300 s, thickness 1–8 px.

---

## ⚙️ Radar Settings

| Setting | Range |
|---------|-------|
| Radar Size | 150–900 px |
| Scroll Step | 0.5–10 km |
| Update Delay | 50–1000 ms |
| Radar Opacity | 10–100% |
| Distance Unit | km/m or NM |
| Range Bounds | dual slider |

---

## Keyboard Shortcut

| Key | Action |
|-----|--------|
| **Alt+Z** | Toggle radar + all HUDs |

---

## Settings Menu Reference

| Section | Contents |
|---------|----------|
| 🖥️ Display | Night mode, player triangle, rings, labels, orientation |
| ✈️ Traffic | Show traffic, triangles, callsigns, altitude, speed, distance, vectors, nearest HUD |
| 🔍 Filters | Hide Foo, hide ground, altitude range slider |
| 🗺️ Map | Airports & runways, waypoint customisation |
| 🛩️ My Aircraft | Callsign, trail on/off, trail length, trail thickness |
| ⚙️ Radar Settings | Size, scroll step, delay, opacity, unit, range bounds |
| 📡 API Status | Live data source indicator |
| 🎨 Customization | All size/font sliders, trail, ILS scale + fonts |
| ⚠️ TCAS | All TCAS parameters |
| 🎯 Tracking | Dev mode PID gain sliders |

---

## Changelog

### v8.48
- **Distance calculation rewrite** — distance to runway now uses haversine (direct GPS measurement) instead of flat-earth projection, eliminating drift errors at oblique angles.
- **Threshold selection fix** — the landing threshold is now selected by comparing runway heading against player heading (not bearing), correctly identifying which end the player is approaching.
- **LOC/GS now use corrected distance** — localiser and glideslope deviation calculations use the accurate signed distance.

### v8.47
- **Approach profile direction fix** — runway now moves upward as altitude decreases (previously moved down).
- **HUD height reduced** — profile canvas height reduced to 220 px.

### v8.46
- **Approach profile fixed height** — canvas is now a constant 300 px; runway travels within it rather than the canvas resizing dynamically.

### v8.45
- **Dead space eliminated** — canvas height was previously dynamic and caused large empty space below the runway; now tightly fitted.
- **Runway longer** — `rwyHalf` increased from 44→80 px.
- **Runway lateral shift** — runway moves left/right based on localiser deviation (`locErrDeg`), with a perspective-scaling factor that grows as distance to threshold decreases.
- `locErrDeg` and `distToThreshM` passed into `drawApproachProfile`.

### v8.44
- **Runway contact fix** — runway Y is now driven by `altAGL` (0 ft = flush under belly, 650 ft = near bottom of canvas), eliminating the large gap on the ground that was caused by using `gsErrFt` as the position driver.

### v8.43
- **Runway 250 px offset** — baseline runway position set to 250 px below aircraft centre at 650 ft AGL.
- **Callsign input rebuild guard** — HUD rebuild is now suppressed while any input inside the HUD is focused (was previously only guarding `input[type="number"]`).

### v8.42
- **Canvas height** increased to 620 px; runway baseline set at 500 px.
- **Distance to runway centre** — `distToThreshM` now measures to the runway centre point (subtracts half runway length from threshold distance).

### v8.41
- **Semi-Auto click-to-type** — Enter commits typed value as an offset (not fixed); no blur commit.
- **Tracked value change detection** — when tracked aircraft heading/altitude/speed changes, AP command cache is cleared and HUD is force-rebuilt immediately.
- No-fix-on-type: typing a value into HDG/ALT/SPD sets it as an offset from the current live base, keeping the value live.

### v8.40
- **Callsign search bar** embedded inside Nearest-Traffic HUD (no longer a floating external element — eliminates jitter).
- **AP panel** — reverted to v8.37 confirmed-working selector.
- **Rebuild guard** — HUD rebuild skips when any input is focused.

### v8.39
- **Callsign search bar** added above Nearest-Traffic HUD.
- **Semi-Auto BRG default**, auto-reset after 1 s, live reactivity, click-to-type.
- **ILS HUD Scale slider** (40–100%).

### v8.31–v8.38
- ILS Approach Profile Diagram (aircraft image, runway, angle label, rotation).
- Waypoint overlay and customisation menu.
- Bank angle inversion fix, HUD height clamping, semi-auto 250 ms tick.
- Aircraft name in HUD, drag-click suppression, runway click ILS fix.

### v11.00
- Chase / Escort mode (PID speed controller, 4-way formation).

### v10.00
- ILS font sliders, TCAS system, altitude filter, trail improvements.

### v9.00
- ILS approach system: CDI, glideslope, bank angle.

### v8.06
- REST API source, tracking, nearest HUD, isolate mode.

---

## Author

**YK3D**
