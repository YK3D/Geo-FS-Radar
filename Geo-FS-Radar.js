// ==UserScript==
// @name         GeoFS Radar
// @namespace    http://tampermonkey.net/
// @version      8.00
// @description  On screen radar for GeoFS with menu, TCAS vectors, night mode, track-up, blip popups, nearest player HUD
// @author       Massiv4515 & YK3D
// @match        https://www.geo-fs.com/geofs.php?v=3.9
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

// ═══════════════════════════════════════════════════
// SECTION 1 — CONSTANTS & STATE
// ═══════════════════════════════════════════════════

const radarSize       = 450;
const MIN_RANGE       = 500;
const MAX_RANGE       = 40000;
const SCROLL_INC      = 500;
const AIRPORT_REFETCH = 30000;

// ═══════════════════════════════════════════════════
// SECTION 1b — UI CONFIGURATION
// Edit these values to customise sizes and line widths.
// All px values are in logical CSS/canvas pixels.
// ═══════════════════════════════════════════════════
const UI = {
    // ── Other-aircraft blip dots (when triangle off / no heading) ─
    blipDotR:            5,     // px  normal dot radius
    blipDotRActive:      8,     // px  dot radius when popup is active
    // ── Other-aircraft blip triangles ────────────────
    blipTriTip:          13,    // px  tip-to-centre (forward reach)
    blipTriBase:         7,     // px  half-base-width
    // ── Blip label tags ───────────────────────────────
    blipLabelFont:       13,    // px
    blipLabelRowH:       18,    // px  vertical spacing per label row
    blipLabelPadX:       4,     // px  horizontal padding inside tag bg
    // ── Range rings ───────────────────────────────────
    ringLineW:           6,     // px  stroke width
    ringLabelFont:       15,    // px
    // ── Compass ───────────────────────────────────────
    compassFont:         22,    // px  N / E / S / W letters
    compassHdgFont:      14,    // px  track-up HDG readout
    // ── Own-aircraft triangle ─────────────────────────
    playerTriTip:        15,    // px  tip distance from centre
    playerTriBase:       8,     // px  half-base-width
    playerTriBaseOff:    8,     // px  base offset from centre
    // ── Own-aircraft callsign tag ─────────────────────
    playerCsFont:        15,    // px
    playerDistFont:      14,    // px  nearest-distance label
    // ── Range box ─────────────────────────────────────
    rangeBoxW:           130,   // px
    rangeBoxH:           54,    // px
    rangeBoxFont:        20,    // px
    // ── Menu panel ────────────────────────────────────
    menuW:               280,   // px
    menuTitleFont:       15,    // px
    menuSectionFont:     11,    // px
    menuRowFont:         14,    // px  toggle / radio label
    menuRowPadY:         7,     // px  vertical padding per row
    menuSwitchW:         40,    // px
    menuSwitchH:         22,    // px
    menuKnobSize:        14,    // px
    menuRadioFont:       12,    // px
    menuInfoFont:        13,    // px
    // ── Popup ─────────────────────────────────────────
    popupTitleFont:      16,    // px
    popupBodyFont:       14,    // px
    // ── Velocity vectors ──────────────────────────────
    vectorLineW:         1.5,   // px
    // ── Misc ──────────────────────────────────────────
    pausedFont:          22,    // px
    gridLineW:           1,     // px  cross-hair grid lines
};

let radarRange   = parseInt(localStorage.getItem('radarRange') || '5000');
let isGamePaused = false;

// Last valid player position — used when geofs.aircraft.instance is temporarily unavailable
let _lastValidLat = null, _lastValidLon = null, _lastValidAltFt = 0;

// ── Settings (all togglable from menu) ──────────────
const settings = {
    showRings:          true,
    showRingLabels:     true,
    showVectors:        true,
    showAltitude:       true,
    showSpeed:          true,
    speedMode:          'GS',      // 'GS' or 'IAS'
    orientMode:         'north',   // 'north' or 'track'
    nightMode:          false,
    showAirports:       true,
    showCallsign:       true,
    showPlayerTriangle: true,
    showNearestHUD:     true,
    showDistLabel:      true,
    showTraffic:        true,      // show / hide all other aircraft blips
    showBlipTriangle:   true,      // true = directional triangle, false = dot
    showBlipDist:       true,      // show distance label under each blip
};

// Load saved settings
try {
    const saved = JSON.parse(localStorage.getItem('radarSettings') || '{}');
    Object.assign(settings, saved);
} catch(e) {}

// Force these on at startup
settings.showPlayerTriangle = true;
settings.showSpeed          = true;
settings.showAltitude       = true;
settings.showTraffic        = true;

function saveSettings() {
    localStorage.setItem('radarSettings', JSON.stringify(settings));
    localStorage.setItem('radarRange', String(radarRange));
    applyTheme();
}

// ── Colour theme ─────────────────────────────────────
const THEMES = {
    normal: {
        bg:          'rgba(0, 20, 0, 0.85)',
        ring:        'rgba(0, 255, 0, 0.22)',
        ringLabel:   'rgba(0, 255, 0, 0.7)',
        grid:        'rgba(0, 255, 0, 0.15)',
        compass:     'rgba(0, 255, 0, 0.75)',
        scanLine:    ['rgba(0,255,0,0.8)', 'rgba(0,255,0,0.3)'],
        trailColor:  (a) => `rgba(0,255,0,${a})`,
        playerFill:  'rgba(0, 255, 0, 0.9)',
        playerLabel: 'rgba(0, 255, 0, 0.9)',
        blipFill:    'rgba(255, 60, 60, 1)',
        blipGlow:    'rgba(255, 60, 60, 0.8)',
        blipLabel:   'rgba(255, 255, 255, 0.95)',
        blipAlt:     'rgba(0, 240, 255, 0.95)',
        blipSpeed:   'rgba(255, 220, 80, 0.95)',
        vector:      'rgba(255, 200, 50, 0.85)',
        canvasBorder:'rgba(255,255,255,0.3)',
        canvasGlow:  '0 0 15px rgba(0,255,0,0.5)',
        infoBox:     'rgba(0,0,0,0.7)',
        infoBorder:  'rgba(0,255,0,0.5)',
        infoText:    'rgba(0,255,0,0.9)',
        pauseText:   'rgba(255,255,0,0.8)',
        // Nearest HUD
        hudBg:       'rgba(0,12,0,0.92)',
        hudBorder:   'rgba(0,255,0,0.35)',
        hudTitle:    '#00ff88',
        hudLabel:    'rgba(0,200,0,0.7)',
        hudValue:    'rgba(200,255,200,0.95)',
        hudAlt:      'rgba(0,240,255,0.95)',
        hudSpeed:    'rgba(255,220,80,0.95)',
        hudDist:     'rgba(255,160,40,0.95)',
        hudHdg:      'rgba(180,255,180,0.9)',
        hudSep:      'rgba(0,255,0,0.12)',
    },
    night: {
        bg:          'rgba(10, 0, 0, 0.9)',
        ring:        'rgba(200, 40, 40, 0.2)',
        ringLabel:   'rgba(200, 50, 50, 0.7)',
        grid:        'rgba(180, 30, 30, 0.15)',
        compass:     'rgba(200, 50, 50, 0.75)',
        scanLine:    ['rgba(200,40,40,0.7)', 'rgba(180,30,30,0.2)'],
        trailColor:  (a) => `rgba(180,30,30,${a})`,
        playerFill:  'rgba(220, 80, 80, 0.9)',
        playerLabel: 'rgba(220, 80, 80, 0.9)',
        blipFill:    'rgba(255, 120, 60, 1)',
        blipGlow:    'rgba(255, 100, 50, 0.7)',
        blipLabel:   'rgba(255, 200, 180, 0.95)',
        blipAlt:     'rgba(255, 170, 100, 0.95)',
        blipSpeed:   'rgba(255, 220, 120, 0.95)',
        vector:      'rgba(255, 160, 60, 0.8)',
        canvasBorder:'rgba(180,50,50,0.4)',
        canvasGlow:  '0 0 12px rgba(180,30,30,0.5)',
        infoBox:     'rgba(20,0,0,0.8)',
        infoBorder:  'rgba(180,40,40,0.5)',
        infoText:    'rgba(200,80,80,0.9)',
        pauseText:   'rgba(255,200,50,0.8)',
        // Nearest HUD
        hudBg:       'rgba(20,5,0,0.94)',
        hudBorder:   'rgba(180,60,40,0.45)',
        hudTitle:    'rgba(255,140,80,0.95)',
        hudLabel:    'rgba(180,70,50,0.75)',
        hudValue:    'rgba(255,200,180,0.95)',
        hudAlt:      'rgba(255,170,100,0.95)',
        hudSpeed:    'rgba(255,220,100,0.95)',
        hudDist:     'rgba(255,130,60,0.95)',
        hudHdg:      'rgba(220,160,130,0.9)',
        hudSep:      'rgba(180,50,30,0.15)',
    }
};

function T() { return settings.nightMode ? THEMES.night : THEMES.normal; }

function applyTheme() {
    const t = T();
    radarCanvas.style.border     = `2px solid ${t.canvasBorder}`;
    radarCanvas.style.boxShadow  = t.canvasGlow;
    updateNearestHUD(null, null); // re-theme
}

// ═══════════════════════════════════════════════════
// SECTION 2 — CANVAS & BASIC DOM
// ═══════════════════════════════════════════════════

const radarCanvas = document.createElement('canvas');
radarCanvas.width  = radarSize;
radarCanvas.height = radarSize;
radarCanvas.style.cssText = `
    position:fixed; top:66%; left:5px;
    border-radius:50%;
    z-index:2147483647; cursor:move;
    border:2px solid rgba(255,255,255,0.3);
    box-shadow:0 0 15px rgba(0,255,0,0.5);
`;
document.body.appendChild(radarCanvas);
const ctx = radarCanvas.getContext('2d');

// ── Range display ────────────────────────────────────
const rangeBox = document.createElement('div');
rangeBox.id = 'radarRangeBox';
rangeBox.style.cssText = `
    position:fixed; width:${UI.rangeBoxW}px; height:${UI.rangeBoxH}px;
    background:rgba(0,40,0,0.82); border:1.5px solid rgba(0,255,0,0.6);
    border-radius:14px; box-shadow:0 0 12px rgba(0,255,0,0.35);
    z-index:2147483646; display:flex; flex-direction:column;
    align-items:center; justify-content:center; pointer-events:none;
`;
rangeBox.innerHTML = `
    <span id="rangeVal" style="color:#0f0;font:bold ${UI.rangeBoxFont}px Arial;text-shadow:0 0 5px rgba(0,255,0,0.6)">${(radarRange/1000).toFixed(1)} km</span>
    <span style="color:#0f0;font:11px Arial;opacity:.7;margin-top:2px">RANGE</span>
`;
document.body.appendChild(rangeBox);

function updateRangeBox() {
    const el = document.getElementById('rangeVal');
    if (el) el.textContent = `${(radarRange/1000).toFixed(1)} km`;
}

// ═══════════════════════════════════════════════════
// SECTION 3 — NEAREST PLAYER HUD
// ═══════════════════════════════════════════════════

const nearestHUD = document.createElement('div');
nearestHUD.id = 'radarNearestHUD';
nearestHUD.style.cssText = `
    position:fixed;
    z-index:2147483646;
    min-width:210px;
    border-radius:10px;
    padding:0;
    pointer-events:none;
    font-family:"Courier New",Courier,monospace;
    transition:opacity 0.3s;
    display:none;
`;
document.body.appendChild(nearestHUD);

// Compass direction from bearing degrees
function bearingCompass(deg) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

// Bearing from own position to target
function calcBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const r2   = lat2 * Math.PI / 180;
    const r1   = lat1 * Math.PI / 180;
    const y    = Math.sin(dLon) * Math.cos(r2);
    const x    = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Distance in NM between two lat/lon points
function calcDistNm(lat1, lon1, lat2, lon2) {
    const R    = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
               * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Format altitude: FL above 10000ft, else ft with commas. 0 is valid (on ground).
// Coerces strings to numbers since the API sometimes sends "123" instead of 123.
function fmtAlt(ft) {
    const v = parseFloat(ft);
    if (!isFinite(v)) return null;
    const n = Math.round(v);
    return n >= 10000
        ? `FL${Math.round(n / 100).toString().padStart(3, '0')}`
        : `${n.toLocaleString()} ft`;
}

// Format speed. 0 is valid (stationary).
// Coerces strings to numbers since the API sometimes sends "123" instead of 123.
function fmtSpd(kts) {
    const v = parseFloat(kts);
    if (!isFinite(v)) return null;
    return `${Math.round(v)} kt`;
}

// Format heading
function fmtHdg(deg) {
    if (deg == null) return 'N/A';
    return `${Math.round(((deg % 360) + 360) % 360).toString().padStart(3, '0')}° ${bearingCompass(deg)}`;
}

// Format distance in NM for HUD panel
function fmtDist(nm) {
    return nm < 10 ? `${nm.toFixed(1)} NM` : `${Math.round(nm)} NM`;
}

// Format distance in m/km for on-radar label beneath blip
// <1000m → "XXX m", >=1000m → "X.X km"
function fmtDistMetric(meters) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

let _hudNearestData = null; // last nearest ac data for redraw on theme change

function updateNearestHUD(nearest, myData) {
    const t = T();

    if (!settings.showNearestHUD || !nearest) {
        nearestHUD.style.display = 'none';
        _hudNearestData = null;
        return;
    }

    _hudNearestData = { nearest, myData };
    nearestHUD.style.display = 'block';

    const cs = nearest.cs || '???';

    // Distance and bearing from own aircraft to nearest
    let distStr = 'N/A', brgStr = 'N/A';
    if (myData && nearest.co) {
        const nm  = calcDistNm(myData.lat, myData.lon, nearest.co[0], nearest.co[1]);
        const brg = calcBearing(myData.lat, myData.lon, nearest.co[0], nearest.co[1]);
        distStr = fmtDist(nm);
        brgStr  = `${Math.round(brg).toString().padStart(3,'0')}° ${bearingCompass(brg)}`;
    }

    // Altitude delta vs own aircraft
    let altDeltaStr = '', altDeltaColor = t.hudValue;
    const nearAl = (() => {
        const v = parseFloat(nearest.al);
        if (isFinite(v)) return v;
        if (nearest.co && nearest.co.length >= 3) {
            const vCo = parseFloat(nearest.co[2]);
            if (isFinite(vCo)) return vCo * 3.28084;
        }
        return null;
    })();
    if (myData && nearAl !== null) {
        const delta = Math.round(nearAl - myData.altFt);
        const sign  = delta >= 0 ? '▲+' : '▼';
        altDeltaColor = delta > 0 ? 'rgba(100,255,140,0.9)' : 'rgba(255,120,120,0.9)';
        altDeltaStr = ` <span style="color:${altDeltaColor};font-size:12px">${sign}${Math.abs(delta).toLocaleString()} ft</span>`;
    }

    const altFmtd = (() => {
        const v = parseFloat(nearest.al);
        if (isFinite(v)) return fmtAlt(v);
        // fall back to altitude from coordinate array (metres → feet)
        if (nearest.co && nearest.co.length >= 3) {
            const vCo = parseFloat(nearest.co[2]);
            if (isFinite(vCo)) return fmtAlt(vCo * 3.28084);
        }
        return null;
    })();
    const altStr  = altFmtd !== null ? altFmtd : '–';
    // Speed: prefer API field, fall back to position-delta computed speed
    const nearSpdRaw = isFinite(parseFloat(nearest.s))
        ? parseFloat(nearest.s)
        : (typeof nearest._computedSpd === 'number' && isFinite(nearest._computedSpd) ? nearest._computedSpd : null);
    const spdStr  = nearSpdRaw !== null ? (fmtSpd(nearSpdRaw) ?? '–') : '–';
    const hdgStr  = fmtHdg(nearest.h);

    nearestHUD.innerHTML = `
<div style="
    background:${t.hudBg};
    border:1.5px solid ${t.hudBorder};
    border-radius:10px;
    overflow:hidden;
    box-shadow:0 4px 20px rgba(0,0,0,0.75);
">
  <div style="
    padding:9px 14px 7px;
    border-bottom:1px solid ${t.hudSep};
    display:flex;
    align-items:center;
    gap:8px;
  ">
    <span style="
      display:inline-block; width:10px; height:10px; border-radius:50%;
      background:${t.hudTitle}; box-shadow:0 0 6px ${t.hudTitle};
      flex-shrink:0;
    "></span>
    <span style="
      color:${t.hudTitle}; font-size:13px; letter-spacing:1.5px;
      text-transform:uppercase; font-weight:bold;
    ">NEAREST TRAFFIC</span>
  </div>

  <div style="
    padding:8px 14px 6px;
    border-bottom:1px solid ${t.hudSep};
  ">
    <div style="color:${t.hudLabel};font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Callsign</div>
    <div style="color:${t.hudValue};font-size:18px;font-weight:bold;letter-spacing:1px">${cs}</div>
  </div>

  <div style="padding:8px 14px 8px; display:grid; grid-template-columns:1fr 1fr; gap:8px 12px;">

    <div>
      <div style="color:${t.hudLabel};font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Distance</div>
      <div style="color:${t.hudDist};font-size:14px;font-weight:bold">${distStr}</div>
    </div>

    <div>
      <div style="color:${t.hudLabel};font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Bearing</div>
      <div style="color:${t.hudHdg};font-size:14px;font-weight:bold">${brgStr}</div>
    </div>

    <div>
      <div style="color:${t.hudLabel};font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Altitude</div>
      <div style="color:${t.hudAlt};font-size:14px;font-weight:bold">${altStr}${altDeltaStr}</div>
    </div>

    <div>
      <div style="color:${t.hudLabel};font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Speed (GS)</div>
      <div style="color:${t.hudSpeed};font-size:14px;font-weight:bold">${spdStr}</div>
    </div>

    <div style="grid-column:1/-1">
      <div style="color:${t.hudLabel};font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Heading</div>
      <div style="color:${t.hudHdg};font-size:14px;font-weight:bold">${hdgStr}</div>
    </div>

  </div>
</div>`;
}

function repositionNearestHUD() {
    const rl = parseInt(radarCanvas.style.left) || 5;
    const rt = parseInt(radarCanvas.style.top)  || 0;
    const hudW = 220;
    // Place to the right of the radar, aligned to top
    nearestHUD.style.left = (rl + radarSize + 12) + 'px';
    nearestHUD.style.top  = rt + 'px';
}

// ═══════════════════════════════════════════════════
// SECTION 4 — DRAGGING
// ═══════════════════════════════════════════════════

let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

radarCanvas.addEventListener('mousedown', startDrag);
radarCanvas.addEventListener('touchstart', startDragTouch, {passive:false});

function startDrag(e) {
    if (e.button === 2) return;
    isDragging = true;
    const r = radarCanvas.getBoundingClientRect();
    dragOffsetX = e.clientX - r.left;
    dragOffsetY = e.clientY - r.top;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    radarCanvas.style.cursor = 'grabbing';
    e.preventDefault();
}
function startDragTouch(e) {
    if (e.touches.length !== 1) return;
    isDragging = true;
    const r = radarCanvas.getBoundingClientRect();
    dragOffsetX = e.touches[0].clientX - r.left;
    dragOffsetY = e.touches[0].clientY - r.top;
    document.addEventListener('touchmove', onDragTouch, {passive:false});
    document.addEventListener('touchend', stopDrag);
    e.preventDefault();
}
function onDrag(e) {
    if (!isDragging) return;
    radarCanvas.style.left = (e.clientX - dragOffsetX) + 'px';
    radarCanvas.style.top  = (e.clientY - dragOffsetY) + 'px';
    repositionUI();
}
function onDragTouch(e) {
    if (!isDragging || e.touches.length !== 1) return;
    radarCanvas.style.left = (e.touches[0].clientX - dragOffsetX) + 'px';
    radarCanvas.style.top  = (e.touches[0].clientY - dragOffsetY) + 'px';
    repositionUI();
    e.preventDefault();
}
function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('touchmove', onDragTouch);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchend', stopDrag);
    radarCanvas.style.cursor = 'move';
    applyTheme();
    savePosition();
}
function savePosition() {
    localStorage.setItem('radarPos', JSON.stringify({
        left: radarCanvas.style.left, top: radarCanvas.style.top
    }));
}
function loadPosition() {
    try {
        const p = JSON.parse(localStorage.getItem('radarPos') || '{}');
        if (p.left) radarCanvas.style.left = p.left;
        if (p.top)  radarCanvas.style.top  = p.top;
    } catch(e) {}
    setTimeout(repositionUI, 120);
}

function repositionUI() {
    const rl = parseInt(radarCanvas.style.left) || 0;
    const rt = parseInt(radarCanvas.style.top)  || 0;
    const rb = document.getElementById('radarRangeBox');
    if (rb) {
        rb.style.left = (rl + radarSize/2 - 55) + 'px';
        rb.style.top  = (rt - 60) + 'px';
    }
    const mb = document.getElementById('radarMenuBtn');
    if (mb) {
        mb.style.left = (rl + radarSize - 16) + 'px';
        mb.style.top  = (rt - 16) + 'px';
    }
    const mp = document.getElementById('radarMenuPanel');
    if (mp) {
        mp.style.left = (rl + radarSize + 8) + 'px';
        mp.style.top  = (rt) + 'px';
    }
    repositionNearestHUD();
}

// ═══════════════════════════════════════════════════
// SECTION 5 — MENU
// ═══════════════════════════════════════════════════

let menuOpen = false;

function createMenu() {
    const btn = document.createElement('button');
    btn.id = 'radarMenuBtn';
    btn.title = 'Radar Settings';
    btn.innerHTML = '☰';
    btn.style.cssText = `
        position:fixed; width:40px; height:40px;
        background:rgba(0,60,0,0.92); color:#0f0;
        border:1.5px solid rgba(0,255,0,0.5); border-radius:50%;
        cursor:pointer; font-size:20px; font-weight:bold;
        z-index:2147483647; display:flex; align-items:center; justify-content:center;
        box-shadow:0 0 10px rgba(0,255,0,0.4); transition:all .2s;
    `;
    btn.onmouseover = () => btn.style.background = 'rgba(0,100,0,0.95)';
    btn.onmouseout  = () => btn.style.background = 'rgba(0,60,0,0.92)';
    btn.onclick = (e) => { e.stopPropagation(); toggleMenu(); };
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'radarMenuPanel';
    panel.style.cssText = `
        position:fixed; width:${UI.menuW}px;
        background:rgba(0,12,0,0.97);
        border:1.5px solid rgba(0,255,0,0.35);
        border-radius:12px; padding:12px 0 10px;
        z-index:2147483646; display:none;
        box-shadow:0 4px 28px rgba(0,0,0,0.75);
        font-family:Arial,sans-serif;
        user-select:none;
        max-height:90vh; overflow-y:auto;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
        color:rgba(0,255,0,0.9); font:bold ${UI.menuTitleFont}px Arial;
        text-align:center; padding:2px 14px 10px;
        border-bottom:1px solid rgba(0,255,0,0.18);
        margin-bottom:4px; letter-spacing:1.5px;
    `;
    title.textContent = 'RADAR SETTINGS';
    panel.appendChild(title);

    function addSection(label) {
        const s = document.createElement('div');
        s.style.cssText = `
            color:rgba(0,255,0,0.5); font:bold ${UI.menuSectionFont}px Arial;
            padding:8px 16px 3px; letter-spacing:1.5px; text-transform:uppercase;
        `;
        s.textContent = label;
        panel.appendChild(s);
    }

    function addToggle(label, key, onChange) {
        const row = document.createElement('div');
        row.style.cssText = `
            display:flex; align-items:center; justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px; cursor:pointer; transition:background .15s;
        `;
        row.onmouseover = () => row.style.background = 'rgba(0,255,0,0.07)';
        row.onmouseout  = () => row.style.background = '';

        const lbl = document.createElement('span');
        lbl.style.cssText = `color:rgba(200,255,200,0.9); font:${UI.menuRowFont}px Arial;`;
        lbl.textContent = label;

        const sw = document.createElement('div');
        sw.style.cssText = `
            width:${UI.menuSwitchW}px; height:${UI.menuSwitchH}px; border-radius:${UI.menuSwitchH/2}px; position:relative;
            background:${settings[key] ? 'rgba(0,200,0,0.75)' : 'rgba(80,80,80,0.5)'};
            border:1px solid rgba(0,255,0,0.3); transition:background .2s; flex-shrink:0;
        `;
        const knobOff = 3, knobOn = UI.menuSwitchW - UI.menuKnobSize - 3;
        const knob = document.createElement('div');
        knob.style.cssText = `
            position:absolute; top:${(UI.menuSwitchH - UI.menuKnobSize)/2}px;
            left:${settings[key] ? knobOn : knobOff}px;
            width:${UI.menuKnobSize}px; height:${UI.menuKnobSize}px; border-radius:50%;
            background:${settings[key] ? '#0f0' : '#888'};
            transition:left .2s, background .2s;
        `;
        sw.appendChild(knob);
        row.appendChild(lbl); row.appendChild(sw);

        row.onclick = () => {
            settings[key] = !settings[key];
            sw.style.background   = settings[key] ? 'rgba(0,200,0,0.75)' : 'rgba(80,80,80,0.5)';
            knob.style.left       = settings[key] ? knobOn + 'px' : knobOff + 'px';
            knob.style.background = settings[key] ? '#0f0' : '#888';
            saveSettings();
            if (onChange) onChange(settings[key]);
        };
        panel.appendChild(row);
        return row;
    }

    function addRadio(label, key, opt1, opt2, label1, label2) {
        const row = document.createElement('div');
        row.style.cssText = `
            display:flex; align-items:center; justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px;
        `;
        const lbl = document.createElement('span');
        lbl.style.cssText = `color:rgba(200,255,200,0.9); font:${UI.menuRowFont}px Arial; flex:1;`;
        lbl.textContent = label;

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:5px;';

        [opt1, opt2].forEach((opt, i) => {
            const b = document.createElement('button');
            b.id = `radarRadio_${key}_${opt}`;
            b.textContent = [label1, label2][i];
            b.style.cssText = `
                padding:4px 10px; font:bold ${UI.menuRadioFont}px Arial; border-radius:5px; cursor:pointer;
                border:1px solid rgba(0,255,0,0.3); transition:all .15s;
                background:${settings[key]===opt ? 'rgba(0,180,0,0.5)' : 'rgba(0,40,0,0.5)'};
                color:${settings[key]===opt ? '#0f0' : 'rgba(150,200,150,0.7)'};
            `;
            b.onclick = () => {
                settings[key] = opt;
                [opt1, opt2].forEach(o => {
                    const el = document.getElementById(`radarRadio_${key}_${o}`);
                    if (!el) return;
                    el.style.background = settings[key]===o ? 'rgba(0,180,0,0.5)' : 'rgba(0,40,0,0.5)';
                    el.style.color      = settings[key]===o ? '#0f0' : 'rgba(150,200,150,0.7)';
                });
                saveSettings();
            };
            wrap.appendChild(b);
        });

        row.appendChild(lbl); row.appendChild(wrap);
        panel.appendChild(row);
    }

    function addSep() {
        const s = document.createElement('div');
        s.style.cssText = 'border-top:1px solid rgba(0,255,0,0.1); margin:4px 0;';
        panel.appendChild(s);
    }

    function addInfoRow(label, idSuffix) {
        const row = document.createElement('div');
        row.style.cssText = `
            display:flex; align-items:center; justify-content:space-between;
            padding:5px 16px;
        `;
        const lbl = document.createElement('span');
        lbl.style.cssText = `color:rgba(150,200,150,0.7); font:${UI.menuInfoFont}px Arial;`;
        lbl.textContent = label;
        const val = document.createElement('span');
        val.id = `radarInfo_${idSuffix}`;
        val.style.cssText = `color:rgba(0,255,0,0.9); font:bold ${UI.menuInfoFont}px "Courier New",monospace;`;
        val.textContent = '—';
        row.appendChild(lbl); row.appendChild(val);
        panel.appendChild(row);
    }

    addSection('Display');
    addToggle('Night Mode',           'nightMode',     () => applyTheme());
    addRadio ('Orientation',          'orientMode',    'north', 'track', 'N↑', 'TRK↑');
    addToggle('Player Triangle',      'showPlayerTriangle');
    addToggle('Range Rings',          'showRings');
    addToggle('Ring Labels',          'showRingLabels');

    addSep();

    addSection('Traffic');
    addToggle('Show Traffic',         'showTraffic');
    addToggle('Traffic Triangles',    'showBlipTriangle');
    addToggle('Callsign',             'showCallsign');
    addToggle('Altitude',             'showAltitude');
    addToggle('Speed',                'showSpeed');
    addToggle('Distance',             'showBlipDist');
    addRadio ('Speed Source',         'speedMode',    'GS', 'IAS', 'GS', 'IAS');
    addToggle('Heading Vectors',      'showVectors');
    addToggle('Nearest Player HUD',   'showNearestHUD', (v) => {
        if (!v) nearestHUD.style.display = 'none';
    });
    addToggle('Nearest Distance',     'showDistLabel');

    addSep();

    addSection('Map');
    addToggle('Airports & Runways',   'showAirports');

    addSep();

    // ── Auto callsign display (replaces reset button) ───────────────────
    addSection('My Aircraft');
    addInfoRow('Callsign', 'callsign');
    addInfoRow('Position', 'position');

    document.body.appendChild(panel);

    document.addEventListener('click', (e) => {
        if (menuOpen && !panel.contains(e.target) && e.target !== btn) {
            closeMenu();
        }
    });
}

// Update the auto-detected callsign readout in the menu
function updateMenuInfoCallsign(cs, lat, lon) {
    const csEl = document.getElementById('radarInfo_callsign');
    const posEl = document.getElementById('radarInfo_position');
    if (csEl) csEl.textContent = cs || '—';
    if (posEl && lat != null) {
        const latStr = Math.abs(lat).toFixed(3) + (lat >= 0 ? '°N' : '°S');
        const lonStr = Math.abs(lon).toFixed(3) + (lon >= 0 ? '°E' : '°W');
        posEl.textContent = `${latStr} ${lonStr}`;
    } else if (posEl) {
        posEl.textContent = '—';
    }
}

function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }
function openMenu() {
    menuOpen = true;
    const p = document.getElementById('radarMenuPanel');
    if (p) { p.style.display = 'block'; repositionUI(); }
}
function closeMenu() {
    menuOpen = false;
    const p = document.getElementById('radarMenuPanel');
    if (p) p.style.display = 'none';
}

// ═══════════════════════════════════════════════════
// SECTION 6 — BLIP POPUP (click on aircraft)
// ═══════════════════════════════════════════════════

let popup = null;
let lastBlipPositions = [];

function createPopupEl() {
    const p = document.createElement('div');
    p.id = 'radarPopup';
    p.style.cssText = `
        position:fixed; min-width:210px;
        background:rgba(0,12,0,0.97); border:1.5px solid rgba(0,255,0,0.5);
        border-radius:10px; padding:11px 15px;
        z-index:2147483647; pointer-events:none; display:none;
        font-family:"Courier New",Courier,monospace; font-size:${UI.popupBodyFont}px;
        box-shadow:0 3px 20px rgba(0,0,0,0.88);
    `;
    document.body.appendChild(p);
    return p;
}

function showPopup(ac, distance, screenX, screenY, myData) {
    if (!popup) popup = createPopupEl();

    const cs   = ac.cs || 'UNKNOWN';
    const dist = distance >= 1000
        ? (distance/1000).toFixed(1) + ' km'
        : Math.round(distance) + ' m';
    const hdg = ac.h != null ? fmtHdg(ac.h) : 'N/A';
    const _rawAlt = (() => {
        const v = parseFloat(ac.al);
        if (isFinite(v)) return v;
        if (ac.co && ac.co.length >= 3) {
            const vCo = parseFloat(ac.co[2]);
            if (isFinite(vCo)) return vCo * 3.28084;
        }
        return null;
    })();
    const altStr = _rawAlt !== null ? (fmtAlt(_rawAlt) ?? '–') : '–';
    const _rawSpd = isFinite(parseFloat(ac.s))
        ? parseFloat(ac.s)
        : (typeof ac._computedSpd === 'number' && isFinite(ac._computedSpd) ? ac._computedSpd : null);
    const spdStr = _rawSpd !== null ? (fmtSpd(_rawSpd) ?? '–') : '–';

    let brgStr = '—', nmStr = '—';
    if (myData && ac.co) {
        const nm  = calcDistNm(myData.lat, myData.lon, ac.co[0], ac.co[1]);
        const brg = calcBearing(myData.lat, myData.lon, ac.co[0], ac.co[1]);
        nmStr  = fmtDist(nm);
        brgStr = `${Math.round(brg).toString().padStart(3,'0')}° ${bearingCompass(brg)}`;
    }

    // Altitude delta
    let altDelta = '';
    const acAl = _rawAlt;
    if (myData && acAl !== null) {
        const d = Math.round(acAl - myData.altFt);
        const sign = d >= 0 ? '▲+' : '▼';
        const col  = d > 0 ? '#88ff88' : '#ff8888';
        altDelta = ` <span style="color:${col};font-size:${UI.popupBodyFont - 2}px">${sign}${Math.abs(d).toLocaleString()} ft</span>`;
    }

    popup.innerHTML = `
        <div style="color:#0f0;font-weight:bold;font-size:${UI.popupTitleFont}px;margin-bottom:7px;
             border-bottom:1px solid rgba(0,255,0,0.2);padding-bottom:5px;
             letter-spacing:1px">${cs}</div>
        <div style="display:grid;grid-template-columns:78px 1fr;gap:4px 10px;
             color:rgba(200,255,200,0.9);line-height:1.8;font-size:${UI.popupBodyFont}px">
            <span style="color:rgba(0,200,0,0.6)">Distance</span>
            <span style="color:rgba(255,160,40,0.95)">${nmStr}</span>
            <span style="color:rgba(0,200,0,0.6)">Bearing</span>
            <span style="color:rgba(180,255,180,0.9)">${brgStr}</span>
            <span style="color:rgba(0,200,0,0.6)">Altitude</span>
            <span style="color:rgba(0,240,255,0.95)">${altStr}${altDelta}</span>
            <span style="color:rgba(0,200,0,0.6)">Speed GS</span>
            <span style="color:rgba(255,220,80,0.95)">${spdStr}</span>
            <span style="color:rgba(0,200,0,0.6)">Heading</span>
            <span style="color:rgba(180,255,180,0.9)">${hdg}</span>
        </div>`;

    const rl = parseInt(radarCanvas.style.left) || 0;
    const rt = parseInt(radarCanvas.style.top)  || 0;
    let px = rl + screenX + 14;
    let py = rt + screenY - 20;
    if (px + 200 > window.innerWidth)  px = rl + screenX - 205;
    if (py + 160 > window.innerHeight) py = rt + screenY - 160;

    popup.style.left    = px + 'px';
    popup.style.top     = py + 'px';
    popup.style.display = 'block';
}

function hidePopup() {
    if (popup) popup.style.display = 'none';
}

let activePopupCs = null;

radarCanvas.addEventListener('click', (e) => {
    const rect = radarCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let closest = null, closestDist = 12;
    lastBlipPositions.forEach(b => {
        const d = Math.hypot(mx - b.x, my - b.y);
        if (d < closestDist) { closestDist = d; closest = b; }
    });

    if (closest) {
        if (activePopupCs === closest.ac.cs) {
            hidePopup();
            activePopupCs = null;
        } else {
            activePopupCs = closest.ac.cs;
            showPopup(closest.ac, closest.distance, closest.x, closest.y, closest.myData);
        }
    } else {
        hidePopup();
        activePopupCs = null;
    }
});

// ═══════════════════════════════════════════════════
// SECTION 7 — VISIBILITY TOGGLE (Alt+Z)
// ═══════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyZ') {
        const hide = radarCanvas.style.display !== 'none';
        const val  = hide ? 'none' : 'block';
        radarCanvas.style.display = val;
        const rb = document.getElementById('radarRangeBox');
        if (rb)  rb.style.display = hide ? 'none' : 'flex';
        const mb = document.getElementById('radarMenuBtn');
        if (mb)  mb.style.display = hide ? 'none' : 'flex';
        nearestHUD.style.display = (hide || !settings.showNearestHUD) ? 'none' : 'block';
        if (hide) { hidePopup(); closeMenu(); }
        localStorage.setItem('radarVisible', !hide);
    }
});
if (localStorage.getItem('radarVisible') === 'false') radarCanvas.style.display = 'none';

// ═══════════════════════════════════════════════════
// SECTION 8 — SCROLL WHEEL (range)
// ═══════════════════════════════════════════════════

radarCanvas.addEventListener('wheel', (e) => {
    e.preventDefault(); e.stopPropagation();
    radarRange = Math.max(MIN_RANGE, Math.min(MAX_RANGE,
        radarRange + (e.deltaY > 0 ? SCROLL_INC : -SCROLL_INC)));
    radarRange = Math.round(radarRange / 100) * 100;
    updateRangeBox();
    saveSettings();
}, { passive: false });

// ═══════════════════════════════════════════════════
// SECTION 9 — AUTO CALLSIGN DETECTION
// ═══════════════════════════════════════════════════
// No manual prompt or localStorage entry needed.
// We read callsign directly from geofs.aircraft.instance.callsign,
// with fallback to geofs.userRecord.callsign, every draw frame.
// The result is stored in window._radarMyCallsign for use in filtering.

function detectCallsign() {
    try {
        if (window.geofs) {
            // Primary: live aircraft callsign
            const fromAircraft = geofs.aircraft?.instance?.callsign;
            if (fromAircraft && fromAircraft !== 'Foo' && fromAircraft.length > 0) {
                window._radarMyCallsign = fromAircraft;
                return fromAircraft;
            }
            // Fallback: user record
            const fromRecord = geofs.userRecord?.callsign;
            if (fromRecord && fromRecord !== 'Foo' && fromRecord.length > 0) {
                window._radarMyCallsign = fromRecord;
                return fromRecord;
            }
            // Last resort: userRecord login name
            const fromLogin = geofs.userRecord?.login;
            if (fromLogin && fromLogin.length > 0) {
                window._radarMyCallsign = fromLogin;
                return fromLogin;
            }
        }
    } catch(e) {}
    return window._radarMyCallsign || null;
}

// ═══════════════════════════════════════════════════
// SECTION 10 — GAME PAUSE DETECTION
// ═══════════════════════════════════════════════════

setInterval(() => {
    try {
        if (window.geofs) {
            isGamePaused = geofs.gui?.pause ?? geofs.pause ?? false;
        }
        const t = T();
        radarCanvas.style.opacity    = isGamePaused ? '0.5' : '1';
        radarCanvas.style.boxShadow  = isGamePaused
            ? '0 0 10px rgba(255,220,0,0.4)'
            : t.canvasGlow;
    } catch(e) {}
}, 500);

// ═══════════════════════════════════════════════════
// SECTION 11 — AIRCRAFT CACHE
// ═══════════════════════════════════════════════════

let aircraftListCache = [];
// Stores { lat, lon, time } per aircraft key for computing ground speed from position deltas.
// The API field ac.s is frequently absent; this is the reliable fallback.
const prevAcData = new Map();

async function updateAircraftCache() {
    if (isGamePaused) return;
    try {
        const res   = await fetch('https://mps.geo-fs.com/map');
        const data  = await res.json();
        const now   = Date.now();
        const users = data.users || [];

        users.forEach(ac => {
            if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) return;
            // Use callsign as key; fall back to rounded position string for anonymous aircraft
            const id   = ac.cs || `${Math.round(ac.co[0]*1000)},${Math.round(ac.co[1]*1000)}`;
            const prev = prevAcData.get(id);
            if (prev) {
                const dt = (now - prev.time) / 1000; // elapsed seconds
                if (dt > 0.2 && dt <= 15) {
                    // Haversine displacement between snapshots → ground speed in knots
                    const dLat = (ac.co[0] - prev.lat) * Math.PI / 180;
                    const dLon = (ac.co[1] - prev.lon) * Math.PI / 180;
                    const R    = 6371000;
                    const a    = Math.sin(dLat/2)**2
                               + Math.cos(prev.lat * Math.PI/180)
                               * Math.cos(ac.co[0]  * Math.PI/180)
                               * Math.sin(dLon/2)**2;
                    const distM   = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    const speedKt = (distM / dt) / 0.514444; // m/s → knots
                    // Sanity cap: discard implausible values (>3000 kt ≈ Mach 4.5)
                    if (speedKt <= 3000) ac._computedSpd = speedKt;
                    else if (typeof prev._computedSpd === 'number') ac._computedSpd = prev._computedSpd;
                } else if (typeof prev._computedSpd === 'number') {
                    // Keep last good computed speed while dt window is outside range
                    ac._computedSpd = prev._computedSpd;
                }
            }
            // Store as number or omit entirely — never store null (isFinite(null)===true in JS)
            prevAcData.set(id, {
                lat: ac.co[0], lon: ac.co[1], time: now,
                ...(typeof ac._computedSpd === 'number' && { _computedSpd: ac._computedSpd }),
            });
        });

        aircraftListCache = users;
    } catch(e) {}
}
setInterval(updateAircraftCache, 1000);
updateAircraftCache();

// ═══════════════════════════════════════════════════
// SECTION 12 — AIRPORT / RUNWAY DATA
// ═══════════════════════════════════════════════════

let runwayCache  = [];
let airportCache = [];
let lastAirportFetch = 0;

function runwayEndpointsFromCenter(lat, lon, hdgDeg, lenM) {
    const R    = 6371000;
    const half = (lenM || 1800) / 2;
    const hRad = hdgDeg * Math.PI / 180;
    const dLat = ((half * Math.cos(hRad)) / R) * (180 / Math.PI);
    const dLon = ((half * Math.sin(hRad)) / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
    return { lat1: lat-dLat, lon1: lon-dLon, lat2: lat+dLat, lon2: lon+dLon };
}

async function fetchAirportData() {
    if (isGamePaused) return;
    try {
        function parseCSV(text) {
            const lines = text.trim().split('\n');
            function parseLine(line) {
                const f = []; let cur = '', q = false;
                for (let i = 0; i < line.length; i++) {
                    const c = line[i];
                    if (c === '"') { if (q && line[i+1]==='"') { cur+='"'; i++; } else q=!q; }
                    else if (c === ',' && !q) { f.push(cur.trim()); cur=''; }
                    else cur += c;
                }
                f.push(cur.trim()); return f;
            }
            const hdrs = parseLine(lines[0]);
            return lines.slice(1).map(l => {
                const flds = parseLine(l);
                const o = {};
                hdrs.forEach((h,i) => o[h] = flds[i]||'');
                return o;
            });
        }

        const [ar, rr] = await Promise.all([
            fetch('https://davidmegginson.github.io/ourairports-data/airports.csv'),
            fetch('https://davidmegginson.github.io/ourairports-data/runways.csv')
        ]);
        if (!ar.ok || !rr.ok) return;

        const [aCSV, rCSV] = await Promise.all([ar.text(), rr.text()]);
        const airportRows  = parseCSV(aCSV);
        const runwayRows   = parseCSV(rCSV);

        const rwByIdent = {};
        runwayRows.forEach(row => {
            const id   = row['airport_ident']; if (!id) return;
            const lat1 = parseFloat(row['le_latitude_deg']);
            const lon1 = parseFloat(row['le_longitude_deg']);
            const lat2 = parseFloat(row['he_latitude_deg']);
            const lon2 = parseFloat(row['he_longitude_deg']);
            const lenM = parseFloat(row['length_ft']) * 0.3048;
            const name = [row['le_ident'], row['he_ident']].filter(Boolean).join('/');
            if (!rwByIdent[id]) rwByIdent[id] = [];
            if (isFinite(lat1)&&isFinite(lon1)&&isFinite(lat2)&&isFinite(lon2)) {
                rwByIdent[id].push({ lat1,lon1,lat2,lon2, name, length: isFinite(lenM)?lenM:1800 });
            } else if (isFinite(lat1)&&isFinite(lon1)) {
                const hdg = parseFloat(row['le_heading_degT']);
                const len = isFinite(lenM) ? lenM : 1800;
                if (isFinite(hdg)) {
                    const R=6371000, hR=hdg*Math.PI/180;
                    rwByIdent[id].push({
                        lat1, lon1,
                        lat2: lat1 + ((len/R)*Math.cos(hR))*(180/Math.PI),
                        lon2: lon1 + ((len/R)*Math.sin(hR))*(180/Math.PI)/Math.cos(lat1*Math.PI/180),
                        name, length: len
                    });
                }
            }
        });

        runwayCache  = [];
        airportCache = [];
        airportRows.forEach(row => {
            const lat = parseFloat(row['latitude_deg']);
            const lon = parseFloat(row['longitude_deg']);
            if (!isFinite(lat)||!isFinite(lon)) return;
            const icao = row['ident'] || row['gps_code'] || 'UNKN';
            airportCache.push({ icao, name: row['name']||icao, lat, lon });
            const rwys = rwByIdent[row['ident']] || [];
            if (rwys.length === 0) {
                const ns = runwayEndpointsFromCenter(lat,lon,  0, 1800);
                const ew = runwayEndpointsFromCenter(lat,lon, 90, 1800);
                runwayCache.push({...ns, name:icao, length:1800, airport:icao, isPlaceholder:true});
                runwayCache.push({...ew, name:icao, length:1800, airport:icao, isPlaceholder:true});
            } else {
                rwys.forEach(r => runwayCache.push({...r, airport:icao}));
            }
        });
        lastAirportFetch = Date.now();
        drawAirportsAndRunways._cachedGroups = null; // force redraw with new data
        console.log(`OurAirports: ${airportCache.length} airports, ${runwayCache.length} runways`);
    } catch(e) { console.error('Airport fetch error:', e); }
}

setTimeout(fetchAirportData, 2000);
setInterval(fetchAirportData, 300000); // re-fetch every 5 minutes

// ═══════════════════════════════════════════════════
// SECTION 13 — COORDINATE HELPERS
// ═══════════════════════════════════════════════════

function latLonToMeters(lat1, lon1, lat2, lon2) {
    const R    = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    return [
        dLon * R * Math.cos(lat1 * Math.PI / 180),
        dLat * R
    ];
}

function worldToCanvas(dx, dy, cx, cy, rotRad) {
    const rx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
    const ry = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
    return [
        cx + (rx / radarRange) * (radarSize / 2),
        cy - (ry / radarRange) * (radarSize / 2)
    ];
}

// ═══════════════════════════════════════════════════
// SECTION 14 — SPIN LINE
// ═══════════════════════════════════════════════════

let spinAngle = 0;
const SPIN_SPEED = 0.05;

function drawSpinLine() {
    if (isGamePaused) return;
    const cx = radarSize/2, cy = radarSize/2;
    const R  = radarSize/2 - 10;
    const t  = T();

    spinAngle += SPIN_SPEED;
    if (spinAngle > Math.PI*2) spinAngle -= Math.PI*2;

    const ex = cx + Math.cos(spinAngle) * R;
    const ey = cy + Math.sin(spinAngle) * R;

    // Sweep arc (fading trail) — one path, no per-segment gradients
    const sweepStart = spinAngle - 1.1;
    const lg = ctx.createLinearGradient(cx, cy, ex, ey);
    lg.addColorStop(0, t.scanLine[0]);
    lg.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, sweepStart, spinAngle);
    ctx.closePath();
    ctx.fillStyle = t.trailColor(0.08);
    ctx.fill();

    // Scan line
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey);
    ctx.strokeStyle = t.scanLine[0]; ctx.lineWidth = 2; ctx.stroke();

    // Tip dot
    ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI*2);
    ctx.fillStyle = t.scanLine[0]; ctx.fill();
}

// ═══════════════════════════════════════════════════
// SECTION 15 — AIRPORT / RUNWAY DRAWING
// ═══════════════════════════════════════════════════

let _airportCache_lastLat  = null;
let _airportCache_lastLon  = null;
let _airportCache_lastRange = null;

function drawAirportsAndRunways(playerLat, playerLon, cx, cy, rotRad) {
    if (!settings.showAirports) return {runways:0, airports:0};
    // Skip rebuild if player moved < 50m and range unchanged
    const moved = _airportCache_lastLat === null
        || Math.abs(playerLat - _airportCache_lastLat) * 111000 > 50
        || Math.abs(playerLon - _airportCache_lastLon) * 111000 * Math.cos(playerLat * Math.PI/180) > 50
        || radarRange !== _airportCache_lastRange;
    if (moved) {
        _airportCache_lastLat   = playerLat;
        _airportCache_lastLon   = playerLon;
        _airportCache_lastRange = radarRange;
    }

    let _cachedGroups = drawAirportsAndRunways._cachedGroups || null;

    if (moved || !_cachedGroups) {
        const groups = {};
        const inRangeICAOs = new Set();
        airportCache.forEach(ap => {
            const [adx, ady] = latLonToMeters(playerLat, playerLon, ap.lat, ap.lon);
            if (Math.hypot(adx, ady) <= radarRange * 1.3) inRangeICAOs.add(ap.icao);
        });

        runwayCache.forEach(rwy => {
            if (!inRangeICAOs.has(rwy.airport)) return;
            const [dx1,dy1] = latLonToMeters(playerLat, playerLon, rwy.lat1, rwy.lon1);
            const [dx2,dy2] = latLonToMeters(playerLat, playerLon, rwy.lat2, rwy.lon2);
            const cDist = Math.hypot((dx1+dx2)/2, (dy1+dy2)/2);
            if (cDist > radarRange*1.2) return;
            const [x1,y1] = worldToCanvas(dx1,dy1,cx,cy,rotRad);
            const [x2,y2] = worldToCanvas(dx2,dy2,cx,cy,rotRad);
            if (Math.hypot(x1-cx,y1-cy) > radarSize/2 && Math.hypot(x2-cx,y2-cy) > radarSize/2) return;
            const icao = rwy.airport || 'UNKN';
            if (!groups[icao]) {
                const info = airportCache.find(a => a.icao === icao);
                groups[icao] = { runways:[], name: info?.name || icao, icao, dist: cDist };
            }
            if (cDist < groups[icao].dist) groups[icao].dist = cDist;
            groups[icao].runways.push({x1,y1,x2,y2, isPlaceholder: !!rwy.isPlaceholder});
        });

        Object.values(groups).forEach(g => {
            if (!g.runways.length) return;
            const pts = g.runways.flatMap(r => [{x:r.x1,y:r.y1},{x:r.x2,y:r.y2}]);
            const centX = pts.reduce((s,p)=>s+p.x,0)/pts.length;
            const centY = pts.reduce((s,p)=>s+p.y,0)/pts.length;
            const maxR  = Math.max(...pts.map(p=>Math.hypot(p.x-centX,p.y-centY)));
            g.centX = centX; g.centY = centY; g.circleR = Math.max(maxR+8, 14);
        });

        _cachedGroups = groups;
        drawAirportsAndRunways._cachedGroups = groups;
    }

    let nearbyRunways = 0;
    Object.values(_cachedGroups).forEach(g => {
        if (!g.centX) return;

        const name = g.dist < radarRange*0.5
            ? (g.name.length>22 ? g.name.slice(0,22)+'…' : g.name) : g.icao;

        const allPlaceholder = g.runways.length > 0 && g.runways.every(r => r.isPlaceholder);

        if (allPlaceholder) {
            ctx.beginPath(); ctx.arc(g.centX, g.centY, 5, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(50,150,255,0.9)'; ctx.fill();
            ctx.strokeStyle = 'rgba(150,210,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(50,150,255,0.8)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(g.centX, g.centY, g.circleR, 0, Math.PI*2); ctx.stroke();

            g.runways.forEach(r => {
                if (r.isPlaceholder) return;
                nearbyRunways++;
                ctx.beginPath(); ctx.moveTo(r.x1,r.y1); ctx.lineTo(r.x2,r.y2);
                ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 8; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(r.x1,r.y1); ctx.lineTo(r.x2,r.y2);
                ctx.strokeStyle = 'rgba(160,160,160,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
            });
        }

        const labelAnchorY = allPlaceholder
            ? (g.centY - 10)
            : (g.centY - g.circleR - 5);
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(name).width;
        ctx.fillStyle = 'rgba(0,18,50,0.78)';
        if (ctx.roundRect) ctx.roundRect(g.centX-tw/2-4, labelAnchorY-12, tw+8, 13, 3);
        else ctx.rect(g.centX-tw/2-4, labelAnchorY-12, tw+8, 13);
        ctx.fill();
        ctx.fillStyle = 'rgba(80,180,255,1)';
        ctx.fillText(name, g.centX, labelAnchorY-1);
    });

    return { runways: nearbyRunways, airports: Object.keys(_cachedGroups).length };
}

// ═══════════════════════════════════════════════════
// SECTION 16 — PLAYER TRIANGLE
// ═══════════════════════════════════════════════════

function drawPlayerTriangle(cx, cy, playerHeading, isGamePaused) {
    if (!settings.showPlayerTriangle) return;

    const angleRad = (settings.orientMode === 'north')
        ? (playerHeading * Math.PI / 180)
        : 0;

    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    ctx.setTransform(cos, sin, -sin, cos, cx, cy);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(0, -UI.playerTriTip);
    ctx.lineTo( UI.playerTriBase,  UI.playerTriBaseOff);
    ctx.lineTo(-UI.playerTriBase,  UI.playerTriBaseOff);
    ctx.closePath();

    ctx.fillStyle = isGamePaused ? 'rgba(150,150,150,0.9)' : 'rgba(0,255,0,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
}

// ═══════════════════════════════════════════════════
// SECTION 17 — MAIN DRAW
// ═══════════════════════════════════════════════════

// ── Per-frame throttle state ──────────────────────────────────
let _lastMenuInfoUpdate = 0;   // ms timestamp — update menu info once/sec
let _lastHudUpdate      = 0;   // ms timestamp — regenerate HUD HTML at most 2/sec
let _lastNearestCs      = null; // detect nearest-aircraft change for HUD throttle
let _cachedCallsign     = null; // detectCallsign result, refreshed once/sec

function drawRadar() {
    const t  = T();
    const cx = radarSize/2, cy = radarSize/2;

    ctx.clearRect(0, 0, radarSize, radarSize);
    ctx.beginPath();
    ctx.arc(cx, cy, radarSize/2, 0, Math.PI*2);
    ctx.fillStyle = t.bg;
    ctx.fill();

    // ── Own aircraft data — v5.00 approach ───────────────────────────
    let player = null, playerHeading = 0, playerCallsign = 'YOU';
    let playerLat = 0, playerLon = 0, playerAlt = 0, playerAltFt = 0;

    try {
        player = geofs.aircraft?.instance;
        if (player) {
            playerHeading  = player.animationValue?.heading360 || 0;
            playerCallsign = player.callsign || 'YOU';
            playerLat      = player.llaLocation[0];
            playerLon      = player.llaLocation[1];
            playerAlt      = player.llaLocation[2];
            playerAltFt    = geofs.animation?.values?.altitude || (playerAlt * 3.28084);
            // Mirror v5.00: persist callsign to window + localStorage on first read
            if (player.callsign && !window.playerCallsign) {
                window.playerCallsign = player.callsign;
                ['playerCallsign','callsign','geoFSRadarCallsign']
                    .forEach(k => localStorage.setItem(k, player.callsign));
            }
        }
    } catch(e) {}

    const displayCallsign = window.playerCallsign || playerCallsign;

    // Throttle menu info panel update to once per second
    const _now = Date.now();
    if (_now - _lastMenuInfoUpdate > 1000) {
        _lastMenuInfoUpdate = _now;
        _cachedCallsign = detectCallsign();
        updateMenuInfoCallsign(displayCallsign, player ? playerLat : null, player ? playerLon : null);
    }

    const hasPos = !!player;
    const myData = hasPos ? {
        lat: playerLat,
        lon: playerLon,
        altFt: playerAltFt,
    } : null;

    const rotRad = settings.orientMode === 'track'
        ? (playerHeading * Math.PI / 180)
        : 0;

    // ── Clip to circle ───────────────────────────
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy,radarSize/2,0,Math.PI*2); ctx.clip();

    // ── Grid lines ───────────────────────────────
    ctx.strokeStyle = t.grid; ctx.lineWidth = UI.gridLineW;
    ctx.beginPath();
    ctx.moveTo(cx,0); ctx.lineTo(cx,radarSize);
    ctx.moveTo(0,cy); ctx.lineTo(radarSize,cy);
    ctx.stroke();

    // ── Range rings ──────────────────────────────
    if (settings.showRings) {
        for (let i=1; i<=3; i++) {
            const rr = (radarSize/2) * (i/3);
            ctx.strokeStyle = t.ring; ctx.lineWidth = UI.ringLineW;
            ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();

            if (settings.showRingLabels) {
                const dist = radarRange * (i/3);
                const lbl  = dist >= 1000
                    ? (dist/1000).toFixed(dist%1000===0?0:1)+' km'
                    : Math.round(dist)+' m';
                ctx.font = `bold ${UI.ringLabelFont}px Arial`;
                const tw = ctx.measureText(lbl).width;
                const lx = cx + 8;
                const ly = cy - rr + 10;
                ctx.fillStyle = 'rgba(0,0,0,0.65)';
                ctx.fillRect(lx-4, ly-12, tw+8, 17);
                ctx.fillStyle    = t.ringLabel;
                ctx.textAlign    = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(lbl, lx, ly - 2);
            }
        }
    }

    // ── Compass ──────────────────────────────────
    {
        const dirs  = ['N','E','S','W'];
        const edgeR = radarSize/2 - 16;
        ctx.font         = `bold ${UI.compassFont}px Arial`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        dirs.forEach((d, i) => {
            const geoBearing  = i * 90;
            const screenAngle = settings.orientMode === 'track'
                ? (geoBearing - playerHeading) * Math.PI / 180
                : geoBearing * Math.PI / 180;

            const px = cx + Math.sin(screenAngle) * edgeR;
            const py = cy - Math.cos(screenAngle) * edgeR;

            ctx.fillStyle = d === 'N' ? 'rgba(255,80,80,0.95)' : t.compass;
            ctx.fillText(d, px, py);
        });

        if (settings.orientMode === 'track') {
            ctx.font      = `bold ${UI.compassHdgFont}px Arial`;
            ctx.fillStyle = 'rgba(180,180,180,0.55)';
            ctx.fillText(`HDG ${Math.round(playerHeading).toString().padStart(3,'0')}°`, cx, 30);
        }
    }

    // ── Spin line ────────────────────────────────
    if (!isGamePaused) drawSpinLine();

    // ── Airports & runways ───────────────────────
    if (!isGamePaused && hasPos) {
        drawAirportsAndRunways(playerLat, playerLon, cx, cy, rotRad);
    }

    // ── Other aircraft blips ─────────────────────
    lastBlipPositions = [];
    let nearestAc = null, nearestMeters = Infinity;
    let nearestDistForLabel = null; // distance in meters to nearest aircraft, for player label

    if (settings.showTraffic && !isGamePaused && aircraftListCache.length > 0 && player) {
        // v5.00 exact pattern: window.playerCallsign takes priority over live callsign
        const myCs = window.playerCallsign || playerCallsign;

        aircraftListCache.forEach(ac => {
            ctx.save();
            try {
                if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) return;

                // v5.00 exact filter: both sides lowercased
                if (ac.cs && myCs && ac.cs.toLowerCase() === myCs.toLowerCase()) return;

                const [dx, dy] = latLonToMeters(playerLat, playerLon, ac.co[0], ac.co[1]);
                const distM    = Math.hypot(dx, dy);
                if (distM > radarRange) return;

                const [rx, ry] = worldToCanvas(dx, dy, cx, cy, rotRad);
                if (Math.hypot(rx-cx, ry-cy) > radarSize/2) return;

                // Track nearest for the HUD
                if (distM < nearestMeters) {
                    nearestMeters = distM;
                    nearestDistForLabel = distM;
                    nearestAc = ac;
                }

                lastBlipPositions.push({ x:rx, y:ry, ac, distance:distM, myData });

                const isActive = (activePopupCs === ac.cs);

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur  = 0;
                ctx.setLineDash([]);

                const acH = parseFloat(ac.h);
                // Speed: prefer API field ac.s, fall back to position-delta computed speed.
                // NOTE: isFinite(null) === true in JS (null coerces to 0), so check typeof too.
                const _apiSpd  = parseFloat(ac.s);
                const _compSpd = typeof ac._computedSpd === 'number' ? ac._computedSpd : NaN;
                const acS = isFinite(_apiSpd) ? _apiSpd : (isFinite(_compSpd) ? _compSpd : NaN);

                // ── Velocity vector ──────────────────────────
                if (settings.showVectors && isFinite(acH) && isFinite(acS)) {
                    const speedMs = acS * 0.514444;
                    const vecLen  = Math.min((speedMs * 30) / radarRange * (radarSize / 2), radarSize/2);
                    const hRad    = (acH * Math.PI / 180) - rotRad;
                    const vx      = rx + Math.sin(hRad) * vecLen;
                    const vy      = ry - Math.cos(hRad) * vecLen;
                    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(vx, vy);
                    ctx.strokeStyle = T().vector; ctx.lineWidth = UI.vectorLineW;
                    ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
                }

                // ── Blip shape ───────────────────────────────
                const blipColor  = isActive ? '#fff' : T().blipFill;
                const blipStroke = 'rgba(255,255,255,0.7)';

                if (settings.showBlipTriangle && isFinite(acH)) {
                    // Directional isosceles triangle pointing in heading direction
                    const angle = (acH * Math.PI / 180) - rotRad;
                    const tip   = UI.blipTriTip, base = UI.blipTriBase;
                    ctx.save();
                    ctx.translate(rx, ry);
                    ctx.rotate(angle);
                    ctx.beginPath();
                    ctx.moveTo(0, -tip);           // nose (forward)
                    ctx.lineTo( base,  tip * 0.55); // rear-right
                    ctx.lineTo(-base,  tip * 0.55); // rear-left
                    ctx.closePath();
                    ctx.fillStyle   = blipColor;
                    ctx.fill();
                    ctx.strokeStyle = blipStroke;
                    ctx.lineWidth   = isActive ? 2 : 1.5;
                    ctx.stroke();
                    ctx.restore();
                } else {
                    // Fallback dot (no heading data, or triangle mode off)
                    const blipR = isActive ? UI.blipDotRActive : UI.blipDotR;
                    ctx.fillStyle = blipColor;
                    ctx.beginPath(); ctx.arc(rx, ry, blipR, 0, Math.PI*2); ctx.fill();
                    ctx.strokeStyle = blipStroke; ctx.lineWidth = 1; ctx.stroke();
                }

                // ── Labels ───────────────────────────────────
                const blipBottom = settings.showBlipTriangle && isFinite(acH)
                    ? ry + UI.blipTriTip + 4
                    : ry + (isActive ? UI.blipDotRActive : UI.blipDotR) + 4;
                let labelY = blipBottom;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';
                ctx.font = `bold ${UI.blipLabelFont}px Arial`; // set once, reused by all drawTag calls

                function drawTag(text, color, yOff) {
                    const tw   = ctx.measureText(text).width;
                    const padX = UI.blipLabelPadX;
                    const rowH = UI.blipLabelRowH;
                    ctx.fillStyle = 'rgba(0,0,0,0.72)';
                    ctx.fillRect(rx - tw/2 - padX, yOff, tw + padX*2, rowH - 1);
                    ctx.fillStyle = color;
                    ctx.fillText(text, rx, yOff + 2);
                    return yOff + rowH;
                }

                if (settings.showCallsign && ac.cs) {
                    labelY = drawTag(ac.cs.substring(0, 12), T().blipLabel, labelY);
                }

                // Altitude — prefer ac.al (ft), fallback to co[2] (metres → ft)
                const rawAlt = isFinite(parseFloat(ac.al))
                    ? parseFloat(ac.al)
                    : (ac.co.length >= 3 && isFinite(parseFloat(ac.co[2]))
                        ? parseFloat(ac.co[2]) * 3.28084
                        : null);
                const altFmt = rawAlt !== null ? fmtAlt(rawAlt) : null;
                if (settings.showAltitude && altFmt !== null) {
                    labelY = drawTag(altFmt, T().blipAlt, labelY);
                }

                // Speed
                const spdFmt = isFinite(acS) ? fmtSpd(acS) : null;
                if (settings.showSpeed && spdFmt !== null) {
                    labelY = drawTag(spdFmt, T().blipSpeed, labelY);
                }

                if (settings.showBlipDist) {
                    labelY = drawTag(fmtDistMetric(distM), T().blipLabel, labelY);
                }

            } catch(e) {
                // swallow per-blip errors
            } finally {
                ctx.restore();
            }
        });
    }

    ctx.restore(); // end circle clip

    // ── Player callsign + distance tag ───────────
    if (settings.showCallsign && displayCallsign) {
        const lbl = displayCallsign.substring(0, 12);
        ctx.font = `bold ${UI.playerCsFont}px Arial`;
        const tw = ctx.measureText(lbl).width;
        const ty = cy + UI.playerTriBaseOff + UI.playerTriTip + 13;
        ctx.fillStyle   = isGamePaused ? 'rgba(80,80,80,0.85)' : 'rgba(0,80,0,0.85)';
        ctx.strokeStyle = T().playerLabel; ctx.lineWidth = 1;
        ctx.fillRect(cx - tw/2 - 7, ty - 11, tw + 14, 22);
        ctx.strokeRect(cx - tw/2 - 7, ty - 11, tw + 14, 22);
        ctx.fillStyle   = T().playerLabel;
        ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, cx, ty);
    }

    // ── Nearest distance label below player ──────
    if (settings.showDistLabel && nearestDistForLabel !== null && !isGamePaused) {
        const distLbl = fmtDistMetric(nearestDistForLabel);
        ctx.font = `bold ${UI.playerDistFont}px Arial`;
        const tw2 = ctx.measureText(distLbl).width;
        const ty2  = cy + UI.playerTriBaseOff + UI.playerTriTip + 40;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(cx - tw2/2 - 6, ty2 - 11, tw2 + 12, 20);
        ctx.fillStyle   = T().hudDist;
        ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(distLbl, cx, ty2);
    }

    // ── Paused overlay ───────────────────────────
    if (isGamePaused) {
        ctx.fillStyle = T().pauseText;
        ctx.font = `bold ${UI.pausedFont}px Arial`; ctx.textAlign = 'center';
        ctx.fillText('PAUSED', cx, radarSize - 30);
    }

    // ── Player triangle — always on top ──────────
    drawPlayerTriangle(cx, cy, playerHeading, isGamePaused);

    // ── Update nearest player HUD ─────────────────
    if (!isGamePaused && nearestAc) {
        const _hudNow = Date.now();
        if (nearestAc.cs !== _lastNearestCs || _hudNow - _lastHudUpdate > 500) {
            _lastNearestCs  = nearestAc.cs;
            _lastHudUpdate  = _hudNow;
            updateNearestHUD(nearestAc, myData);
        }
    } else if (!nearestAc) {
        if (_lastNearestCs !== null) {
            _lastNearestCs = null;
            updateNearestHUD(null, null);
        }
    }
}

// ═══════════════════════════════════════════════════
// SECTION 18 — DRAW LOOP
// Single interval at ~8 fps — radar does not need 60fps.
// Removing requestAnimationFrame eliminates ~85% of CPU draw calls.
// ═══════════════════════════════════════════════════

setInterval(() => { if (!isDragging) drawRadar(); }, 120);
setInterval(repositionUI, 1000);

// ═══════════════════════════════════════════════════
// SECTION 19 — INIT
// ═══════════════════════════════════════════════════

setTimeout(() => {
    createMenu();
    loadPosition();
    applyTheme();
    repositionNearestHUD();
}, 300);
