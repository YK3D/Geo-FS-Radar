// ==UserScript==
// @name         GeoFS Radar
// @namespace    http://tampermonkey.net/
// @version      8.04
// @description  
// @author       YK3D
// @match        https://www.geo-fs.com/geofs.php?v=3.9
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

// ═══════════════════════════════════════════════════
// SECTION 1 — RADAR CONSTANTS
// ═══════════════════════════════════════════════════

const radarSize  = 450;   // px — canvas width and height (circle diameter)
const MIN_RANGE  = 500;   // m  — minimum radar range (innermost zoom)
const MAX_RANGE  = 50000; // m  — maximum radar range (outermost zoom)
const SCROLL_INC = 500;   // m  — range change per scroll wheel tick

// ═══════════════════════════════════════════════════
// SECTION 1b — TIMING & INTERVALS
// All delays and poll rates live here so they are easy to tune.
// All values are in milliseconds unless noted otherwise.
// ═══════════════════════════════════════════════════

// ── Multiplayer map fetch (mps.geo-fs.com/map) ────────────────────────────
// Fetching too fast triggers HTTP 429 (Too Many Requests).
// The scheduler uses exponential backoff: on each 429 the delay is doubled
// up to FETCH_DELAY_MAX, then recovers toward FETCH_DELAY_BASE on success.
const FETCH_DELAY_BASE    =  250; // ms — normal poll interval
const FETCH_DELAY_MAX     =  2000; // ms — longest back-off delay after repeated 429s
const FETCH_DELAY_INITIAL =   500; // ms — delay before the very first fetch after page load
// Speed-delta window: position snapshots outside this range are discarded when
// computing ground speed from successive positions (avoids bad readings on
// teleport / first-seen aircraft).
const FETCH_SPEED_DT_MIN  =   0.5; // seconds — ignore snapshots closer than this
const FETCH_SPEED_DT_MAX  =  30;   // seconds — ignore snapshots further apart than this

// ── Airport / runway data (ourairports-data CDN) ──────────────────────────
const AIRPORT_FETCH_INITIAL  =  2000; // ms — delay before the first airport fetch
const AIRPORT_REFETCH        = 300000; // ms — how often to re-fetch airport data (5 min)

// ── Draw loop ─────────────────────────────────────────────────────────────
// Radar does not need 60 fps. 120 ms ≈ 8 fps is smooth enough for ATC-style
// display while using ~85 % less CPU than requestAnimationFrame.
const DRAW_INTERVAL          =   120; // ms — main radar canvas redraw interval

// ── Pause / game-state poll ───────────────────────────────────────────────
const PAUSE_POLL_INTERVAL    =   500; // ms — how often to check geofs.gui.pause

// ── UI reposition poll ────────────────────────────────────────────────────
// Repositions the range box, menu button, and nearest HUD relative to the
// radar canvas. Runs on a slow timer as a safety net (drag handles the rest).
const REPOSITION_INTERVAL    =  1000; // ms

// ── In-frame throttles ────────────────────────────────────────────────────
// These limit how often expensive DOM operations run inside the draw loop.
const MENU_INFO_UPDATE_INTERVAL =  1000; // ms — callsign / position readout in menu
const HUD_UPDATE_INTERVAL       =   500; // ms — nearest-aircraft HUD panel HTML rebuild

// ── Radar initialisation delay ────────────────────────────────────────────
// Gives the GeoFS page time to finish its own setup before the radar reads
// geofs.aircraft, creates the menu, and positions the UI.
const INIT_DELAY             =   300; // ms — setTimeout before createMenu / loadPosition

// ── Drag: reposition safety timeout ──────────────────────────────────────
const DRAG_REPOSITION_DELAY  =   120; // ms — setTimeout(repositionUI) after loadPosition

// ── Scan-line animation ───────────────────────────────────────────────────
// Angle (radians) added to the sweep line on every draw frame.
// At DRAW_INTERVAL = 120 ms this gives one full rotation every ~2.5 s.
// Increase for a faster sweep; decrease for a slower one.
const SPIN_SPEED             =  0.1; // rad per frame

// ═══════════════════════════════════════════════════
// SECTION 1c — UI CONFIGURATION
// All sizes are logical CSS / canvas pixels.
// Edit these values to customise the look without touching drawing code.
// ═══════════════════════════════════════════════════
const UI = {

    // ── Other-aircraft blip — dot mode ───────────────────────────────────
    // Used when 'Traffic Triangles' is disabled or the aircraft has no heading.
    blipDotR:            5,   // px — radius of a normal blip dot
    blipDotRActive:      8,   // px — radius when a popup is open on that blip

    // ── Other-aircraft blip — triangle mode ──────────────────────────────
    // A directional isosceles triangle pointing in the aircraft's heading.
    blipTriTip:          11,  // px — distance from centre to the nose (forward point)
    blipTriBase:         6,   // px — half-width of the rear base of the triangle

    // ── Blip label tags (callsign / altitude / speed / distance rows) ─────
    blipLabelFont:       11,  // px — font size for all blip label text
    blipLabelRowH:       18,  // px — vertical height allocated per label row
    blipLabelPadX:       4,   // px — horizontal padding inside each label background

    // ── Range rings ───────────────────────────────────────────────────────
    // Three concentric circles drawn at 1/3, 2/3 and 3/3 of radarRange.
    ringLineW:           6,   // px — stroke width of each ring
    ringLabelFont:       15,  // px — font size for the distance label on each ring

    // ── Compass cardinal letters (N / E / S / W) ──────────────────────────
    compassFont:         22,  // px — size of the N / E / S / W letters on the rim
    compassHdgFont:      14,  // px — size of the 'HDG 045°' readout in track-up mode

    // ── Own-aircraft triangle ─────────────────────────────────────────────
    // Always drawn at the canvas centre, points in the aircraft's heading.
    playerTriTip:        15,  // px — distance from centre to the nose
    playerTriBase:       8,   // px — half-width of the rear base
    playerTriBaseOff:    8,   // px — how far the base sits behind centre

    // ── Own-aircraft labels ───────────────────────────────────────────────
    playerCsFont:        15,  // px — font size for the own-callsign tag below the triangle
    playerDistFont:      14,  // px — font size for the nearest-aircraft distance label

    // ── Range display box ─────────────────────────────────────────────────
    // Floating pill above the radar showing current range (e.g. "5.0 km").
    rangeBoxW:           130, // px — width of the range box
    rangeBoxH:           54,  // px — height of the range box
    rangeBoxFont:        20,  // px — font size for the range value

    // ── Settings menu panel ───────────────────────────────────────────────
    menuW:               280, // px — width of the slide-out settings panel
    menuTitleFont:       15,  // px — 'RADAR SETTINGS' header text
    menuSectionFont:     11,  // px — section divider labels (DISPLAY, TRAFFIC, …)
    menuRowFont:         14,  // px — toggle / radio button row labels
    menuRowPadY:         7,   // px — top + bottom padding for each menu row
    menuSwitchW:         40,  // px — width  of a toggle switch track
    menuSwitchH:         22,  // px — height of a toggle switch track
    menuKnobSize:        14,  // px — diameter of the toggle switch knob
    menuRadioFont:       12,  // px — font size for radio button pair labels (GS / IAS, N↑ / TRK↑)
    menuInfoFont:        13,  // px — font size for read-only info rows (callsign, position, API status)

    // ── Click-to-inspect popup ────────────────────────────────────────────
    // Appears when you click a blip; shows callsign, distance, bearing, alt, speed, heading.
    popupTitleFont:      16,  // px — callsign line at the top of the popup
    popupBodyFont:       14,  // px — data rows inside the popup

    // ── TCAS velocity vectors ─────────────────────────────────────────────
    // Dashed lines projecting from each blip in its heading direction,
    // scaled to represent ~30 s of travel at current ground speed.
    vectorLineW:         1.5, // px — stroke width of the velocity vector line

    // ── Miscellaneous ─────────────────────────────────────────────────────
    pausedFont:          22,  // px — 'PAUSED' overlay text when the game is paused
    gridLineW:           1,   // px — cross-hair grid lines through the canvas centre
};

let radarRange   = parseInt(localStorage.getItem('radarRange') || '5000');
let isGamePaused = false;

// ─────────────────────────────────────────────────────────────────────────────
// FIX #1 — Last-valid player position fallback
// These are now ACTUALLY written every frame (previously declared but never set)
// and used as a fallback when geofs.aircraft.instance is temporarily null.
// Without this, playerLat/playerLon default to 0,0 → every aircraft is thousands
// of km away → range check filters them all out → no blips appear.
// ─────────────────────────────────────────────────────────────────────────────
let _lastValidLat   = null;
let _lastValidLon   = null;
let _lastValidAltFt = 0;

// ── Settings ─────────────────────────────────────────
const settings = {
    showRings:          true,
    showRingLabels:     true,
    showVectors:        true,
    showAltitude:       true,
    showSpeed:          true,
    speedMode:          'GS',
    orientMode:         'north',
    nightMode:          false,
    showAirports:       true,
    // Traffic (other aircraft) display controls
    showCallsign:       true,   // show OTHER players' callsigns on blips
    showAircraftName:   true,   // show OTHER players' aircraft type on blips
    showPlayerTriangle: true,
    showNearestHUD:     true,   // show the Tracking / Nearby Traffic HUD panel
    showTraffic:        true,
    showBlipTriangle:   true,
    showBlipDist:       true,
    // My Aircraft display controls (canvas labels on own triangle)
    showMyCallsign:     true,   // show own callsign tag on canvas
    showMyAircraftType: true,   // show own aircraft type tag on canvas
    // Tracking behaviour
    isolateTracked:     false,  // when tracking, hide all blips except the tracked one
};

try {
    const saved = JSON.parse(localStorage.getItem('radarSettings') || '{}');
    Object.assign(settings, saved);
} catch(e) {}

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
        bg:            'rgba(0, 20, 0, 0.85)',
        ring:          'rgba(0, 255, 0, 0.22)',
        ringLabel:     'rgba(0, 255, 0, 0.7)',
        grid:          'rgba(0, 255, 0, 0.15)',
        compass:       'rgba(0, 255, 0, 0.75)',
        scanLine:      ['rgba(0,255,0,0.8)', 'rgba(0,255,0,0.3)'],
        trailColor:    (a) => `rgba(0,255,0,${a})`,
        playerFill:    'rgba(0, 255, 0, 0.9)',
        playerLabel:   'rgba(0, 255, 0, 0.9)',
        blipFill:      'rgba(255, 60, 60, 1)',
        blipGlow:      'rgba(255, 60, 60, 0.8)',
        blipLabel:     'rgba(255, 255, 255, 0.95)',
        blipAlt:       'rgba(0, 240, 255, 0.95)',
        blipSpeed:     'rgba(255, 220, 80, 0.95)',
        vector:        'rgba(255, 200, 50, 0.85)',
        canvasBorder:  'rgba(255,255,255,0.3)',
        canvasGlow:    '0 0 15px rgba(0,255,0,0.5)',
        infoBox:       'rgba(0,0,0,0.7)',
        infoBorder:    'rgba(0,255,0,0.5)',
        infoText:      'rgba(0,255,0,0.9)',
        pauseText:     'rgba(255,255,0,0.8)',
        hudBg:         'rgba(0,12,0,0.92)',
        hudBorder:     'rgba(0,255,0,0.35)',
        hudTitle:      '#00ff88',
        hudLabel:      'rgba(0,200,0,0.7)',
        hudValue:      'rgba(200,255,200,0.95)',
        hudAlt:        'rgba(0,240,255,0.95)',
        hudSpeed:      'rgba(255,220,80,0.95)',
        hudDist:       'rgba(255,160,40,0.95)',
        hudHdg:        'rgba(180,255,180,0.9)',
        hudSep:        'rgba(0,255,0,0.12)',
        // Menu chrome
        menuBg:        'rgba(0,12,0,0.97)',
        menuBorder:    'rgba(0,255,0,0.35)',
        menuTitle:     'rgba(0,255,0,0.9)',
        menuSection:   'rgba(0,255,0,0.5)',
        menuRow:       'rgba(200,255,200,0.9)',
        menuRowHover:  'rgba(0,255,0,0.07)',
        menuSep:       'rgba(0,255,0,0.1)',
        menuInfo:      'rgba(150,200,150,0.7)',
        menuInfoVal:   'rgba(0,255,0,0.9)',
        menuStatus:    'rgba(0,200,0,0.8)',
        menuScrollbar: 'rgba(0,200,0,0.4) rgba(0,30,0,0.5)',
        switchOn:      'rgba(0,200,0,0.75)',
        switchOff:     'rgba(80,80,80,0.5)',
        switchBorder:  'rgba(0,255,0,0.3)',
        knobOn:        '#0f0',
        knobOff:       '#888',
        radioBtnOn:    'rgba(0,180,0,0.5)',
        radioBtnOff:   'rgba(0,40,0,0.5)',
        radioTextOn:   '#0f0',
        radioTextOff:  'rgba(150,200,150,0.7)',
        radioBorder:   'rgba(0,255,0,0.3)',
        // Range box
        rangeBoxBg:    'rgba(0,40,0,0.82)',
        rangeBoxBorder:'rgba(0,255,0,0.6)',
        rangeBoxGlow:  '0 0 12px rgba(0,255,0,0.35)',
        rangeVal:      '#0f0',
        rangeValGlow:  '0 0 5px rgba(0,255,0,0.6)',
        rangeLabel:    'rgba(0,255,0,0.7)',
        // Menu button
        menuBtnBg:     'rgba(0,60,0,0.92)',
        menuBtnBgHov:  'rgba(0,100,0,0.95)',
        menuBtnColor:  '#0f0',
        menuBtnBorder: 'rgba(0,255,0,0.5)',
        menuBtnGlow:   '0 0 10px rgba(0,255,0,0.4)',
    },
    night: {
        bg:            'rgba(15, 0, 0, 0.93)',
        ring:          'rgba(255, 40, 40, 0.35)',
        ringLabel:     'rgba(255, 80, 80, 0.85)',
        grid:          'rgba(220, 30, 30, 0.25)',
        compass:       'rgba(255, 70, 70, 0.9)',
        scanLine:      ['rgba(255,50,50,0.9)', 'rgba(200,30,30,0.3)'],
        trailColor:    (a) => `rgba(220,40,40,${a})`,
        playerFill:    'rgba(255, 90, 90, 0.95)',
        playerLabel:   'rgba(255, 90, 90, 0.95)',
        blipFill:      'rgba(255, 140, 60, 1)',
        blipGlow:      'rgba(255, 80, 40, 0.9)',
        blipLabel:     'rgba(255, 210, 200, 0.98)',
        blipAlt:       'rgba(255, 180, 110, 0.98)',
        blipSpeed:     'rgba(255, 230, 130, 0.98)',
        vector:        'rgba(255, 170, 70, 0.9)',
        canvasBorder:  'rgba(255, 60, 60, 0.75)',
        canvasGlow:    '0 0 28px rgba(255,30,30,0.85), 0 0 8px rgba(255,60,60,0.6)',
        infoBox:       'rgba(25,0,0,0.88)',
        infoBorder:    'rgba(220,50,50,0.65)',
        infoText:      'rgba(255,100,100,0.95)',
        pauseText:     'rgba(255,210,60,0.9)',
        hudBg:         'rgba(22,4,0,0.96)',
        hudBorder:     'rgba(220,60,40,0.65)',
        hudTitle:      'rgba(255,150,90,0.98)',
        hudLabel:      'rgba(200,80,60,0.85)',
        hudValue:      'rgba(255,210,195,0.98)',
        hudAlt:        'rgba(255,180,110,0.98)',
        hudSpeed:      'rgba(255,230,110,0.98)',
        hudDist:       'rgba(255,140,70,0.98)',
        hudHdg:        'rgba(235,170,145,0.95)',
        hudSep:        'rgba(200,50,30,0.22)',
        // Menu chrome
        menuBg:        'rgba(22,4,0,0.97)',
        menuBorder:    'rgba(220,60,40,0.55)',
        menuTitle:     'rgba(255,120,80,0.95)',
        menuSection:   'rgba(200,80,50,0.65)',
        menuRow:       'rgba(255,200,180,0.9)',
        menuRowHover:  'rgba(255,60,30,0.08)',
        menuSep:       'rgba(200,50,30,0.2)',
        menuInfo:      'rgba(180,100,70,0.75)',
        menuInfoVal:   'rgba(255,160,100,0.95)',
        menuStatus:    'rgba(220,120,80,0.85)',
        menuScrollbar: 'rgba(200,60,40,0.5) rgba(30,5,0,0.6)',
        switchOn:      'rgba(200,60,30,0.8)',
        switchOff:     'rgba(80,40,30,0.55)',
        switchBorder:  'rgba(220,80,50,0.4)',
        knobOn:        'rgba(255,140,80,1)',
        knobOff:       'rgba(120,70,50,1)',
        radioBtnOn:    'rgba(180,50,20,0.6)',
        radioBtnOff:   'rgba(40,10,0,0.6)',
        radioTextOn:   'rgba(255,160,80,1)',
        radioTextOff:  'rgba(160,90,60,0.8)',
        radioBorder:   'rgba(200,70,40,0.4)',
        // Range box
        rangeBoxBg:    'rgba(30,5,0,0.88)',
        rangeBoxBorder:'rgba(220,60,40,0.7)',
        rangeBoxGlow:  '0 0 14px rgba(220,40,20,0.5)',
        rangeVal:      'rgba(255,140,80,1)',
        rangeValGlow:  '0 0 6px rgba(220,60,20,0.7)',
        rangeLabel:    'rgba(200,90,60,0.8)',
        // Menu button
        menuBtnBg:     'rgba(40,8,0,0.92)',
        menuBtnBgHov:  'rgba(70,15,0,0.95)',
        menuBtnColor:  'rgba(255,120,70,1)',
        menuBtnBorder: 'rgba(220,70,40,0.6)',
        menuBtnGlow:   '0 0 12px rgba(200,40,20,0.5)',
    }
};

function T() { return settings.nightMode ? THEMES.night : THEMES.normal; }

function applyTheme() {
    const t = T();

    // ── Canvas border / glow ────────────────────────────────────────────
    radarCanvas.style.border    = `2px solid ${t.canvasBorder}`;
    radarCanvas.style.boxShadow = t.canvasGlow;

    // ── Range box ───────────────────────────────────────────────────────
    const rb = document.getElementById('radarRangeBox');
    if (rb) {
        rb.style.background = t.rangeBoxBg;
        rb.style.border     = `1.5px solid ${t.rangeBoxBorder}`;
        rb.style.boxShadow  = t.rangeBoxGlow;
        const rv = document.getElementById('rangeVal');
        if (rv) {
            rv.style.color      = t.rangeVal;
            rv.style.textShadow = t.rangeValGlow;
        }
        const rl = rb.querySelector('span:last-child');
        if (rl && rl.id !== 'rangeVal') rl.style.color = t.rangeLabel;
    }

    // ── Menu button ─────────────────────────────────────────────────────
    const mb = document.getElementById('radarMenuBtn');
    if (mb) {
        mb.style.background = t.menuBtnBg;
        mb.style.color      = t.menuBtnColor;
        mb.style.border     = `1.5px solid ${t.menuBtnBorder}`;
        mb.style.boxShadow  = t.menuBtnGlow;
        mb.onmouseover = () => mb.style.background = t.menuBtnBgHov;
        mb.onmouseout  = () => mb.style.background = t.menuBtnBg;
    }

    // ── Settings panel ──────────────────────────────────────────────────
    const mp = document.getElementById('radarMenuPanel');
    if (mp) {
        mp.style.background    = t.menuBg;
        mp.style.border        = `1.5px solid ${t.menuBorder}`;
        mp.style.scrollbarColor = t.menuScrollbar;

        // Title
        const titleEl = mp.querySelector('[data-menu-title]');
        if (titleEl) {
            titleEl.style.color       = t.menuTitle;
            titleEl.style.borderColor = t.menuSep;
        }

        // Section headers
        mp.querySelectorAll('[data-menu-section]').forEach(el => {
            el.style.color = t.menuSection;
        });

        // Separator lines
        mp.querySelectorAll('[data-menu-sep]').forEach(el => {
            el.style.borderTopColor = t.menuSep;
        });

        // Toggle rows
        mp.querySelectorAll('[data-menu-row]').forEach(el => {
            el.style.color = t.menuRow;
            el.onmouseover = () => el.style.background = t.menuRowHover;
            el.onmouseout  = () => el.style.background = '';
            const lbl = el.querySelector('[data-menu-rowlbl]');
            if (lbl) lbl.style.color = t.menuRow;
            const sw = el.querySelector('[data-menu-sw]');
            const kn = el.querySelector('[data-menu-knob]');
            const key = el.dataset.menuRow;
            if (sw && kn && key) {
                const on = !!settings[key];
                sw.style.background = on ? t.switchOn : t.switchOff;
                sw.style.borderColor = t.switchBorder;
                kn.style.background = on ? t.knobOn : t.knobOff;
            }
        });

        // Radio buttons
        mp.querySelectorAll('[data-radio-key]').forEach(el => {
            const key = el.dataset.radioKey;
            const opt = el.dataset.radioOpt;
            const on  = settings[key] === opt;
            el.style.background = on ? t.radioBtnOn : t.radioBtnOff;
            el.style.color      = on ? t.radioTextOn : t.radioTextOff;
            el.style.borderColor = t.radioBorder;
        });

        // Info rows
        mp.querySelectorAll('[data-menu-infolbl]').forEach(el => {
            el.style.color = t.menuInfo;
        });
        mp.querySelectorAll('[data-menu-infoval]').forEach(el => {
            el.style.color = t.menuInfoVal;
        });

        // Status row
        const statusEl = document.getElementById('radarInfo_apistatus');
        // Only reset if it was already OK-coloured; error colour stays until next update
        if (statusEl && statusEl.dataset.statusOk === 'true') {
            statusEl.style.color = t.menuStatus;
        }
    }

    // ── HUD ─────────────────────────────────────────────────────────────
    // Force a full HUD rebuild so all inline colours update
    updateNearestHUD(_hudNearestData?.nearest ?? null, _hudNearestData?.myData ?? null);
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
    <span id="rangeVal" style="font:bold ${UI.rangeBoxFont}px Arial;text-shadow:0 0 5px rgba(0,255,0,0.6)">${(radarRange/1000).toFixed(1)} km</span>
    <span style="font:11px Arial;opacity:.8;margin-top:2px">RANGE</span>
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

function bearingCompass(deg) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

function calcBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const r2   = lat2 * Math.PI / 180;
    const r1   = lat1 * Math.PI / 180;
    const y    = Math.sin(dLon) * Math.cos(r2);
    const x    = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function calcDistNm(lat1, lon1, lat2, lon2) {
    const R    = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
               * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtAlt(ft) {
    const v = parseFloat(ft);
    if (!isFinite(v)) return null;
    const n = Math.round(v);
    return n >= 10000
        ? `FL${Math.round(n / 100).toString().padStart(3, '0')}`
        : `${n.toLocaleString()} ft`;
}

function fmtSpd(kts) {
    const v = parseFloat(kts);
    if (!isFinite(v)) return null;
    return `${Math.round(v)} kt`;
}

function fmtHdg(deg) {
    if (deg == null) return 'N/A';
    return `${Math.round(((deg % 360) + 360) % 360).toString().padStart(3, '0')}° ${bearingCompass(deg)}`;
}

function fmtDist(nm) {
    return nm < 10 ? `${nm.toFixed(1)} NM` : `${Math.round(nm)} NM`;
}

function fmtDistMetric(meters) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

let _hudNearestData = null;
let _trackedAc      = null;  // non-null when user has locked onto a specific aircraft
let _trackedId      = null;  // session id of tracked aircraft (unique, unlike callsign)

// Stop tracking and return to nearest-aircraft mode.
function stopTracking() {
    _trackedAc     = null;
    _trackedId     = null;
    activePopupCs  = null;
    _lastNearestCs = null; // force HUD to rebuild next frame
}

// Look up a fresh copy of the tracked aircraft from the live cache by session id.
// Falls back to the stale cached object if the aircraft is temporarily missing.
function refreshTracked() {
    if (!_trackedId) return null;
    const fresh = aircraftListCache.find(a => a.id === _trackedId);
    if (fresh) _trackedAc = fresh;
    return _trackedAc;
}

// Shared helper: compute distance + bearing string pair from myData → target ac
function _hudDistBrg(myData, ac) {
    if (!myData || !ac.co) return { distStr: 'N/A', brgStr: 'N/A' };
    const nm  = calcDistNm(myData.lat, myData.lon, ac.co[0], ac.co[1]);
    const brg = calcBearing(myData.lat, myData.lon, ac.co[0], ac.co[1]);
    return {
        distStr: fmtDist(nm),
        brgStr:  `${Math.round(brg).toString().padStart(3,'0')}° ${bearingCompass(brg)}`,
    };
}

function updateNearestHUD(nearest, myData) {
    const t = T();

    // Determine which aircraft to display: tracked takes priority over nearest
    const displayAc  = _trackedAc || nearest;
    const isTracking = !!_trackedAc;

    if (!settings.showNearestHUD || !displayAc) {
        nearestHUD.style.display = 'none';
        _hudNearestData = null;
        return;
    }

    _hudNearestData = { nearest: displayAc, myData };
    nearestHUD.style.display    = 'block';
    // Pointer events must be on when tracking so the buttons are clickable
    nearestHUD.style.pointerEvents = isTracking ? 'auto' : 'none';

    const cs  = displayAc.cs && displayAc.cs !== 'Foo' ? displayAc.cs : `Foo #${displayAc.id || '???'}`;
    const acN = displayAc._shortName || null;

    const { distStr, brgStr } = _hudDistBrg(myData, displayAc);

    // Altitude
    const nearAl = (() => {
        const v = parseFloat(displayAc.al);
        if (isFinite(v)) return v;
        if (displayAc.co && displayAc.co.length >= 3) {
            const vCo = parseFloat(displayAc.co[2]);
            if (isFinite(vCo)) return vCo * 3.28084;
        }
        return null;
    })();
    let altDeltaStr = '';
    if (myData && nearAl !== null) {
        const delta = Math.round(nearAl - myData.altFt);
        const sign  = delta >= 0 ? '▲+' : '▼';
        const col   = delta > 0 ? 'rgba(100,255,140,0.9)' : 'rgba(255,120,120,0.9)';
        altDeltaStr = ` <span style="color:${col};font-size:12px">${sign}${Math.abs(delta).toLocaleString()} ft</span>`;
    }
    const altStr = nearAl !== null ? (fmtAlt(nearAl) ?? '–') : '–';

    // Speed
    const nearSpdRaw = isFinite(parseFloat(displayAc.s))
        ? parseFloat(displayAc.s)
        : (typeof displayAc._computedSpd === 'number' && isFinite(displayAc._computedSpd)
            ? displayAc._computedSpd : null);
    const spdStr = nearSpdRaw !== null ? (fmtSpd(nearSpdRaw) ?? '–') : '–';
    const hdgStr = fmtHdg(displayAc.h);

    // Tracking mode colours
    const trackBorder = isTracking ? 'rgba(255,200,60,0.55)' : t.hudBorder;
    const trackGlow   = isTracking ? ', 0 0 14px rgba(255,180,30,0.2)' : '';
    const headerDot   = isTracking ? 'rgba(255,200,60,1)'    : t.hudTitle;
    const headerLabel = isTracking ? 'TRACKING'              : 'NEARBY TRAFFIC';
    const headerColor = isTracking ? 'rgba(255,200,60,0.98)' : t.hudTitle;

    // Isolate toggle (only shown in tracking mode)
    const isolateChecked  = settings.isolateTracked;
    const isolateSwBg     = isolateChecked ? t.switchOn    : t.switchOff;
    const isolateKnobBg   = isolateChecked ? t.knobOn      : t.knobOff;
    const isolateKnobLeft = isolateChecked ? (UI.menuSwitchW - UI.menuKnobSize - 3) : 3;

    const isolateRow = isTracking ? `
  <div style="
    padding:5px 14px 6px;
    border-top:1px solid ${t.hudSep};
    display:flex; align-items:center; justify-content:space-between;
    cursor:pointer;
  " id="radarIsolateRow">
    <span style="color:${t.hudLabel};font-size:12px;letter-spacing:0.5px;">Isolate aircraft</span>
    <div id="radarIsolateSw" style="
      width:${UI.menuSwitchW}px; height:${UI.menuSwitchH}px;
      border-radius:${UI.menuSwitchH/2}px; position:relative;
      background:${isolateSwBg}; border:1px solid ${t.switchBorder};
      transition:background .2s; flex-shrink:0;
    ">
      <div id="radarIsolateKnob" style="
        position:absolute; top:${(UI.menuSwitchH-UI.menuKnobSize)/2}px;
        left:${isolateKnobLeft}px;
        width:${UI.menuKnobSize}px; height:${UI.menuKnobSize}px;
        border-radius:50%; background:${isolateKnobBg};
        transition:left .2s, background .2s;
      "></div>
    </div>
  </div>` : '';

    // Stop Tracking button
    const stopBtn = isTracking ? `
  <div style="padding:4px 14px 8px;">
    <button id="radarStopTrackBtn" style="
      width:100%; padding:6px 0;
      background:${t.hudBg}; border:1px solid ${t.hudBorder};
      border-radius:6px; color:${t.hudLabel};
      font:bold 12px Arial; letter-spacing:1px;
      cursor:pointer; transition:background .15s;
    ">✕  STOP TRACKING</button>
  </div>` : '';

    nearestHUD.innerHTML = `
<div style="
    background:${t.hudBg};
    border:1.5px solid ${trackBorder};
    border-radius:10px; overflow:hidden;
    box-shadow:0 4px 20px rgba(0,0,0,0.75)${trackGlow};
    font-family:'Courier New',Courier,monospace;
">
  <div style="padding:9px 14px 7px; border-bottom:1px solid ${t.hudSep};
    display:flex; align-items:center; gap:8px;">
    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
      background:${headerDot};box-shadow:0 0 6px ${headerDot};flex-shrink:0;"></span>
    <span style="color:${headerColor};font-size:13px;letter-spacing:1.5px;
      text-transform:uppercase;font-weight:bold;">${headerLabel}</span>
  </div>

  <div style="padding:8px 14px 6px;border-bottom:1px solid ${t.hudSep};">
    <div style="color:${t.hudLabel};font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Callsign</div>
    <div style="color:${t.hudValue};font-size:18px;font-weight:bold;letter-spacing:1px">${cs}${acN ? `<span style="color:${t.hudLabel};font-size:12px;font-weight:normal;margin-left:7px">${acN}</span>` : ''}</div>
  </div>

  <div style="padding:8px 14px 8px;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">
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
  ${isolateRow}
  ${stopBtn}
</div>`;

    // Wire isolate toggle
    const isolateRowEl = document.getElementById('radarIsolateRow');
    if (isolateRowEl) {
        isolateRowEl.onclick = (e) => {
            e.stopPropagation();
            settings.isolateTracked = !settings.isolateTracked;
            saveSettings();
            updateNearestHUD(_hudNearestData?.nearest ?? null, _hudNearestData?.myData ?? null);
        };
    }

    // Wire stop-tracking button
    const stopEl = document.getElementById('radarStopTrackBtn');
    if (stopEl) {
        stopEl.onmouseover = () => stopEl.style.background = T().hudBorder;
        stopEl.onmouseout  = () => stopEl.style.background = T().hudBg;
        stopEl.onclick     = (e) => { e.stopPropagation(); stopTracking(); };
    }
}

function repositionNearestHUD() {
    const rl = parseInt(radarCanvas.style.left) || 5;
    const rt = parseInt(radarCanvas.style.top)  || 0;
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
    setTimeout(repositionUI, DRAG_REPOSITION_DELAY);
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
        const panelH = mp.scrollHeight || 400;
        const rawTop = rt;
        const maxTop = window.innerHeight - Math.min(panelH, window.innerHeight - 24) - 12;
        mp.style.left = (rl + radarSize + 8) + 'px';
        mp.style.top  = Math.max(12, Math.min(rawTop, maxTop)) + 'px';
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
    btn.onmouseover = () => btn.style.background = T().menuBtnBgHov;
    btn.onmouseout  = () => btn.style.background = T().menuBtnBg;
    btn.onclick = (e) => {
        e.stopPropagation();
        toggleMenu();
    };
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
        height:600px;
        overflow-y:auto;
        overflow-x:hidden;
        scrollbar-width:thin;
        scrollbar-color:rgba(0,200,0,0.4) rgba(0,30,0,0.5);
    `;

    const title = document.createElement('div');
    title.dataset.menuTitle = '1';
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
        s.dataset.menuSection = '1';
        s.style.cssText = `
            color:rgba(0,255,0,0.5); font:bold ${UI.menuSectionFont}px Arial;
            padding:8px 16px 3px; letter-spacing:1.5px; text-transform:uppercase;
        `;
        s.textContent = label;
        panel.appendChild(s);
    }

    function addToggle(label, key, onChange) {
        const row = document.createElement('div');
        row.dataset.menuRow = key;
        row.style.cssText = `
            display:flex; align-items:center; justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px; cursor:pointer; transition:background .15s;
        `;
        row.onmouseover = () => row.style.background = T().menuRowHover;
        row.onmouseout  = () => row.style.background = '';

        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9); font:${UI.menuRowFont}px Arial;`;
        lbl.textContent = label;

        const sw = document.createElement('div');
        sw.dataset.menuSw = key;
        sw.style.cssText = `
            width:${UI.menuSwitchW}px; height:${UI.menuSwitchH}px;
            border-radius:${UI.menuSwitchH/2}px; position:relative;
            background:${settings[key] ? 'rgba(0,200,0,0.75)' : 'rgba(80,80,80,0.5)'};
            border:1px solid rgba(0,255,0,0.3); transition:background .2s; flex-shrink:0;
        `;
        const knobOff = 3, knobOn = UI.menuSwitchW - UI.menuKnobSize - 3;
        const knob = document.createElement('div');
        knob.dataset.menuKnob = key;
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
            const t = T();
            sw.style.background   = settings[key] ? t.switchOn  : t.switchOff;
            sw.style.borderColor  = t.switchBorder;
            knob.style.left       = settings[key] ? knobOn + 'px' : knobOff + 'px';
            knob.style.background = settings[key] ? t.knobOn : t.knobOff;
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
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9); font:${UI.menuRowFont}px Arial; flex:1;`;
        lbl.textContent = label;

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:5px;';

        [opt1, opt2].forEach((opt, i) => {
            const b = document.createElement('button');
            b.id = `radarRadio_${key}_${opt}`;
            b.dataset.radioKey = key;
            b.dataset.radioOpt = opt;
            b.textContent = [label1, label2][i];
            b.style.cssText = `
                padding:4px 10px; font:bold ${UI.menuRadioFont}px Arial;
                border-radius:5px; cursor:pointer;
                border:1px solid rgba(0,255,0,0.3); transition:all .15s;
                background:${settings[key]===opt ? 'rgba(0,180,0,0.5)' : 'rgba(0,40,0,0.5)'};
                color:${settings[key]===opt ? '#0f0' : 'rgba(150,200,150,0.7)'};
            `;
            b.onclick = () => {
                settings[key] = opt;
                const t = T();
                [opt1, opt2].forEach(o => {
                    const el = document.getElementById(`radarRadio_${key}_${o}`);
                    if (!el) return;
                    el.style.background  = settings[key]===o ? t.radioBtnOn  : t.radioBtnOff;
                    el.style.color       = settings[key]===o ? t.radioTextOn : t.radioTextOff;
                    el.style.borderColor = t.radioBorder;
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
        s.dataset.menuSep = '1';
        s.style.cssText = 'border-top:1px solid rgba(0,255,0,0.1); margin:4px 0;';
        panel.appendChild(s);
    }

    function addInfoRow(label, idSuffix) {
        const row = document.createElement('div');
        row.style.cssText = `display:flex; align-items:center; justify-content:space-between; padding:5px 16px;`;
        const lbl = document.createElement('span');
        lbl.dataset.menuInfolbl = '1';
        lbl.style.cssText = `color:rgba(150,200,150,0.7); font:${UI.menuInfoFont}px Arial;`;
        lbl.textContent = label;
        const val = document.createElement('span');
        val.id = `radarInfo_${idSuffix}`;
        val.dataset.menuInfoval = '1';
        val.style.cssText = `color:rgba(0,255,0,0.9); font:bold ${UI.menuInfoFont}px "Courier New",monospace; text-align:right; max-width:155px; word-break:break-all;`;
        val.textContent = '—';
        row.appendChild(lbl); row.appendChild(val);
        panel.appendChild(row);
    }

    function addStatusRow() {
        const row = document.createElement('div');
        row.style.cssText = `padding:5px 16px;`;
        const val = document.createElement('span');
        val.id = 'radarInfo_apistatus';
        val.dataset.statusOk = 'true';
        val.style.cssText = `color:rgba(0,200,0,0.8); font:${UI.menuInfoFont - 1}px "Courier New",monospace; word-break:break-all;`;
        val.textContent = 'Waiting for data…';
        row.appendChild(val);
        panel.appendChild(row);
    }

    // ── Display ──────────────────────────────────────────────────────────
    addSection('Display');
    addToggle('Night Mode',             'nightMode',        () => applyTheme());
    addRadio ('Orientation',            'orientMode',       'north', 'track', 'N↑', 'TRK↑');
    addToggle('Player Triangle',        'showPlayerTriangle');
    addToggle('Range Rings',            'showRings');
    addToggle('Ring Labels',            'showRingLabels');

    addSep();

    // ── Traffic ───────────────────────────────────────────────────────────
    addSection('Traffic');
    addToggle('Show Traffic',           'showTraffic');
    addToggle('Traffic Triangles',      'showBlipTriangle');
    addToggle('Callsign',               'showCallsign');   // other players only
    addToggle('Aircraft Type',          'showAircraftName'); // other players only
    addToggle('Altitude',               'showAltitude');
    addToggle('Speed',                  'showSpeed');
    addToggle('Distance',               'showBlipDist');
    addRadio ('Speed Source',           'speedMode',        'GS', 'IAS', 'GS', 'IAS');
    addToggle('Heading Vectors',        'showVectors');
    addToggle('Tracking / Nearby Traffic', 'showNearestHUD', (v) => {
        if (!v) nearestHUD.style.display = 'none';
    });

    addSep();

    // ── Map ───────────────────────────────────────────────────────────────
    addSection('Map');
    addToggle('Airports & Runways',     'showAirports');

    addSep();

    // ── My Aircraft ───────────────────────────────────────────────────────
    addSection('My Aircraft');
    addInfoRow('Callsign', 'callsign');
    addInfoRow('Aircraft', 'acname');
    addInfoRow('Position', 'position');
    addToggle('Show My Callsign',       'showMyCallsign');
    addToggle('Show My Aircraft Type',  'showMyAircraftType');

    addSep();

    // ── API Status ────────────────────────────────────────────────────────
    addSection('API Status');
    addStatusRow();

    document.body.appendChild(panel);

    // Remove the document click handler that auto-closes the menu
    // Only the menu button can close it now

    // Initial positioning
    repositionMenu();
}

function repositionMenu() {
    const btn = document.getElementById('radarMenuBtn');
    const panel = document.getElementById('radarMenuPanel');
    if (!btn || !panel) return;

    // Get radar position and dimensions
    const rl = parseInt(radarCanvas.style.left) || 5;
    const rt = parseInt(radarCanvas.style.top) || 0;
    const menuFullHeight = 600; // Full menu height
    const buttonSize = 40;
    const spacing = 5;
    const bottomMargin = 60; // 60px margin from bottom of screen

    // Calculate window dimensions
    const windowHeight = window.innerHeight;

    // Position button to the right of radar (aligned with top)
    btn.style.left = (rl + radarSize + spacing) + 'px';
    btn.style.top = rt + 'px';

    // Position panel with top fixed to button bottom
    const panelTop = rt + buttonSize + spacing;
    panel.style.top = panelTop + 'px';

    // Calculate maximum allowed height (stop 40px from bottom of screen)
    const maxAllowedHeight = windowHeight - panelTop - bottomMargin;

    // Set panel height - use full height if within limits, otherwise cap at maxAllowedHeight
    const panelHeight = Math.min(menuFullHeight, maxAllowedHeight);
    panel.style.height = panelHeight + 'px';

    // Position panel horizontally (aligned with button)
    panel.style.left = (rl + radarSize + spacing) + 'px';

    // Ensure panel doesn't go off screen horizontally
    const panelRight = parseInt(panel.style.left) + UI.menuW;
    if (panelRight > window.innerWidth) {
        panel.style.left = (window.innerWidth - UI.menuW - spacing) + 'px';
    }

    // Add a small visual indicator if menu is truncated
    const isTruncated = panelHeight < menuFullHeight;
    panel.style.borderBottom = isTruncated ? '2px solid rgba(255,200,0,0.5)' : '1.5px solid rgba(0,255,0,0.35)';
}

function updateMenuInfoCallsign(cs, lat, lon, acName) {
    const csEl = document.getElementById('radarInfo_callsign');
    const posEl = document.getElementById('radarInfo_position');
    const acEl  = document.getElementById('radarInfo_acname');
    if (csEl) csEl.textContent = cs || '—';
    if (acEl) acEl.textContent = acName || '—';
    if (posEl && lat != null) {
        const latStr = Math.abs(lat).toFixed(3) + (lat >= 0 ? '°N' : '°S');
        const lonStr = Math.abs(lon).toFixed(3) + (lon >= 0 ? '°E' : '°W');
        posEl.textContent = `${latStr} ${lonStr}`;
    } else if (posEl) {
        posEl.textContent = '—';
    }
}

function updateApiStatus(msg, ok) {
    const el = document.getElementById('radarInfo_apistatus');
    if (!el) return;
    el.textContent       = msg;
    el.dataset.statusOk  = ok ? 'true' : 'false';
    el.style.color = ok ? T().menuStatus : 'rgba(255,120,60,0.95)';
}

function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }

function openMenu() {
    menuOpen = true;
    const p = document.getElementById('radarMenuPanel');
    if (p) {
        p.style.display = 'block';
        repositionMenu(); // Ensure correct position when opening
    }
}

function closeMenu() {
    menuOpen = false;
    const p = document.getElementById('radarMenuPanel');
    if (p) p.style.display = 'none';
}

// Update repositionNearestHUD to also reposition menu
function repositionNearestHUD() {
    const rl = parseInt(radarCanvas.style.left) || 5;
    const rt = parseInt(radarCanvas.style.top)  || 0;
    nearestHUD.style.left = (rl + radarSize + 12) + 'px';
    nearestHUD.style.top  = rt + 'px';

    // Also reposition menu when radar moves
    repositionMenu();
}

// Add window resize handler
window.addEventListener('resize', () => {
    repositionMenu();
    repositionNearestHUD();
});
// ═══════════════════════════════════════════════════
// SECTION 6 — BLIP POPUP
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
        // Use session id (unique per player) not callsign (multiple players can share "Foo")
        const isSameBlip = _trackedId && _trackedId === closest.ac.id;
        if (isSameBlip) {
            // Second click on same aircraft → deselect
            hidePopup();
            stopTracking();
        } else {
            // New aircraft clicked → lock tracking onto it by session id
            activePopupCs   = closest.ac.cs;
            _trackedAc      = closest.ac;
            _trackedId      = closest.ac.id;
            _lastHudUpdate  = 0;
            _lastNearestCs  = null;
            updateNearestHUD(closest.ac, closest.myData);
            hidePopup();
        }
    } else {
        // Clicked empty space → clear
        hidePopup();
        stopTracking();
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

function detectCallsign() {
    try {
        if (window.geofs) {
            const fromAircraft = geofs.aircraft?.instance?.callsign;
            if (fromAircraft && fromAircraft !== 'Foo' && fromAircraft.length > 0) {
                window._radarMyCallsign = fromAircraft;
                return fromAircraft;
            }
            const fromRecord = geofs.userRecord?.callsign;
            if (fromRecord && fromRecord !== 'Foo' && fromRecord.length > 0) {
                window._radarMyCallsign = fromRecord;
                return fromRecord;
            }
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
}, PAUSE_POLL_INTERVAL);
// ═══════════════════════════════════════════════════

let aircraftListCache = [];
const prevAcData = new Map();

// ═══════════════════════════════════════════════════
// SECTION 10b — AIRCRAFT NAME LOOKUP
// Maps GeoFS aircraft type IDs (the "ac" field in the multiplayer API) to short
// display names.  Boeing → B prefix, Airbus → A prefix, others as recognised.
// Unknown IDs fall back to "#ID" so something always shows.
// ═══════════════════════════════════════════════════

const AIRCRAFT_NAMES = {
    1:   'C172',      // Cessna 172 Skyhawk
    2:   'B737',      // Boeing 737-800
    3:   'A380',      // Airbus A380
    4:   'F/A-18',    // F/A-18 Hornet
    5:   'B747',      // Boeing 747-400
    6:   'DC-3',      // Douglas DC-3
    7:   'SR22',      // Cirrus SR-22
    8:   'PA-28',     // Piper PA-28 Cherokee
    9:   'Concorde',  // Concorde
    10:  'B-17',      // Boeing B-17 Flying Fortress
    11:  'B787',      // Boeing 787 Dreamliner
    12:  'DHC-2',     // de Havilland Canada DHC-2 Beaver
    13:  'Extra330',  // Extra 330
    14:  'CitX',      // Cessna Citation X
    15:  'Shuttle',   // Space Shuttle
    16:  'J-3',       // Piper J-3 Cub
    17:  'B777',      // Boeing 777
    18:  'A320',      // Airbus A320
    19:  'CRJ200',    // Bombardier CRJ-200
    20:  'Q400',      // Bombardier Dash 8 Q400
    21:  'R44',       // Robinson R44 helicopter
    22:  'A330',      // Airbus A330
    23:  'E175',      // Embraer 175
    24:  'B737M',     // Boeing 737 MAX 8
    25:  'B757',      // Boeing 757
    26:  'B767',      // Boeing 767
    27:  'A319',      // Airbus A319
    28:  'A321',      // Airbus A321
    29:  'A350',      // Airbus A350
    30:  'B747SP',    // Boeing 747SP
    31:  'C208',      // Cessna 208 Caravan
    32:  'TBM930',    // Daher TBM 930
    33:  'A220',      // Airbus A220
    34:  'E190',      // Embraer 190
    35:  'B737NG',    // Boeing 737 Next Gen
    36:  'B777X',     // Boeing 777X
    37:  'A340',      // Airbus A340
    38:  'ATR72',     // ATR 72
    39:  'E145',      // Embraer ERJ-145
    40:  'Dash8',     // Bombardier Dash 8 Q200
    41:  'PC-12',     // Pilatus PC-12
    42:  'CRJ900',    // Bombardier CRJ-900
    43:  'B737CL',    // Boeing 737 Classic
    44:  'MD-11',     // McDonnell Douglas MD-11
    45:  'DC-10',     // McDonnell Douglas DC-10
    46:  'L-1011',    // Lockheed L-1011
    47:  'B707',      // Boeing 707
    48:  'B727',      // Boeing 727
    49:  'B717',      // Boeing 717
    50:  'B720',      // Boeing 720
    51:  'Spitfire',  // Supermarine Spitfire
    52:  'P-51',      // North American P-51 Mustang
    53:  'F-16',      // General Dynamics F-16
    54:  'F-14',      // Grumman F-14 Tomcat
    55:  'F-22',      // Lockheed F-22 Raptor
    56:  'F-35',      // Lockheed F-35 Lightning II
    57:  'MiG-29',    // Mikoyan MiG-29
    58:  'Su-27',     // Sukhoi Su-27
    59:  'Gripen',    // Saab JAS 39 Gripen
    60:  'Eurofighter',// Eurofighter Typhoon
    61:  'C-130',     // Lockheed C-130 Hercules
    62:  'C-17',      // Boeing C-17 Globemaster
    63:  'B-52',      // Boeing B-52 Stratofortress
    64:  'B-2',       // Northrop B-2 Spirit
    65:  'U-2',       // Lockheed U-2
    66:  'SR-71',     // Lockheed SR-71 Blackbird
    67:  'X-15',      // North American X-15
    68:  'MV-22',     // Bell-Boeing V-22 Osprey
    69:  'UH-60',     // Sikorsky UH-60 Black Hawk
    70:  'Mi-8',      // Mil Mi-8
    71:  'CH-47',     // Boeing CH-47 Chinook
};

// Attempt to derive a short name from a full aircraft name string.
// Boeing → B prefix, Airbus → A prefix, Cessna → C prefix, common patterns.
function formatAircraftName(fullName) {
    if (!fullName || typeof fullName !== 'string') return null;
    const n = fullName.trim();
    if (n.length === 0) return null;

    // Direct regex matches for major manufacturers
    const boeingM  = n.match(/boeing\s*(\d{3}[-\w]*)/i);
    if (boeingM) return 'B' + boeingM[1].replace(/\s+/g, '');

    const airbusM  = n.match(/airbus\s*[Aa]?(\d{3}[-\w]*)/i);
    if (airbusM) return 'A' + airbusM[1].replace(/\s+/g, '');

    // Airbus written as "A320", "A380", etc. already
    const airbusShort = n.match(/^[Aa](\d{3}[-\w]*)$/);
    if (airbusShort) return 'A' + airbusShort[1];

    const cessnaM  = n.match(/cessna\s*(\w+)/i);
    if (cessnaM) return 'C' + cessnaM[1];

    const embraerM = n.match(/embraer\s*([\w-]+)/i);
    if (embraerM) return 'E' + embraerM[1];

    // Already short — return as-is or truncate
    return n.length <= 9 ? n : n.slice(0, 9);
}

// Get a short aircraft type name from a GeoFS aircraft type ID.
// First tries the static table, then tries GeoFS's own definitions, then falls back.
function getAircraftShortName(acId) {
    if (acId == null) return null;
    const id = parseInt(acId);

    // Static table (covers built-in GeoFS aircraft)
    if (AIRCRAFT_NAMES[id]) return AIRCRAFT_NAMES[id];

    // Try GeoFS's live aircraft definitions for custom/community aircraft
    try {
        const def = window.geofs?.aircraft?.aircraftList?.[id]
                 || window.geofs?.aircraft?.definitions?.[id];
        if (def?.name) return formatAircraftName(def.name) || def.name.slice(0, 9);
    } catch(e) {}

    // Final fallback: show the numeric ID so it's at least informative
    return id > 0 ? `#${id}` : null;
}

// Get the short type name for the local player's own aircraft.
let _cachedPlayerAcName  = null; // cached so we don't re-derive every frame
let _cachedPlayerAcId    = null;

function getPlayerAircraftName() {
    try {
        const inst = window.geofs?.aircraft?.instance;
        if (!inst) return _cachedPlayerAcName;

        // The instance aircraft ID (type, not the player session id)
        const acId = inst.aircraftRecord?.id ?? inst.id ?? inst.ac;

        // Only re-derive when the aircraft type changes (e.g. after switching aircraft)
        if (acId != null && acId !== _cachedPlayerAcId) {
            _cachedPlayerAcId   = acId;
            // Try the full name from the record first, then fall back to ID table
            const fullName = inst.aircraftRecord?.name || inst.name || inst.model?.name;
            _cachedPlayerAcName = (fullName ? formatAircraftName(fullName) : null)
                               || getAircraftShortName(acId);
        }
    } catch(e) {}
    return _cachedPlayerAcName;
}

// ─────────────────────────────────────────────────────────────────────────────
// code uses.  The GeoFS multiplayer API does NOT have ac.al / ac.h / ac.s.
// The actual layout of the co[] array is:
//   co[0] lat   co[1] lon   co[2] altitude (metres)
//   co[3] heading (degrees)  co[4] pitch  co[5] roll
// Speed is in st.as (airspeed, knots).
// Without this normalisation every heading read is NaN → no triangles, no
// vectors; every altitude read falls back to co[2] * 3.28084 via the existing
// fallback so that part worked, but heading / speed were always missing.
// ─────────────────────────────────────────────────────────────────────────────
function normalizeAc(raw) {
    const ac = Object.assign({}, raw); // shallow clone — don't mutate the raw object

    // heading: co[3]
    if (ac.h == null && Array.isArray(ac.co) && ac.co.length > 3) {
        const v = parseFloat(ac.co[3]);
        if (isFinite(v)) ac.h = v;
    }

    // altitude: co[2] is METRES → convert to feet
    // Set ac.al so the rest of the code's `parseFloat(ac.al)` path is used directly
    if (ac.al == null && Array.isArray(ac.co) && ac.co.length > 2) {
        const v = parseFloat(ac.co[2]);
        if (isFinite(v)) ac.al = v * 3.28084;
    }

    // speed: st.as (airspeed knots) — prefer over computed delta
    if (ac.s == null && ac.st && ac.st.as != null) {
        const v = parseFloat(ac.st.as);
        if (isFinite(v)) ac.s = v;
    }

    // short aircraft type name from the "ac" field (integer type ID)
    if (ac._shortName == null && ac.ac != null) {
        ac._shortName = getAircraftShortName(ac.ac);
    }

    return ac;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX — Rate limiting & exponential backoff
// Original: setInterval every 1 000 ms = 60 requests/min → HTTP 429 always
// Fix: base interval 5 000 ms; on 429 double the delay up to 60 s, then
// recover back toward 5 s on success.
// ─────────────────────────────────────────────────────────────────────────────
let _fetchConsecutiveErrors = 0;
let _fetchDelay = FETCH_DELAY_BASE; // current interval — grows on 429, shrinks on success
const FETCH_MIN = FETCH_DELAY_BASE;
const FETCH_MAX = FETCH_DELAY_MAX;
let _fetchTimer = null;

function scheduleFetch(delay) {
    if (_fetchTimer) clearTimeout(_fetchTimer);
    _fetchTimer = setTimeout(doFetch, delay);
}

async function doFetch() {
    if (!isGamePaused) {
        try {
            const res = await fetch('https://mps.geo-fs.com/map');

            if (res.status === 429) {
                // Rate limited — double the delay
                _fetchDelay = Math.min(_fetchDelay * 2, FETCH_MAX);
                _fetchConsecutiveErrors++;
                updateApiStatus(`429 Rate limited — retrying in ${_fetchDelay/1000}s (×${_fetchConsecutiveErrors})`, false);
                scheduleFetch(_fetchDelay);
                return;
            }

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data  = await res.json();
            const now   = Date.now();
            const users = (data.users || []).map(normalizeAc);

            users.forEach(ac => {
                if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) return;
                const id   = ac.cs || `${Math.round(ac.co[0]*1000)},${Math.round(ac.co[1]*1000)}`;
                const prev = prevAcData.get(id);
                if (prev) {
                    const dt = (now - prev.time) / 1000;
                    if (dt > FETCH_SPEED_DT_MIN && dt <= FETCH_SPEED_DT_MAX) {
                        const dLat = (ac.co[0] - prev.lat) * Math.PI / 180;
                        const dLon = (ac.co[1] - prev.lon) * Math.PI / 180;
                        const R    = 6371000;
                        const a    = Math.sin(dLat/2)**2
                                   + Math.cos(prev.lat * Math.PI/180)
                                   * Math.cos(ac.co[0]  * Math.PI/180)
                                   * Math.sin(dLon/2)**2;
                        const distM   = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                        const speedKt = (distM / dt) / 0.514444;
                        // Only use position-delta speed if st.as is missing
                        if (ac.s == null && speedKt <= 3000) ac._computedSpd = speedKt;
                        else if (ac.s == null && typeof prev._computedSpd === 'number') {
                            ac._computedSpd = prev._computedSpd;
                        }
                    } else if (ac.s == null && typeof prev._computedSpd === 'number') {
                        ac._computedSpd = prev._computedSpd;
                    }
                }
                prevAcData.set(id, {
                    lat: ac.co[0], lon: ac.co[1], time: now,
                    ...(typeof ac._computedSpd === 'number' && { _computedSpd: ac._computedSpd }),
                });
            });

            aircraftListCache    = users;
            _fetchConsecutiveErrors = 0;
            // Gradually recover toward minimum interval on success
            _fetchDelay = Math.max(FETCH_MIN, _fetchDelay * 0.75);
            updateApiStatus(`OK — ${users.length} aircraft`, true);

        } catch(e) {
            _fetchConsecutiveErrors++;
            _fetchDelay = Math.min(_fetchDelay * 1.5, FETCH_MAX);
            updateApiStatus(`Error (×${_fetchConsecutiveErrors}): ${e.message}`, false);
            // Keep stale cache — don't wipe blips on a transient hiccup
        }
    }
    scheduleFetch(_fetchDelay);
}

// Kick off the first fetch
scheduleFetch(FETCH_DELAY_INITIAL);

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
        // FIX #5 — Force airport cache to rebuild on next draw after a re-fetch
        drawAirportsAndRunways._cachedGroups = null;
        _airportCache_lastLat  = null; // force position-check to trigger rebuild
        _airportCache_lastLon  = null;
        console.log(`OurAirports: ${airportCache.length} airports, ${runwayCache.length} runways`);
    } catch(e) { console.error('Airport fetch error:', e); }
}

setTimeout(fetchAirportData, AIRPORT_FETCH_INITIAL);
setInterval(fetchAirportData, AIRPORT_REFETCH);

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

function drawSpinLine() {
    if (isGamePaused) return;
    const cx = radarSize/2, cy = radarSize/2;
    const R  = radarSize/2 - 10;
    const t  = T();

    spinAngle += SPIN_SPEED;
    if (spinAngle > Math.PI*2) spinAngle -= Math.PI*2;

    const ex = cx + Math.cos(spinAngle) * R;
    const ey = cy + Math.sin(spinAngle) * R;

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

    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey);
    ctx.strokeStyle = t.scanLine[0]; ctx.lineWidth = 2; ctx.stroke();

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
    const moved = _airportCache_lastLat === null
        || Math.abs(playerLat - _airportCache_lastLat) * 111000 > 1
        || Math.abs(playerLon - _airportCache_lastLon) * 111000 * Math.cos(playerLat * Math.PI/180) > 1
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

let _lastMenuInfoUpdate = 0;
let _lastHudUpdate      = 0;
let _lastNearestCs      = null;
let _cachedCallsign     = null;

function drawRadar() {
    const t  = T();
    const cx = radarSize/2, cy = radarSize/2;

    ctx.clearRect(0, 0, radarSize, radarSize);
    ctx.beginPath();
    ctx.arc(cx, cy, radarSize/2, 0, Math.PI*2);
    ctx.fillStyle = t.bg;
    ctx.fill();

    // ─────────────────────────────────────────────────────────────────────
    // FIX #1 + FIX #2 — Own-aircraft position with last-valid fallback
    //
    // Original code:
    //   • Declared _lastValidLat/Lon at the top but NEVER wrote or read them
    //   • Gated the entire traffic render on `player` being truthy
    //
    // Fix:
    //   • Write _lastValidLat/Lon every frame when geofs gives us a valid position
    //   • Use those stored values when geofs.aircraft.instance is temporarily null
    //   • Gate traffic on `hasPos` (position available) not `player` (live object)
    //     so blips keep rendering through brief instance-null gaps (loading, respawn)
    // ─────────────────────────────────────────────────────────────────────
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

            // FIX #1 — Actually store the last valid position (was declared but never written)
            if (isFinite(playerLat) && isFinite(playerLon) && (playerLat !== 0 || playerLon !== 0)) {
                _lastValidLat   = playerLat;
                _lastValidLon   = playerLon;
                _lastValidAltFt = playerAltFt;
            }
        }
    } catch(e) {}

    // FIX #2 — Fall back to last-known position when instance is temporarily unavailable
    // This means blips continue to render during brief null-instance windows.
    const hasPos = !!player || (_lastValidLat !== null);
    if (!player && _lastValidLat !== null) {
        playerLat   = _lastValidLat;
        playerLon   = _lastValidLon;
        playerAltFt = _lastValidAltFt;
    }

    // FIX #3 — Always read live callsign; never freeze it from a one-time set.
    // Now we refresh it every second from detectCallsign() which reads the live
    // geofs fields each time, falling back to cached value only if geofs is unavailable.
    const _now = Date.now();
    if (_now - _lastMenuInfoUpdate > MENU_INFO_UPDATE_INTERVAL) {
        _lastMenuInfoUpdate = _now;
        _cachedCallsign = detectCallsign();
        if (_cachedCallsign) window.playerCallsign = _cachedCallsign;
    }
    const displayCallsign = _cachedCallsign || playerCallsign;

    // Update menu info rows (once/sec, same throttle as callsign refresh above)
    {
        const _playerAcName = getPlayerAircraftName();
        updateMenuInfoCallsign(displayCallsign, hasPos ? playerLat : null, hasPos ? playerLon : null, _playerAcName);
    }

    const myData = hasPos ? {
        lat:   playerLat,
        lon:   playerLon,
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

    if (settings.showTraffic && !isGamePaused && aircraftListCache.length > 0 && hasPos) {
        const myCs = _cachedCallsign || playerCallsign;

        aircraftListCache.forEach(ac => {
            ctx.save();
            try {
                if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) return;

                // Self-filter: skip own aircraft (callsign match)
                if (ac.cs && myCs && myCs !== 'YOU' && ac.cs.toLowerCase() === myCs.toLowerCase()) return;

                // Isolate mode: when tracking, only draw the tracked aircraft
                if (_trackedId && settings.isolateTracked && ac.id !== _trackedId) return;

                const [dx, dy] = latLonToMeters(playerLat, playerLon, ac.co[0], ac.co[1]);
                const distM    = Math.hypot(dx, dy);
                if (distM > radarRange) return;

                const [rx, ry] = worldToCanvas(dx, dy, cx, cy, rotRad);
                if (Math.hypot(rx-cx, ry-cy) > radarSize/2) return;

                if (distM < nearestMeters) {
                    nearestMeters = distM;
                    nearestAc = ac;
                }

                lastBlipPositions.push({ x:rx, y:ry, ac, distance:distM, myData });

                const isTrackedBlip = !!_trackedId && ac.id === _trackedId;
                const isActive      = isTrackedBlip;

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur  = 0;
                ctx.setLineDash([]);

                const acH = parseFloat(ac.h);
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
                const blipColor  = isTrackedBlip ? 'rgba(255,220,60,1)' : T().blipFill;
                const blipStroke = isTrackedBlip ? 'rgba(255,240,120,0.9)' : 'rgba(255,255,255,0.7)';

                // Selection ring for tracked aircraft
                if (isTrackedBlip) {
                    ctx.beginPath();
                    ctx.arc(rx, ry, (settings.showBlipTriangle && isFinite(acH) ? UI.blipTriTip : UI.blipDotR) + 7, 0, Math.PI*2);
                    ctx.strokeStyle = 'rgba(255,220,60,0.4)';
                    ctx.lineWidth   = 2.5;
                    ctx.stroke();
                }

                if (settings.showBlipTriangle && isFinite(acH)) {
                    const angle = (acH * Math.PI / 180) - rotRad;
                    const tip   = UI.blipTriTip, base = UI.blipTriBase;
                    ctx.save();
                    ctx.translate(rx, ry); ctx.rotate(angle);
                    ctx.beginPath();
                    ctx.moveTo(0, -tip);
                    ctx.lineTo( base,  tip * 0.55);
                    ctx.lineTo(-base,  tip * 0.55);
                    ctx.closePath();
                    ctx.fillStyle   = blipColor;
                    ctx.fill();
                    ctx.strokeStyle = blipStroke;
                    ctx.lineWidth   = isActive ? 2 : 1.5;
                    ctx.stroke();
                    ctx.restore();
                } else {
                    const blipR = isActive ? UI.blipDotRActive : UI.blipDotR;
                    ctx.fillStyle = blipColor;
                    ctx.beginPath(); ctx.arc(rx, ry, blipR, 0, Math.PI*2); ctx.fill();
                    ctx.strokeStyle = blipStroke; ctx.lineWidth = isActive ? 2 : 1; ctx.stroke();
                }

                // ── Labels ───────────────────────────────────
                const blipBottom = settings.showBlipTriangle && isFinite(acH)
                    ? ry + UI.blipTriTip + 4
                    : ry + (isActive ? UI.blipDotRActive : UI.blipDotR) + 4;
                let labelY = blipBottom;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';
                ctx.font = `bold ${UI.blipLabelFont}px Arial`;

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

                // showCallsign = OTHER players' callsigns only
                if (settings.showCallsign && ac.cs) {
                    labelY = drawTag(ac.cs.substring(0, 12), T().blipLabel, labelY);
                }

                // showAircraftName = OTHER players' aircraft types only
                if (settings.showAircraftName && ac._shortName) {
                    labelY = drawTag(ac._shortName, T().blipAlt, labelY);
                }

                const rawAlt = isFinite(parseFloat(ac.al))
                    ? parseFloat(ac.al)
                    : (ac.co.length >= 3 && isFinite(parseFloat(ac.co[2]))
                        ? parseFloat(ac.co[2]) * 3.28084
                        : null);
                const altFmt = rawAlt !== null ? fmtAlt(rawAlt) : null;
                if (settings.showAltitude && altFmt !== null) {
                    labelY = drawTag(altFmt, T().blipAlt, labelY);
                }

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

    // ── Player callsign tag (showMyCallsign) ──────
    let _playerTagBottomY = cy + UI.playerTriBaseOff + UI.playerTriTip + 13;
    if (settings.showMyCallsign && displayCallsign) {
        const lbl = displayCallsign.substring(0, 12);
        ctx.font = `bold ${UI.playerCsFont}px Arial`;
        const tw = ctx.measureText(lbl).width;
        const ty = _playerTagBottomY;
        ctx.fillStyle   = isGamePaused ? 'rgba(80,80,80,0.85)' : 'rgba(0,80,0,0.85)';
        ctx.strokeStyle = T().playerLabel; ctx.lineWidth = 1;
        ctx.fillRect(cx - tw/2 - 7, ty - 11, tw + 14, 22);
        ctx.strokeRect(cx - tw/2 - 7, ty - 11, tw + 14, 22);
        ctx.fillStyle   = T().playerLabel;
        ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, cx, ty);
        _playerTagBottomY = ty + 14;
    }

    // ── Player aircraft type tag (showMyAircraftType) ─
    if (settings.showMyAircraftType) {
        const acName = getPlayerAircraftName();
        if (acName) {
            ctx.font = `bold ${UI.playerDistFont}px Arial`;
            const tw3 = ctx.measureText(acName).width;
            const ty3 = _playerTagBottomY + 3;
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(cx - tw3/2 - 6, ty3 - 10, tw3 + 12, 18);
            ctx.fillStyle   = T().blipAlt;
            ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(acName, cx, ty3);
        }
    }

    // ── Paused overlay ───────────────────────────
    if (isGamePaused) {
        ctx.fillStyle = T().pauseText;
        ctx.font = `bold ${UI.pausedFont}px Arial`; ctx.textAlign = 'center';
        ctx.fillText('PAUSED', cx, radarSize - 30);
    }

    // ── Player triangle — always on top ──────────
    drawPlayerTriangle(cx, cy, playerHeading, isGamePaused);

    // ── Update Tracking / Nearby Traffic HUD ─────
    if (!isGamePaused) {
        const _hudNow = Date.now();

        if (_trackedId) {
            // Refresh the tracked aircraft from the live cache by session ID
            const freshTracked = refreshTracked();
            const trackKey = freshTracked ? freshTracked.id : _trackedId;
            if (trackKey !== _lastNearestCs || _hudNow - _lastHudUpdate > HUD_UPDATE_INTERVAL) {
                _lastNearestCs = trackKey;
                _lastHudUpdate = _hudNow;
                updateNearestHUD(nearestAc, myData);
            }
        } else if (nearestAc) {
            if (nearestAc.id !== _lastNearestCs || _hudNow - _lastHudUpdate > HUD_UPDATE_INTERVAL) {
                _lastNearestCs = nearestAc.id;
                _lastHudUpdate = _hudNow;
                updateNearestHUD(nearestAc, myData);
            }
        } else {
            if (_lastNearestCs !== null) {
                _lastNearestCs = null;
                updateNearestHUD(null, null);
            }
        }
    } else if (isGamePaused) {
        if (_lastNearestCs !== null) {
            _lastNearestCs = null;
            updateNearestHUD(null, null);
        }
    }
}

// ═══════════════════════════════════════════════════
// SECTION 18 — DRAW LOOP
// ═══════════════════════════════════════════════════

setInterval(() => { if (!isDragging) drawRadar(); }, DRAW_INTERVAL);
setInterval(repositionUI, REPOSITION_INTERVAL);

// ═══════════════════════════════════════════════════
// SECTION 19 — INIT
// ═══════════════════════════════════════════════════

setTimeout(() => {
    createMenu();
    loadPosition();
    applyTheme();
    repositionNearestHUD();
}, INIT_DELAY);
