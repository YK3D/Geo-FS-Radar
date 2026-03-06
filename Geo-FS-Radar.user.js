
// ═══════════════════════════════════════════════════
// Geo-FS-Radar  v8.06
// ═══════════════════════════════════════════════════

// ILS & DISPLAY PREFS — adjustable via the settings menu
// These are kept as a plain object so sliders can mutate them live.
// ═══════════════════════════════════════════════════
const ilsPrefs = {
    fontHeader:   12,   // ILS header label font size (px)
    fontLabel:    9,    // ILS small section label font size (px)
    fontValue:    15,   // ILS main data value font size (px)
    fontPillLabel:9,    // ILS deviation pill label font size (px)
    fontPillValue:13,   // ILS deviation pill value font size (px)
    fontFooter:   10,   // ILS footer text font size (px)
    fontBankValue:11,   // ILS bank angle canvas text font size (px)
};
// Load persisted ILS prefs
try { Object.assign(ilsPrefs, JSON.parse(localStorage.getItem('radarIlsPrefs') || '{}')); } catch(e) {}
function saveIlsPrefs() { localStorage.setItem('radarIlsPrefs', JSON.stringify(ilsPrefs)); }

// ═══════════════════════════════════════════════════
// SECTION 1 — RADAR PREFERENCES
// ═══════════════════════════════════════════════════

    const _PREF_DEFAULTS = {
        radarSizePx:        300,     // Radar canvas size in pixels
        radarSizeUnit:      'px',    // Size unit: 'px' or '%'
        minRangeKm:         0.5,     // Minimum radar range (km)
        maxRangeKm:         50,      // Maximum radar range (km)
        scrollIncKm:        0.5,     // Scroll wheel zoom step (km)
        fetchDelay:         250,     // REST API poll interval (ms)
        radarOpacity:       1.0,     // Radar canvas opacity 0–1
        useNautical:        false,   // Distance units: false=metric, true=nautical miles
        hideFooPlayers:     false,   // Hide aircraft with callsign "Foo"
        hideGroundPlayers:  false,   // Hide aircraft detected as on the ground
        showTrail:          false,   // Draw own-aircraft trail on radar
        trailLengthSec:     60,      // Trail history retention (seconds)
        trailWidth:         2,       // Trail line thickness (pixels)
        tcasEnabled:        true,    // Show TCAS traffic warning overlay
        tcasAudioEnabled:   true,    // Play audio with TCAS warning
        tcasLookaheadS:     30,      // Seconds: how far ahead to project each path
        tcasAltBandFt:      200,     // ±feet altitude band for threat detection
        tcasMinAltFt:       200,     // Feet AGL: both aircraft must be above this
        tcasMarginM:        300,     // Metres: intersection tolerance
        tcasAudioCooldownMs:10000,   // Minimum ms between audio replays
        tcasTimeTolPct:     8,       // ±% time tolerance: intersection must occur at similar t on both paths
        altFilterEnabled:   false,   // Filter traffic by altitude band
        altFilterMinFt:     0,       // Min altitude (ft) to show traffic
        altFilterMaxFt:     50000,   // Max altitude (ft) to show traffic
    };

    let prefs;
    try {
        prefs = Object.assign({}, _PREF_DEFAULTS, JSON.parse(localStorage.getItem('radarPrefs') || '{}'));
    } catch(e) {
        prefs = Object.assign({}, _PREF_DEFAULTS);
    }

    function savePrefs() {
        localStorage.setItem('radarPrefs', JSON.stringify(prefs));
    }

function _pxFromPrefs() {
    if (prefs.radarSizeUnit === '%') {
        return Math.max(150, Math.min(900,
            Math.round(prefs.radarSizePct / 100 * Math.min(window.innerWidth, window.innerHeight))
        ));
    }
    return prefs.radarSizePx;
}

let radarSize        = _pxFromPrefs();
let MIN_RANGE        = prefs.minRangeKm  * 1000;
let MAX_RANGE        = prefs.maxRangeKm  * 1000;
let SCROLL_INC       = prefs.scrollIncKm * 1000;
let FETCH_DELAY_BASE = prefs.fetchDelay;

function applyPrefs() {
    savePrefs();
    radarSize        = _pxFromPrefs();        // Recompute canvas size from prefs
    MIN_RANGE        = prefs.minRangeKm  * 1000; // Convert km → metres
    MAX_RANGE        = prefs.maxRangeKm  * 1000;
    SCROLL_INC       = prefs.scrollIncKm * 1000;
    FETCH_DELAY_BASE = prefs.fetchDelay;

    radarCanvas.width  = radarSize;
    radarCanvas.height = radarSize;
    radarCanvas.style.width   = radarSize + 'px';
    radarCanvas.style.height  = radarSize + 'px';
    radarCanvas.style.opacity = prefs.radarOpacity ?? 1; // Apply opacity pref

    radarRange = Math.max(MIN_RANGE, Math.min(MAX_RANGE, radarRange));
    updateRangeBox();
    repositionUI();
    applyTheme();
}

function _fmtRadarSize() {
    if (prefs.radarSizeUnit === '%') return prefs.radarSizePct + '%';
    return prefs.radarSizePx + ' px';
}

// ═══════════════════════════════════════════════════
// SECTION 1b — TIMING & INTERVALS
// ═══════════════════════════════════════════════════

const FETCH_DELAY_MAX        =  800;
const FETCH_DELAY_INITIAL    =  500;
const FETCH_SPEED_DT_MIN     =  0.5;
const FETCH_SPEED_DT_MAX     =  30;
const AIRPORT_FETCH_INITIAL  =  2000;
const AIRPORT_REFETCH        =  300000;
const DRAW_INTERVAL          =  120;
const PAUSE_POLL_INTERVAL    =  500;
const REPOSITION_INTERVAL    =  1000;
const MENU_INFO_UPDATE_INTERVAL = 1000;
const HUD_UPDATE_INTERVAL    =  500;
const INIT_DELAY             =  300;
const DRAG_REPOSITION_DELAY  =  120;

// ═══════════════════════════════════════════════════
// SECTION 1c — FONT FAMILIES
// ═══════════════════════════════════════════════════

const FONT_SANS   = 'Arial, sans-serif';
const FONT_MONO   = '"Courier New", Courier, monospace';
const FONT_CANVAS = 'Arial';

// ═══════════════════════════════════════════════════
// SECTION 1d — UI CONFIGURATION
// ═══════════════════════════════════════════════════

const UI = {
    blipDotR:            5,
    blipDotRActive:      8,
    blipTriTip:          11,
    blipTriBase:         6,
    blipLabelFont:       11,
    blipLabelRowH:       18,
    blipLabelPadX:       4,
    ringLineW:           6,
    ringLabelFont:       15,
    compassFont:         30,
    compassHdgFont:      14,
    playerTriTip:        15,
    playerTriBase:       8,
    playerTriBaseOff:    8,
    playerCsFont:        15,
    playerDistFont:      14,
    rangeBoxW:           130,
    rangeBoxH:           54,
    rangeBoxFont:        20,
    menuW:               280,
    menuTitleFont:       15,
    menuSectionFont:     13,
    menuRowFont:         14,
    menuRowPadY:         7,
    menuSwitchW:         40,
    menuSwitchH:         22,
    menuKnobSize:        14,
    menuRadioFont:       12,
    menuInfoFont:        14,
    popupTitleFont:      18,
    popupBodyFont:       17,
    popupAltDeltaFont:   15,
    vectorLineW:         1.5,
    hudHeaderLabelFont:  13,
    hudSectionLabelFont: 17,
    hudCallsignFont:     18,
    hudDataFont:         15,
    hudAltDeltaFont:     12,
    hudIsolateLabelFont: 14,
    hudStopBtnFont:      15,
    airportLabelFont:    10,
    pausedFont:          22,
    gridLineW:           2,
};

let radarRange = Math.max(MIN_RANGE, Math.min(MAX_RANGE,
    parseInt(localStorage.getItem('radarRange') || '5000'))); // Current radar range in metres
let isGamePaused = false; // True when GeoFS game is paused

let _lastValidLat   = null;  // Last known valid player latitude
let _lastValidLon   = null;  // Last known valid player longitude
let _lastValidAltFt = 0;     // Last known valid player altitude (feet)

// Trail state — stores own-aircraft position history for drawing
const _trailPoints = []; // Array of {lat, lon, time} objects
const TRAIL_MAX_PTS = 600; // Maximum number of trail points stored

const settings = {
    showRings:          true,
    showRingLabels:     true,
    showVectors:        true,
    showAltitude:       true,
    showSpeed:          true,
    speedMode:          'IAS',
    orientMode:         'north',
    nightMode:          false,
    showAirports:       true,
    showCallsign:       true,
    showPlayerTriangle: true,
    showNearestHUD:     true,
    showTraffic:        true,
    showBlipTriangle:   true,
    showBlipDist:       true,
    showMyCallsign:     true,
    isolateTracked:     false,
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
        trailColor:    (a) => `rgba(255,140,0,${a})`,  // Orange trail
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
        rangeBoxBg:    'rgba(0,40,0,0.82)',
        rangeBoxBorder:'rgba(0,255,0,0.6)',
        rangeBoxGlow:  '0 0 12px rgba(0,255,0,0.35)',
        rangeVal:      '#0f0',
        rangeValGlow:  '0 0 5px rgba(0,255,0,0.6)',
        rangeLabel:    'rgba(0,255,0,0.7)',
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
        trailColor:    (a) => `rgba(255,140,0,${a})`,  // Orange trail (night mode)
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
        rangeBoxBg:    'rgba(30,5,0,0.88)',
        rangeBoxBorder:'rgba(220,60,40,0.7)',
        rangeBoxGlow:  '0 0 14px rgba(220,40,20,0.5)',
        rangeVal:      'rgba(255,140,80,1)',
        rangeValGlow:  '0 0 6px rgba(220,60,20,0.7)',
        rangeLabel:    'rgba(200,90,60,0.8)',
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

    radarCanvas.style.border    = `2px solid ${t.canvasBorder}`;
    radarCanvas.style.boxShadow = t.canvasGlow;

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

    const mb = document.getElementById('radarMenuBtn');
    if (mb) {
        mb.style.background = t.menuBtnBg;
        mb.style.color      = t.menuBtnColor;
        mb.style.border     = `1.5px solid ${t.menuBtnBorder}`;
        mb.style.boxShadow  = t.menuBtnGlow;
        mb.onmouseover = () => mb.style.background = t.menuBtnBgHov;
        mb.onmouseout  = () => mb.style.background = t.menuBtnBg;
    }

    const mp = document.getElementById('radarMenuPanel');
    if (mp) {
        mp.style.background    = t.menuBg;
        mp.style.border        = `1.5px solid ${t.menuBorder}`;
        mp.style.scrollbarColor = t.menuScrollbar;

        const titleEl = mp.querySelector('[data-menu-title]');
        if (titleEl) {
            titleEl.style.color       = t.menuTitle;
            titleEl.style.borderColor = t.menuSep;
        }

        mp.querySelectorAll('[data-menu-section]').forEach(el => {
            el.style.color = t.menuSection;
        });

        mp.querySelectorAll('[data-menu-sep]').forEach(el => {
            el.style.borderTopColor = t.menuSep;
        });

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

        mp.querySelectorAll('[data-radio-key]').forEach(el => {
            const key = el.dataset.radioKey;
            const opt = el.dataset.radioOpt;
            const on  = settings[key] === opt;
            el.style.background = on ? t.radioBtnOn : t.radioBtnOff;
            el.style.color      = on ? t.radioTextOn : t.radioTextOff;
            el.style.borderColor = t.radioBorder;
        });

        mp.querySelectorAll('[data-menu-infolbl]').forEach(el => {
            el.style.color = t.menuInfo;
        });
        mp.querySelectorAll('[data-menu-infoval]').forEach(el => {
            el.style.color = t.menuInfoVal;
        });

        const statusEl = document.getElementById('radarInfo_apistatus');
        if (statusEl && statusEl.dataset.statusOk === 'true') {
            statusEl.style.color = t.menuStatus;
        }
    }

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
    width:${radarSize}px; height:${radarSize}px;
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
    <span id="rangeVal" style="font:bold ${UI.rangeBoxFont}px ${FONT_SANS};text-shadow:0 0 5px rgba(0,255,0,0.6)">${(radarRange/1000).toFixed(1)} km</span>
    <span style="font:11px ${FONT_SANS};opacity:.8;margin-top:2px">RANGE</span>
`;
document.body.appendChild(rangeBox);

function updateRangeBox() {
    const el = document.getElementById('rangeVal');
    if (!el) return;
    // Format range label based on distance unit preference
    if (prefs.useNautical) {
        const nm = radarRange / 1852; // metres → nautical miles
        el.textContent = (nm < 10 ? nm.toFixed(1) : Math.round(nm)) + ' NM';
    } else {
        el.textContent = `${(radarRange/1000).toFixed(1)} km`;
    }
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
    font-family:${FONT_MONO};
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
    // Format a distance given in nautical miles
    if (prefs.useNautical) {
        return nm < 10 ? `${nm.toFixed(1)} NM` : `${Math.round(nm)} NM`;
    } else {
        const m = nm * 1852; // nautical miles → metres
        return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`;
    }
}

function fmtDistMetric(meters) {
    // Format a distance given in metres, respecting the nautical/metric pref
    if (prefs.useNautical) {
        const nm = meters / 1852;
        return nm < 10 ? `${nm.toFixed(1)} NM` : `${Math.round(nm)} NM`;
    }
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

let _hudNearestData = null;
let _trackedAc      = null;
let _trackedId      = null;

// ── Chase / Escort state ──────────────────────────
let _chaseActive  = false;          // Chase/escort mode engaged
let _chasePhase   = 'chase';        // 'chase' | 'escort'
let _escortMode   = null;           // null | 'left' | 'right' | 'forward' | 'back'
let _escortDistNm = 0.5;            // Target escort distance in NM (slider value)
let _chasePid     = { integral: 0, prevError: 0, lastTime: 0 }; // Speed PID state
let _headingPid   = { integral: 0, prevError: 0, lastTime: 0 }; // Lateral heading PID state

// ── AP command-state (used to throttle API + DOM calls) ──
let _apLastHdg     = -999;   // last heading sent to AP (deg); -999 = uninitialised
let _apLastSpd     = -1;     // last speed sent to AP (kts)
let _apLastAlt     = -9e9;   // last altitude sent to AP (ft)
let _apUiSync      = 0;      // timestamp of last AP bar DOM sync
let _apAirbrakesOn = false;  // current airbrake deployment state
let _apLastEngageAttempt = 0; // timestamp of last _apEnable() call (debounce guard)

function stopTracking() {
    _apSetAirbrakes(false);   // always retract airbrakes when tracking ends
    _trackedAc     = null;
    _trackedId     = null;
    activePopupCs  = null;
    _lastNearestCs = null;
    _chaseActive   = false;
    _chasePhase    = 'chase';
    _escortMode    = null;
    _chasePid      = { integral: 0, prevError: 0, lastTime: 0 };
    _headingPid    = { integral: 0, prevError: 0, lastTime: 0 };
    _apLastHdg          = -999;
    _apLastSpd          = -1;
    _apLastAlt          = -9e9;
    _apLastEngageAttempt = 0;
}

function refreshTracked() {
    if (!_trackedId) return null;
    const fresh = aircraftListCache.find(a => a.id === _trackedId);
    if (fresh) _trackedAc = fresh;
    return _trackedAc;
}

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
    // ILS takes priority — hide nearest HUD while ILS is active
    if (_ilsActive) {
        nearestHUD.style.display = 'none';
        _hudNearestData = null;
        return;
    }

    const t = T();
    const displayAc  = _trackedAc || nearest;
    const isTracking = !!_trackedAc;

    if (!settings.showNearestHUD || !displayAc) {
        nearestHUD.style.display = 'none';
        _hudNearestData = null;
        return;
    }

    _hudNearestData = { nearest: displayAc, myData };
    nearestHUD.style.display    = 'block';
    nearestHUD.style.pointerEvents = 'auto';

    const cs  = displayAc.cs && displayAc.cs !== 'Foo' ? displayAc.cs : `Foo #${displayAc.id || '???'}`;
    const { distStr, brgStr } = _hudDistBrg(myData, displayAc);

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
        altDeltaStr = ` <span style="color:${col};font-size:${UI.hudAltDeltaFont}px">${sign}${Math.abs(delta).toLocaleString()} ft</span>`;
    }
    const altStr = nearAl !== null ? (fmtAlt(nearAl) ?? '–') : '–';

    const nearSpdRaw = isFinite(parseFloat(displayAc.s))
        ? parseFloat(displayAc.s)
        : (typeof displayAc._computedSpd === 'number' && isFinite(displayAc._computedSpd)
            ? displayAc._computedSpd : null);
    const spdStr = nearSpdRaw !== null ? (fmtSpd(nearSpdRaw) ?? '–') : '–';
    const hdgStr = fmtHdg(displayAc.h);

    const trackBorder = isTracking ? 'rgba(255,200,60,0.55)' : t.hudBorder;
    const trackGlow   = isTracking ? ', 0 0 14px rgba(255,180,30,0.2)' : '';
    const headerDot   = isTracking ? 'rgba(255,200,60,1)'    : t.hudTitle;
    const headerLabel = isTracking ? 'TRACKING'              : 'NEARBY TRAFFIC';
    const headerColor = isTracking ? 'rgba(255,200,60,0.98)' : t.hudTitle;

    const isolateChecked  = settings.isolateTracked;
    const isolateSwBg     = isolateChecked ? t.switchOn    : t.switchOff;
    const isolateKnobBg   = isolateChecked ? t.knobOn      : t.knobOff;
    const isolateKnobLeft = isolateChecked ? (UI.menuSwitchW - UI.menuKnobSize - 3) : 3;

    const isolateRow = isTracking ? `
  <div style="padding:5px 14px 6px;border-top:1px solid ${t.hudSep};
    display:flex;align-items:center;justify-content:space-between;cursor:pointer;"
    id="radarIsolateRow">
    <span style="color:${t.hudLabel};font-size:${UI.hudIsolateLabelFont}px;letter-spacing:0.5px;">Isolate aircraft</span>
    <div id="radarIsolateSw" style="width:${UI.menuSwitchW}px;height:${UI.menuSwitchH}px;
      border-radius:${UI.menuSwitchH/2}px;position:relative;background:${isolateSwBg};
      border:1px solid ${t.switchBorder};transition:background .2s;flex-shrink:0;">
      <div id="radarIsolateKnob" style="position:absolute;top:${(UI.menuSwitchH-UI.menuKnobSize)/2}px;
        left:${isolateKnobLeft}px;width:${UI.menuKnobSize}px;height:${UI.menuKnobSize}px;
        border-radius:50%;background:${isolateKnobBg};transition:left .2s,background .2s;"></div>
    </div>
  </div>` : '';

    // ── Chase / Escort HUD rows ──────────────────────────────────────────
    const chaseSwBg     = _chaseActive ? t.switchOn    : t.switchOff;
    const chaseKnobBg   = _chaseActive ? t.knobOn      : t.knobOff;
    const chaseKnobLeft = _chaseActive ? (UI.menuSwitchW - UI.menuKnobSize - 3) : 3;
    const chasePhaseLbl = _chasePhase === 'escort' ? 'ESCORTING' : 'CHASING';
    const chasePhaseCol = _chasePhase === 'escort' ? 'rgba(100,220,255,0.95)' : 'rgba(255,200,60,0.95)';

    // Distance slider shown when chase is active
    const escortDistSlider = _chaseActive ? `
  <div style="padding:3px 14px 6px;border-top:1px solid ${t.hudSep};">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
      <span style="color:${t.hudLabel};font-size:${UI.hudIsolateLabelFont}px;">Escort distance</span>
      <span id="radarEscortDistLbl" style="color:rgba(255,200,60,0.95);font-size:${UI.hudIsolateLabelFont}px;font-weight:bold;">${_escortDistNm.toFixed(1)} NM</span>
    </div>
    <input id="radarEscortDistSlider" type="range" min="0.1" max="5.0" step="0.1"
      value="${_escortDistNm}"
      style="width:100%;accent-color:rgba(255,180,30,0.9);margin:0;">
  </div>` : '';

    // Phase label when active
    const chasePhaseRow = _chaseActive ? `
  <div style="padding:2px 14px 4px;text-align:center;">
    <span style="color:${chasePhaseCol};font-size:${UI.hudIsolateLabelFont - 1}px;letter-spacing:1px;font-weight:bold;">● ${chasePhaseLbl}</span>
  </div>` : '';

    // Escort formation arrows — shown in escort phase with a formation selected indicator
    const escortArrowPanel = (_chaseActive && _chasePhase === 'escort') ? (() => {
        const arrowStyle = (mode) => {
            const isActive = _escortMode === mode;
            const bg       = isActive ? 'rgba(100,220,255,0.25)' : 'rgba(0,40,0,0.5)';
            const border   = isActive ? '1.5px solid rgba(100,220,255,0.8)' : `1px solid ${t.hudBorder}`;
            const color    = isActive ? 'rgba(100,220,255,1)' : t.hudLabel;
            return `background:${bg};border:${border};color:${color};`;
        };
        const btnBase = `padding:8px 12px;border-radius:6px;cursor:pointer;font-size:16px;
            transition:all .15s;user-select:none;`;
        return `
  <div style="padding:4px 14px 6px;border-top:1px solid ${t.hudSep};">
    <div style="color:${t.hudLabel};font-size:${UI.hudIsolateLabelFont - 1}px;text-align:center;margin-bottom:5px;letter-spacing:0.5px;">ESCORT POSITION</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:auto auto auto;gap:4px;max-width:140px;margin:0 auto;">
      <div></div>
      <div id="radarEscortFwd" style="${btnBase}${arrowStyle('forward')}text-align:center;" title="Ahead of target">▲</div>
      <div></div>
      <div id="radarEscortLeft" style="${btnBase}${arrowStyle('left')}text-align:center;" title="Left wing">◀</div>
      <div style="display:flex;align-items:center;justify-content:center;color:${t.hudLabel};font-size:10px;letter-spacing:0.5px;">FORM</div>
      <div id="radarEscortRight" style="${btnBase}${arrowStyle('right')}text-align:center;" title="Right wing">▶</div>
      <div></div>
      <div id="radarEscortBack" style="${btnBase}${arrowStyle('back')}text-align:center;" title="Behind target">▼</div>
      <div></div>
    </div>
  </div>`;
    })() : '';

    const chaseRow = isTracking ? `
  <div style="padding:5px 14px 6px;border-top:1px solid ${t.hudSep};
    display:flex;align-items:center;justify-content:space-between;cursor:pointer;"
    id="radarChaseRow">
    <span style="color:${t.hudLabel};font-size:${UI.hudIsolateLabelFont}px;letter-spacing:0.5px;">Chase / Escort Player</span>
    <div id="raderChaseSw" style="width:${UI.menuSwitchW}px;height:${UI.menuSwitchH}px;
      border-radius:${UI.menuSwitchH/2}px;position:relative;background:${chaseSwBg};
      border:1px solid ${t.switchBorder};transition:background .2s;flex-shrink:0;">
      <div id="radarChaseKnob" style="position:absolute;top:${(UI.menuSwitchH-UI.menuKnobSize)/2}px;
        left:${chaseKnobLeft}px;width:${UI.menuKnobSize}px;height:${UI.menuKnobSize}px;
        border-radius:50%;background:${chaseKnobBg};transition:left .2s,background .2s;"></div>
    </div>
  </div>
  ${chasePhaseRow}
  ${escortDistSlider}
  ${escortArrowPanel}` : '';

    const stopBtn = isTracking ? `
  <div style="padding:4px 14px 8px;">
    <button id="radarStopTrackBtn" style="width:100%;padding:6px 0;
      background:${t.hudBg};border:1px solid ${t.hudBorder};border-radius:6px;
      color:${t.hudLabel};font:bold ${UI.hudStopBtnFont}px ${FONT_SANS};
      letter-spacing:1px;cursor:pointer;transition:background .15s;">✕  STOP TRACKING</button>
  </div>` : '';

    const trackBtn = !isTracking ? `
  <div style="padding:4px 14px 8px;border-top:1px solid ${t.hudSep};">
    <button id="radarTrackPlayerBtn" style="width:100%;padding:6px 0;
      background:rgba(60,180,80,0.15);border:1px solid rgba(60,200,80,0.4);border-radius:6px;
      color:rgba(100,230,110,0.95);font:bold ${UI.hudStopBtnFont}px ${FONT_SANS};
      letter-spacing:1px;cursor:pointer;transition:background .15s;">▶  TRACK PLAYER</button>
  </div>` : '';

    nearestHUD.innerHTML = `
<div style="background:${t.hudBg};border:1.5px solid ${trackBorder};border-radius:10px;overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,0.75)${trackGlow};font-family:${FONT_MONO};">
  <div style="padding:9px 14px 7px;border-bottom:1px solid ${t.hudSep};display:flex;align-items:center;gap:8px;">
    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
      background:${headerDot};box-shadow:0 0 6px ${headerDot};flex-shrink:0;"></span>
    <span style="color:${headerColor};font-size:${UI.hudHeaderLabelFont}px;letter-spacing:1.5px;
      text-transform:uppercase;font-weight:bold;">${headerLabel}</span>
  </div>
  <div style="padding:8px 14px 6px;border-bottom:1px solid ${t.hudSep};">
    <div style="color:${t.hudLabel};font-size:${UI.hudSectionLabelFont}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Callsign</div>
    <div style="color:${t.hudValue};font-size:${UI.hudCallsignFont}px;font-weight:bold;letter-spacing:1px">${cs}</div>
  </div>
  <div style="padding:8px 14px 8px;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">
    <div>
      <div style="color:${t.hudLabel};font-size:${UI.hudSectionLabelFont}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Distance</div>
      <div style="color:${t.hudDist};font-size:${UI.hudDataFont}px;font-weight:bold">${distStr}</div>
    </div>
    <div>
      <div style="color:${t.hudLabel};font-size:${UI.hudSectionLabelFont}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Bearing</div>
      <div style="color:${t.hudHdg};font-size:${UI.hudDataFont}px;font-weight:bold">${brgStr}</div>
    </div>
    <div>
      <div style="color:${t.hudLabel};font-size:${UI.hudSectionLabelFont}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Altitude</div>
      <div style="color:${t.hudAlt};font-size:${UI.hudDataFont}px;font-weight:bold">${altStr}${altDeltaStr}</div>
    </div>
    <div>
      <div style="color:${t.hudLabel};font-size:${UI.hudSectionLabelFont}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Speed (GS)</div>
      <div style="color:${t.hudSpeed};font-size:${UI.hudDataFont}px;font-weight:bold">${spdStr}</div>
    </div>
    <div style="grid-column:1/-1">
      <div style="color:${t.hudLabel};font-size:${UI.hudSectionLabelFont}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Heading</div>
      <div style="color:${t.hudHdg};font-size:${UI.hudDataFont}px;font-weight:bold">${hdgStr}</div>
    </div>
  </div>
  ${isolateRow}
  ${chaseRow}
  ${stopBtn}
  ${trackBtn}
</div>`;

    const isolateRowEl = document.getElementById('radarIsolateRow');
    if (isolateRowEl) {
        isolateRowEl.onclick = (e) => {
            e.stopPropagation();
            settings.isolateTracked = !settings.isolateTracked;
            saveSettings();
            updateNearestHUD(_hudNearestData?.nearest ?? null, _hudNearestData?.myData ?? null);
        };
    }
    const stopEl = document.getElementById('radarStopTrackBtn');
    if (stopEl) {
        stopEl.onmouseover = () => stopEl.style.background = T().hudBorder;
        stopEl.onmouseout  = () => stopEl.style.background = T().hudBg;
        stopEl.onclick     = (e) => { e.stopPropagation(); stopTracking(); };
    }

    // ── Track Player button (shown in NEARBY TRAFFIC mode) ──────────────
    const trackPlayerEl = document.getElementById('radarTrackPlayerBtn');
    if (trackPlayerEl) {
        trackPlayerEl.onmouseover = () => trackPlayerEl.style.background = 'rgba(60,180,80,0.3)';
        trackPlayerEl.onmouseout  = () => trackPlayerEl.style.background = 'rgba(60,180,80,0.15)';
        trackPlayerEl.onclick = (e) => {
            e.stopPropagation();
            if (!displayAc) return;
            _trackedAc     = displayAc;
            _trackedId     = displayAc.id;
            activePopupCs  = displayAc.cs;
            _lastHudUpdate = 0;
            _lastNearestCs = null;
            updateNearestHUD(displayAc, myData);
        };
    }

    // ── Chase/Escort toggle ─────────────────────────
    const chaseRowEl = document.getElementById('radarChaseRow');
    if (chaseRowEl) {
        chaseRowEl.onclick = (e) => {
            e.stopPropagation();
            _chaseActive = !_chaseActive;
            if (_chaseActive) {
                // Reset state for fresh chase
                _chasePhase = 'chase';
                _escortMode = null;
                _chasePid   = { integral: 0, prevError: 0, lastTime: 0 };
                _headingPid = { integral: 0, prevError: 0, lastTime: 0 };
                _apLastHdg          = -999;  // force re-command of all values on first tick
                _apLastSpd          = -1;
                _apLastAlt          = -9e9;
                _apLastEngageAttempt = 0;    // allow immediate engage on first tick
            } else {
                _apSetAirbrakes(false);
                _chasePhase = 'chase';
                _escortMode = null;
            }
            _lastHudUpdate = 0;
            _lastNearestCs = null;
            updateNearestHUD(_hudNearestData?.nearest ?? null, _hudNearestData?.myData ?? null);
        };
    }

    // ── Escort distance slider ───────────────────────
    const distSlider = document.getElementById('radarEscortDistSlider');
    if (distSlider) {
        distSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            _escortDistNm = parseFloat(e.target.value);
            const lbl = document.getElementById('radarEscortDistLbl');
            if (lbl) lbl.textContent = _escortDistNm.toFixed(1) + ' NM';
        });
        distSlider.addEventListener('click', e => e.stopPropagation());
    }

    // ── Escort formation arrow buttons ───────────────
    ['forward', 'back', 'left', 'right'].forEach(mode => {
        const el = document.getElementById(`radarEscort${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
        if (!el) return;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            _escortMode = (_escortMode === mode) ? null : mode;
            // Reset PID on mode change
            _chasePid   = { integral: 0, prevError: 0, lastTime: 0 };
            _headingPid = { integral: 0, prevError: 0, lastTime: 0 };
            _lastHudUpdate = 0;
            _lastNearestCs = null;
            updateNearestHUD(_hudNearestData?.nearest ?? null, _hudNearestData?.myData ?? null);
        });
    });
}

function repositionNearestHUD() {
    const rl = parseInt(radarCanvas.style.left) || 5; // Radar left edge
    const rt = parseInt(radarCanvas.style.top)  || 0; // Radar top edge
    const spacing = 5; // Gap in px
    // HUDs appear to the right of radar, below the 40px menu button + spacing
    const hudLeft = rl + radarSize + spacing;
    const hudTop  = rt + 40 + spacing + 5; // Below the menu button (40px) + gap
    nearestHUD.style.left = hudLeft + 'px';
    nearestHUD.style.top  = hudTop  + 'px';
    repositionILSHUD();
    repositionMenu();
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
    btn.onclick = (e) => { e.stopPropagation(); toggleMenu(); };
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'radarMenuPanel';
    panel.style.cssText = `
        position:fixed; width:${UI.menuW}px;
        background:rgba(0,12,0,0.97); border:1.5px solid rgba(0,255,0,0.35);
        border-radius:12px; padding:12px 0 10px;
        z-index:2147483646; display:none;
        box-shadow:0 4px 28px rgba(0,0,0,0.75);
        font-family:${FONT_SANS}; user-select:none;
        height:640px; overflow-y:auto; overflow-x:hidden;
        scrollbar-width:thin;
        scrollbar-color:rgba(0,200,0,0.4) rgba(0,30,0,0.5);
    `;

    const title = document.createElement('div');
    title.dataset.menuTitle = '1';
    title.style.cssText = `
        color:rgba(0,255,0,0.9); font:bold ${UI.menuTitleFont}px ${FONT_SANS};
        text-align:center; padding:2px 14px 10px;
        border-bottom:1px solid rgba(0,255,0,0.18);
        margin-bottom:4px; letter-spacing:1.5px;
    `;
    title.textContent = 'RADAR SETTINGS';
    panel.appendChild(title);

    function addSection(label) {
        const s = document.createElement('div');
        s.dataset.menuSection = '1';
        s.style.cssText = `color:rgba(0,220,0,0.65);font:bold ${UI.menuSectionFont}px ${FONT_SANS};
            padding:10px 16px 3px;letter-spacing:1px;text-transform:uppercase;
            border-top:1px solid rgba(0,255,0,0.08);margin-top:2px;`;
        s.textContent = label;
        panel.appendChild(s);
    }

    function addToggle(label, key, onChange) {
        const row = document.createElement('div');
        row.dataset.menuRow = key;
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px;cursor:pointer;transition:background .15s;`;
        row.onmouseover = () => row.style.background = T().menuRowHover;
        row.onmouseout  = () => row.style.background = '';
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        lbl.textContent = label;
        const sw = document.createElement('div');
        sw.dataset.menuSw = key;
        sw.style.cssText = `width:${UI.menuSwitchW}px;height:${UI.menuSwitchH}px;
            border-radius:${UI.menuSwitchH/2}px;position:relative;
            background:${settings[key] ? 'rgba(0,200,0,0.75)' : 'rgba(80,80,80,0.5)'};
            border:1px solid rgba(0,255,0,0.3);transition:background .2s;flex-shrink:0;`;
        const knobOff = 3, knobOn = UI.menuSwitchW - UI.menuKnobSize - 3;
        const knob = document.createElement('div');
        knob.dataset.menuKnob = key;
        knob.style.cssText = `position:absolute;top:${(UI.menuSwitchH-UI.menuKnobSize)/2}px;
            left:${settings[key] ? knobOn : knobOff}px;
            width:${UI.menuKnobSize}px;height:${UI.menuKnobSize}px;border-radius:50%;
            background:${settings[key] ? '#0f0' : '#888'};transition:left .2s,background .2s;`;
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
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px;`;
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};flex:1;`;
        lbl.textContent = label;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:5px;';
        [opt1, opt2].forEach((opt, i) => {
            const b = document.createElement('button');
            b.id = `radarRadio_${key}_${opt}`;
            b.dataset.radioKey = key;
            b.dataset.radioOpt = opt;
            b.textContent = [label1, label2][i];
            b.style.cssText = `padding:4px 10px;font:bold ${UI.menuRadioFont}px ${FONT_SANS};
                border-radius:5px;cursor:pointer;border:1px solid rgba(0,255,0,0.3);
                transition:all .15s;
                background:${settings[key]===opt ? 'rgba(0,180,0,0.5)' : 'rgba(0,40,0,0.5)'};
                color:${settings[key]===opt ? '#0f0' : 'rgba(150,200,150,0.7)'};`;
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
        s.style.cssText = 'border-top:1px solid rgba(0,255,0,0.1);margin:4px 0;';
        panel.appendChild(s);
    }

    function addInfoRow(label, idSuffix) {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:5px 16px;`;
        const lbl = document.createElement('span');
        lbl.dataset.menuInfolbl = '1';
        lbl.style.cssText = `color:rgba(150,200,150,0.7);font:${UI.menuInfoFont}px ${FONT_SANS};`;
        lbl.textContent = label;
        const val = document.createElement('span');
        val.id = `radarInfo_${idSuffix}`;
        val.dataset.menuInfoval = '1';
        val.style.cssText = `color:rgba(0,255,0,0.9);font:bold ${UI.menuInfoFont}px ${FONT_MONO};text-align:right;max-width:155px;word-break:break-all;`;
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
        val.style.cssText = `color:rgba(0,200,0,0.8);font:${UI.menuInfoFont-1}px ${FONT_MONO};word-break:break-all;`;
        val.textContent = 'Waiting for data…';
        row.appendChild(val);
        panel.appendChild(row);
    }

    function addPrefRow(opts) {
        const { label, get, set, fmt, min, max, step, onCommit } = opts;
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
            padding:${UI.menuRowPadY-1}px 16px;gap:6px;`;
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};flex:1;min-width:0;`;
        lbl.textContent = label;
        const valWrap = document.createElement('div');
        valWrap.style.cssText = `position:relative;flex-shrink:0;`;
        const valSpan = document.createElement('span');
        valSpan.style.cssText = `display:inline-block;min-width:64px;text-align:center;
            color:rgba(0,255,0,0.95);font:bold ${UI.menuRowFont}px ${FONT_MONO};
            background:rgba(0,40,0,0.6);border:1px solid rgba(0,255,0,0.3);
            border-radius:5px;padding:2px 6px;cursor:text;transition:border-color .15s;`;
        valSpan.textContent = fmt(get());
        valSpan.title = 'Click to type a value';
        const valInput = document.createElement('input');
        valInput.type = 'number';
        valInput.style.cssText = `display:none;width:64px;text-align:center;
            color:rgba(0,255,0,0.95);font:bold ${UI.menuRowFont}px ${FONT_MONO};
            background:rgba(0,40,0,0.85);border:1px solid rgba(0,255,0,0.7);
            border-radius:5px;padding:2px 4px;outline:none;-moz-appearance:textfield;`;
        valInput.min = min; valInput.max = max; valInput.step = step;
        function commitInput() {
            let v = parseFloat(valInput.value);
            if (!isFinite(v)) v = get();
            v = Math.max(min, Math.min(max, Math.round(v / step) * step));
            set(v);
            valSpan.textContent = fmt(get());
            valInput.style.display = 'none';
            valSpan.style.display = 'inline-block';
            if (onCommit) onCommit();
        }
        valSpan.addEventListener('click', () => {
            valInput.value = get();
            valSpan.style.display = 'none';
            valInput.style.display = 'inline-block';
            valInput.focus(); valInput.select();
        });
        valInput.addEventListener('blur', commitInput);
        valInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); commitInput(); }
            if (e.key === 'Escape') { valInput.style.display = 'none'; valSpan.style.display = 'inline-block'; }
        });
        valWrap.appendChild(valSpan); valWrap.appendChild(valInput);
        function makeBtn(lbl) {
            const b = document.createElement('button');
            b.textContent = lbl;
            b.style.cssText = `width:26px;height:26px;border-radius:5px;flex-shrink:0;
                background:rgba(0,60,0,0.7);color:rgba(0,255,0,0.9);
                border:1px solid rgba(0,255,0,0.3);font:bold 15px ${FONT_SANS};
                cursor:pointer;display:flex;align-items:center;justify-content:center;
                transition:background .12s;line-height:1;`;
            b.onmouseover = () => b.style.background = 'rgba(0,100,0,0.8)';
            b.onmouseout  = () => b.style.background = 'rgba(0,60,0,0.7)';
            return b;
        }
        const btnMinus = makeBtn('−');
        const btnPlus  = makeBtn('+');
        btnMinus.onclick = () => { const v = Math.max(min, get()-step); set(v); valSpan.textContent = fmt(get()); if (onCommit) onCommit(); };
        btnPlus.onclick  = () => { const v = Math.min(max, get()+step); set(v); valSpan.textContent = fmt(get()); if (onCommit) onCommit(); };
        row.appendChild(lbl); row.appendChild(btnMinus); row.appendChild(valWrap); row.appendChild(btnPlus);
        panel.appendChild(row);
        return { row, valSpan, valInput };
    }

    // ── addSlider helper ─────────────────────────────
    function addSlider(opts) {
        // opts: { label, get, set, min, max, step, fmt, onCommit }
        const { label, get, set, min, max, step, fmt, onCommit } = opts;
        const row = document.createElement('div');
        row.style.cssText = `padding:${UI.menuRowPadY-1}px 16px 2px;`;
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;';
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        lbl.textContent = label;
        const valSpan = document.createElement('span');
        valSpan.style.cssText = `color:rgba(0,255,0,0.95);font:bold ${UI.menuRowFont}px ${FONT_MONO};
            min-width:52px;text-align:right;`;
        valSpan.textContent = fmt(get());
        topRow.appendChild(lbl); topRow.appendChild(valSpan);
        const slider = document.createElement('input');
        slider.type  = 'range';
        slider.min   = min; slider.max = max; slider.step = step;
        slider.value = get();
        slider.style.cssText = `width:100%;margin:0;accent-color:rgba(0,200,0,0.8);`;
        slider.addEventListener('input', () => {
            set(parseFloat(slider.value));
            valSpan.textContent = fmt(get());
            if (onCommit) onCommit();
        });
        row.appendChild(topRow); row.appendChild(slider);
        panel.appendChild(row);
        return { row, slider, valSpan };
    }

    // ── Dual-handle range slider helper ─────────────
    function addRangeSlider(opts) {
        // opts: { label, getMin, setMin, getMax, setMax, absMin, absMax, step, fmt, onCommit }
        const { label, getMin, setMin, getMax, setMax, absMin, absMax, step, fmt, onCommit } = opts;
        const wrap = document.createElement('div');
        wrap.style.cssText = `padding:${UI.menuRowPadY-1}px 16px 6px;`;

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        lbl.textContent = label;
        const valSpan = document.createElement('span');
        valSpan.style.cssText = `color:rgba(0,255,0,0.95);font:bold ${UI.menuRowFont}px ${FONT_MONO};min-width:90px;text-align:right;`;
        function updateLabel() { valSpan.textContent = fmt(getMin()) + ' – ' + fmt(getMax()); }
        updateLabel();
        header.appendChild(lbl); header.appendChild(valSpan);

        // Two overlapping range inputs for dual handle
        const trackWrap = document.createElement('div');
        trackWrap.style.cssText = 'position:relative;height:20px;';

        const sMin = document.createElement('input');
        sMin.type='range'; sMin.min=absMin; sMin.max=absMax; sMin.step=step; sMin.value=getMin();
        sMin.style.cssText = `position:absolute;width:100%;pointer-events:none;accent-color:rgba(0,200,0,0.8);`;
        sMin.style.appearance = 'none';

        const sMax = document.createElement('input');
        sMax.type='range'; sMax.min=absMin; sMax.max=absMax; sMax.step=step; sMax.value=getMax();
        sMax.style.cssText = `position:absolute;width:100%;pointer-events:none;accent-color:rgba(0,200,0,0.8);`;
        sMax.style.appearance = 'none';

        // Custom styling for dual range — show both thumbs
        const style = document.createElement('style');
        style.textContent = `
            .radar-dual-range input[type=range] { -webkit-appearance:none; background:transparent; }
            .radar-dual-range input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; pointer-events:all; width:14px; height:14px; border-radius:50%; background:rgba(0,220,0,0.9); border:2px solid #0f0; cursor:pointer; }
            .radar-dual-range input[type=range]::-moz-range-thumb { pointer-events:all; width:14px; height:14px; border-radius:50%; background:rgba(0,220,0,0.9); border:2px solid #0f0; cursor:pointer; }
            .radar-dual-track { height:4px; background:rgba(0,60,0,0.8); border:1px solid rgba(0,200,0,0.3); border-radius:2px; margin-bottom:4px; }
        `;
        if (!document.getElementById('radarDualRangeStyle')) { style.id='radarDualRangeStyle'; document.head.appendChild(style); }

        trackWrap.classList.add('radar-dual-range');
        trackWrap.appendChild(sMin); trackWrap.appendChild(sMax);

        sMin.addEventListener('input', () => {
            let v = parseFloat(sMin.value);
            if (v >= parseFloat(sMax.value)) v = parseFloat(sMax.value) - step;
            v = Math.max(absMin, v); setMin(v); sMin.value = v;
            updateLabel(); if (onCommit) onCommit();
        });
        sMax.addEventListener('input', () => {
            let v = parseFloat(sMax.value);
            if (v <= parseFloat(sMin.value)) v = parseFloat(sMin.value) + step;
            v = Math.min(absMax, v); setMax(v); sMax.value = v;
            updateLabel(); if (onCommit) onCommit();
        });

        wrap.appendChild(header); wrap.appendChild(trackWrap);
        panel.appendChild(wrap);
    }

    // ── Display ──────────────────────────────────────
    addSection('🖥️  Display');
    addToggle('Night Mode',               'nightMode',        () => applyTheme());
    addRadio ('Orientation',              'orientMode',       'north', 'track', 'N↑', 'TRK↑');
    addToggle('Player Triangle',          'showPlayerTriangle');
    addToggle('Range Rings',              'showRings');
    addToggle('Ring Labels',              'showRingLabels');
    addSep();

    // ── Traffic ───────────────────────────────────────
    addSection('✈️  Traffic');
    addToggle('Show Traffic',             'showTraffic');
    addToggle('Traffic Triangles',        'showBlipTriangle');
    addToggle('Callsign',                 'showCallsign');
    addToggle('Altitude',                 'showAltitude');
    addToggle('Speed',                    'showSpeed');
    addToggle('Distance',                 'showBlipDist');
    addToggle('Heading Vectors',          'showVectors');
    addToggle('Tracking / Nearby Traffic','showNearestHUD', (v) => {
        if (!v) nearestHUD.style.display = 'none';
    });
    addSep();

    // ── Filters ───────────────────────────────────────
    addSection('🔍  Filters');
    // Hide Foo players toggle
    {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px;cursor:pointer;transition:background .15s;`;
        row.onmouseover = () => row.style.background = T().menuRowHover;
        row.onmouseout  = () => row.style.background = '';
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        lbl.textContent = 'Hide "Foo" Players';  // Hides aircraft with callsign Foo
        const sw = document.createElement('div');
        const knobOff = 3, knobOn = UI.menuSwitchW - UI.menuKnobSize - 3;
        sw.style.cssText = `width:${UI.menuSwitchW}px;height:${UI.menuSwitchH}px;
            border-radius:${UI.menuSwitchH/2}px;position:relative;
            background:${prefs.hideFooPlayers ? 'rgba(0,200,0,0.75)' : 'rgba(80,80,80,0.5)'};
            border:1px solid rgba(0,255,0,0.3);transition:background .2s;flex-shrink:0;`;
        const knob = document.createElement('div');
        knob.style.cssText = `position:absolute;top:${(UI.menuSwitchH-UI.menuKnobSize)/2}px;
            left:${prefs.hideFooPlayers ? knobOn : knobOff}px;
            width:${UI.menuKnobSize}px;height:${UI.menuKnobSize}px;border-radius:50%;
            background:${prefs.hideFooPlayers ? '#0f0' : '#888'};transition:left .2s,background .2s;`;
        sw.appendChild(knob); row.appendChild(lbl); row.appendChild(sw);
        row.onclick = () => {
            prefs.hideFooPlayers = !prefs.hideFooPlayers;
            const t = T();
            sw.style.background   = prefs.hideFooPlayers ? t.switchOn  : t.switchOff;
            knob.style.left       = prefs.hideFooPlayers ? knobOn+'px' : knobOff+'px';
            knob.style.background = prefs.hideFooPlayers ? t.knobOn    : t.knobOff;
            savePrefs();
        };
        panel.appendChild(row);
    }
    // Hide ground players toggle
    {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px;cursor:pointer;transition:background .15s;`;
        row.onmouseover = () => row.style.background = T().menuRowHover;
        row.onmouseout  = () => row.style.background = '';
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        lbl.textContent = 'Hide Ground Traffic'; // Hides aircraft with very low altitude
        const sw = document.createElement('div');
        const knobOff = 3, knobOn = UI.menuSwitchW - UI.menuKnobSize - 3;
        sw.style.cssText = `width:${UI.menuSwitchW}px;height:${UI.menuSwitchH}px;
            border-radius:${UI.menuSwitchH/2}px;position:relative;
            background:${prefs.hideGroundPlayers ? 'rgba(0,200,0,0.75)' : 'rgba(80,80,80,0.5)'};
            border:1px solid rgba(0,255,0,0.3);transition:background .2s;flex-shrink:0;`;
        const knob = document.createElement('div');
        knob.style.cssText = `position:absolute;top:${(UI.menuSwitchH-UI.menuKnobSize)/2}px;
            left:${prefs.hideGroundPlayers ? knobOn : knobOff}px;
            width:${UI.menuKnobSize}px;height:${UI.menuKnobSize}px;border-radius:50%;
            background:${prefs.hideGroundPlayers ? '#0f0' : '#888'};transition:left .2s,background .2s;`;
        sw.appendChild(knob); row.appendChild(lbl); row.appendChild(sw);
        row.onclick = () => {
            prefs.hideGroundPlayers = !prefs.hideGroundPlayers;
            const t = T();
            sw.style.background   = prefs.hideGroundPlayers ? t.switchOn  : t.switchOff;
            knob.style.left       = prefs.hideGroundPlayers ? knobOn+'px' : knobOff+'px';
            knob.style.background = prefs.hideGroundPlayers ? t.knobOn    : t.knobOff;
            savePrefs();
        };
        panel.appendChild(row);
    }

    // ── Altitude Range Filter ─────────────────────────
    addToggle('Altitude Filter', 'altFilterEnabled');
    {
        const ALT_MIN = 0, ALT_MAX = 60000, STEP = 500;
        const SLIDER_H = 30, PAD = 12, THUMB_R = 7;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:2px 16px 8px;';
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:4px;';
        const lblL = document.createElement('span');
        lblL.style.cssText = `color:rgba(180,240,180,0.7);font:${UI.menuRowFont-1}px ${FONT_SANS};`;
        const lblR = document.createElement('span');
        lblR.style.cssText = `color:rgba(180,240,180,0.7);font:${UI.menuRowFont-1}px ${FONT_SANS};`;
        const fmtAlt = v => v >= 1000 ? (v/1000).toFixed(0)+'k ft' : v+' ft';
        const updateAltLabels = () => { lblL.textContent = fmtAlt(prefs.altFilterMinFt); lblR.textContent = fmtAlt(prefs.altFilterMaxFt); };
        updateAltLabels();
        labelRow.appendChild(lblL); labelRow.appendChild(lblR);
        wrap.appendChild(labelRow);
        const cv = document.createElement('canvas');
        cv.height = SLIDER_H;
        cv.style.cssText = 'width:100%;display:block;cursor:pointer;';
        wrap.appendChild(cv);
        panel.appendChild(wrap);
        const drawAltSlider = () => {
            const W = cv.offsetWidth || 200; cv.width = W;
            const cw = W - PAD*2, cy2 = SLIDER_H/2;
            const ctx2 = cv.getContext('2d');
            ctx2.clearRect(0,0,W,SLIDER_H);
            const v2x = v => PAD + ((v-ALT_MIN)/(ALT_MAX-ALT_MIN))*cw;
            const minX = v2x(prefs.altFilterMinFt), maxX = v2x(prefs.altFilterMaxFt);
            ctx2.beginPath(); ctx2.moveTo(PAD,cy2); ctx2.lineTo(PAD+cw,cy2);
            ctx2.strokeStyle='rgba(0,60,0,0.9)'; ctx2.lineWidth=4; ctx2.stroke();
            ctx2.beginPath(); ctx2.moveTo(minX,cy2); ctx2.lineTo(maxX,cy2);
            ctx2.strokeStyle='rgba(0,210,60,0.9)'; ctx2.lineWidth=4; ctx2.stroke();
            [minX,maxX].forEach(x => {
                ctx2.beginPath(); ctx2.arc(x,cy2,THUMB_R,0,Math.PI*2);
                ctx2.fillStyle='rgba(0,220,60,0.95)'; ctx2.fill();
                ctx2.strokeStyle='rgba(255,255,255,0.9)'; ctx2.lineWidth=1.5; ctx2.stroke();
            });
        };
        let altDrag = null;
        cv.addEventListener('mousedown', e => {
            const rect = cv.getBoundingClientRect(), cw = rect.width-PAD*2;
            const cx2 = e.clientX-rect.left;
            const v2x = v => PAD+((v-ALT_MIN)/(ALT_MAX-ALT_MIN))*cw;
            altDrag = Math.abs(cx2-v2x(prefs.altFilterMinFt)) <= Math.abs(cx2-v2x(prefs.altFilterMaxFt)) ? 'min' : 'max';
        });
        window.addEventListener('mousemove', e => {
            if (!altDrag) return;
            const rect = cv.getBoundingClientRect(), cw = rect.width-PAD*2;
            const frac = Math.max(0,Math.min(1,(e.clientX-rect.left-PAD)/cw));
            const v = Math.round((ALT_MIN+frac*(ALT_MAX-ALT_MIN))/STEP)*STEP;
            if (altDrag==='min') prefs.altFilterMinFt = Math.min(v, prefs.altFilterMaxFt-STEP);
            else prefs.altFilterMaxFt = Math.max(v, prefs.altFilterMinFt+STEP);
            updateAltLabels(); drawAltSlider();
        });
        window.addEventListener('mouseup', () => { if(altDrag){altDrag=null;savePrefs();} });
        new ResizeObserver(drawAltSlider).observe(cv);
        drawAltSlider();
    }
    addSep();

    // ── Map ───────────────────────────────────────────
    addSection('🗺️  Map');
    addToggle('Airports & Runways',       'showAirports');
    addSep();

    // ── My Aircraft ───────────────────────────────────
    addSection('🛩️  My Aircraft');
    addInfoRow('Callsign', 'callsign');
    addInfoRow('Position', 'position');
    addToggle('Show My Callsign',         'showMyCallsign');
    // Trail toggle
    {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px;cursor:pointer;transition:background .15s;`;
        row.onmouseover = () => row.style.background = T().menuRowHover;
        row.onmouseout  = () => row.style.background = '';
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        lbl.textContent = 'Show My Trail';  // Draws own position history on radar
        const sw = document.createElement('div');
        const knobOff = 3, knobOn = UI.menuSwitchW - UI.menuKnobSize - 3;
        sw.style.cssText = `width:${UI.menuSwitchW}px;height:${UI.menuSwitchH}px;
            border-radius:${UI.menuSwitchH/2}px;position:relative;
            background:${prefs.showTrail ? 'rgba(0,200,0,0.75)' : 'rgba(80,80,80,0.5)'};
            border:1px solid rgba(0,255,0,0.3);transition:background .2s;flex-shrink:0;`;
        const knob = document.createElement('div');
        knob.style.cssText = `position:absolute;top:${(UI.menuSwitchH-UI.menuKnobSize)/2}px;
            left:${prefs.showTrail ? knobOn : knobOff}px;
            width:${UI.menuKnobSize}px;height:${UI.menuKnobSize}px;border-radius:50%;
            background:${prefs.showTrail ? '#0f0' : '#888'};transition:left .2s,background .2s;`;
        sw.appendChild(knob); row.appendChild(lbl); row.appendChild(sw);
        row.onclick = () => {
            prefs.showTrail = !prefs.showTrail;
            const t = T();
            sw.style.background   = prefs.showTrail ? t.switchOn  : t.switchOff;
            knob.style.left       = prefs.showTrail ? knobOn+'px' : knobOff+'px';
            knob.style.background = prefs.showTrail ? t.knobOn    : t.knobOff;
            savePrefs();
        };
        panel.appendChild(row);
    }
    addSlider({ label:'Trail Length',
        get:()=>prefs.trailLengthSec, set:v=>{prefs.trailLengthSec=v;},
        fmt:v=>v+'s', min:10, max:300, step:10, onCommit:savePrefs });
    addSep();

    // ── Radar Preferences ────────────────────────────
    addSection('⚙️  Radar Settings');

    // ── Distance Unit — 3-way radio (km/m | NM) ─────
    {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px;`;
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};flex:1;`;
        lbl.textContent = 'Distance Unit'; // Controls whether distances show as km/m or NM
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:5px;';
        [['km / m', false], ['NM', true]].forEach(([label, isNm]) => {
            const b = document.createElement('button');
            b.textContent = label;
            const isActive = () => prefs.useNautical === isNm;
            const t = T();
            b.style.cssText = `padding:4px 10px;font:bold ${UI.menuRadioFont}px ${FONT_SANS};
                border-radius:5px;cursor:pointer;border:1px solid rgba(0,255,0,0.3);
                transition:all .15s;
                background:${isActive() ? 'rgba(0,180,0,0.5)' : 'rgba(0,40,0,0.5)'};
                color:${isActive() ? '#0f0' : 'rgba(150,200,150,0.7)'};`;
            b.onclick = () => {
                prefs.useNautical = isNm;
                wrap.querySelectorAll('button').forEach((btn, i) => {
                    const active = prefs.useNautical === [false, true][i];
                    const tc = T();
                    btn.style.background  = active ? tc.radioBtnOn  : tc.radioBtnOff;
                    btn.style.color       = active ? tc.radioTextOn : tc.radioTextOff;
                    btn.style.borderColor = tc.radioBorder;
                });
                savePrefs(); updateRangeBox();
            };
            wrap.appendChild(b);
        });
        row.appendChild(lbl); row.appendChild(wrap);
        panel.appendChild(row);
    }

    // ── Radar Size — slider ───────────────────────────
    addSlider({
        label:    'Radar Size',                             // Radar canvas diameter in pixels
        get:      () => prefs.radarSizePx,
        set:      v  => { prefs.radarSizePx = Math.round(v / 10) * 10; }, // Snap to 10px
        fmt:      v  => Math.round(v / 10) * 10 + ' px',
        min: 150, max: 900, step: 10,
        onCommit: applyPrefs,
    });

    // ── Dual-handle range slider for Min/Max range with connecting line ────
    {
        const opts = {
            label: 'Range Bounds',              // Controls both min and max radar zoom range
            getMin: () => prefs.minRangeKm,
            setMin: v  => { prefs.minRangeKm = v; },
            getMax: () => prefs.maxRangeKm,
            setMax: v  => { prefs.maxRangeKm = v; },
            absMin: 0.5, absMax: 100, step: 0.5,
            fmt:  v => v.toFixed(v < 10 ? 1 : 0) + ' km',
            onCommit: applyPrefs,
        };

        const { label, getMin, setMin, getMax, setMax, absMin, absMax, step, fmt, onCommit } = opts;
        const wrap = document.createElement('div');
        wrap.style.cssText = `padding:${UI.menuRowPadY-1}px 16px 8px;`;

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
        const hLbl = document.createElement('span');
        hLbl.dataset.menuRowlbl = '1';
        hLbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        hLbl.textContent = label;
        const valSpanR = document.createElement('span');
        valSpanR.style.cssText = `color:rgba(0,255,0,0.95);font:bold ${UI.menuRowFont}px ${FONT_MONO};min-width:100px;text-align:right;`;
        function updateRLabel() { valSpanR.textContent = fmt(getMin()) + ' – ' + fmt(getMax()); }
        updateRLabel();
        header.appendChild(hLbl); header.appendChild(valSpanR);

        // Canvas-based dual thumb slider with a line between the two dots
        const SLIDER_H = 28;      // Canvas height in pixels
        const SLIDER_W_PAD = 10;  // Horizontal padding so thumb doesn't clip edge
        const THUMB_R = 7;        // Thumb circle radius
        const TRACK_Y = SLIDER_H / 2; // Vertical centre of track

        const sliderCanvas = document.createElement('canvas');
        sliderCanvas.height = SLIDER_H;
        sliderCanvas.style.cssText = 'width:100%;display:block;cursor:pointer;';
        // Set actual pixel width after appending (so offsetWidth is available)

        function valToFrac(v) { return (v - absMin) / (absMax - absMin); } // 0–1 fraction
        function fracToVal(f) { return Math.round((absMin + f * (absMax - absMin)) / step) * step; }

        let _dragging = null; // 'min' | 'max' | null — which thumb is being dragged

        function drawRangeCanvas() {
            const W = sliderCanvas.width;
            const sc = sliderCanvas.getContext('2d');
            sc.clearRect(0, 0, W, SLIDER_H);
            const minX = SLIDER_W_PAD + valToFrac(getMin()) * (W - SLIDER_W_PAD * 2);
            const maxX = SLIDER_W_PAD + valToFrac(getMax()) * (W - SLIDER_W_PAD * 2);

            // Full track background
            sc.strokeStyle = 'rgba(0,60,0,0.8)'; sc.lineWidth = 4;
            sc.beginPath(); sc.moveTo(SLIDER_W_PAD, TRACK_Y); sc.lineTo(W - SLIDER_W_PAD, TRACK_Y); sc.stroke();

            // Active range line between the two thumbs
            sc.strokeStyle = 'rgba(0,220,0,0.7)'; sc.lineWidth = 4;
            sc.beginPath(); sc.moveTo(minX, TRACK_Y); sc.lineTo(maxX, TRACK_Y); sc.stroke();

            // Min thumb
            sc.beginPath(); sc.arc(minX, TRACK_Y, THUMB_R, 0, Math.PI * 2);
            sc.fillStyle = _dragging === 'min' ? '#fff' : 'rgba(0,220,0,0.95)';
            sc.fill();
            sc.strokeStyle = '#0f0'; sc.lineWidth = 2; sc.stroke();

            // Max thumb
            sc.beginPath(); sc.arc(maxX, TRACK_Y, THUMB_R, 0, Math.PI * 2);
            sc.fillStyle = _dragging === 'max' ? '#fff' : 'rgba(0,220,0,0.95)';
            sc.fill();
            sc.strokeStyle = '#0f0'; sc.lineWidth = 2; sc.stroke();
        }

        function clientXToVal(e) {
            const rect = sliderCanvas.getBoundingClientRect();
            const W = sliderCanvas.width;
            const scale = W / rect.width; // account for CSS width vs canvas pixel width
            const x = (e.clientX - rect.left) * scale;
            const f = Math.max(0, Math.min(1, (x - SLIDER_W_PAD) / (W - SLIDER_W_PAD * 2)));
            return fracToVal(f);
        }

        sliderCanvas.addEventListener('mousedown', (e) => {
            const rect = sliderCanvas.getBoundingClientRect();
            const W = sliderCanvas.width;
            const scale = W / rect.width;
            const x = (e.clientX - rect.left) * scale;
            const minX = SLIDER_W_PAD + valToFrac(getMin()) * (W - SLIDER_W_PAD * 2);
            const maxX = SLIDER_W_PAD + valToFrac(getMax()) * (W - SLIDER_W_PAD * 2);
            const dMin = Math.abs(x - minX), dMax = Math.abs(x - maxX);
            _dragging = dMin <= dMax ? 'min' : 'max'; // Pick closer thumb
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!_dragging) return;
            let v = clientXToVal(e);
            if (_dragging === 'min') {
                v = Math.min(v, getMax() - step);
                setMin(Math.max(absMin, v));
            } else {
                v = Math.max(v, getMin() + step);
                setMax(Math.min(absMax, v));
            }
            updateRLabel(); drawRangeCanvas();
        });
        document.addEventListener('mouseup', () => {
            if (_dragging) { _dragging = null; drawRangeCanvas(); if (onCommit) onCommit(); }
        });

        // Resize observer to set canvas pixel width
        const ro = new ResizeObserver(() => {
            sliderCanvas.width = sliderCanvas.offsetWidth || 220;
            drawRangeCanvas();
        });

        wrap.appendChild(header); wrap.appendChild(sliderCanvas);
        panel.appendChild(wrap);

        // Draw after insert (width known)
        setTimeout(() => {
            sliderCanvas.width = sliderCanvas.offsetWidth || 220;
            ro.observe(sliderCanvas);
            drawRangeCanvas();
        }, 0);
    }

    // ── Scroll Step — slider ──────────────────────────
    addSlider({
        label:    'Scroll Step',                            // Range change per mouse wheel tick
        get:      () => prefs.scrollIncKm,
        set:      v  => { prefs.scrollIncKm = v; },
        fmt:      v  => v.toFixed(1) + ' km',
        min: 0.5, max: 10, step: 0.5,
        onCommit: applyPrefs,
    });

    // ── Update Delay — slider ─────────────────────────
    addSlider({
        label:    'Update Delay',                           // REST API poll interval (ms)
        get:      () => prefs.fetchDelay,
        set:      v  => { prefs.fetchDelay = v; },
        fmt:      v  => v + ' ms',
        min: 50, max: 1000, step: 50,
        onCommit: applyPrefs,
    });

    // ── Radar Opacity slider — value is persisted and maintained permanently ─
    {
        const row = document.createElement('div');
        row.style.cssText = `padding:${UI.menuRowPadY-1}px 16px 2px;`;
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;';
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        lbl.textContent = 'Radar Opacity'; // Radar canvas transparency — saved permanently
        const valSpan = document.createElement('span');
        valSpan.style.cssText = `color:rgba(0,255,0,0.95);font:bold ${UI.menuRowFont}px ${FONT_MONO};min-width:52px;text-align:right;`;
        valSpan.textContent = Math.round((prefs.radarOpacity ?? 1) * 100) + '%';
        topRow.appendChild(lbl); topRow.appendChild(valSpan);
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = 0.1; slider.max = 1.0; slider.step = 0.05;
        slider.value = prefs.radarOpacity ?? 1;
        slider.style.cssText = `width:100%;margin:0;accent-color:rgba(0,200,0,0.8);`;
        // Every movement immediately saves and applies the opacity
        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            prefs.radarOpacity = v;               // Persist to prefs immediately
            radarCanvas.style.opacity = v;         // Apply to canvas immediately
            valSpan.textContent = Math.round(v * 100) + '%';
            savePrefs();                           // Write to localStorage
        });
        row.appendChild(topRow); row.appendChild(slider);
        panel.appendChild(row);
    }
    addSep();

    // ── API Status ────────────────────────────────────
    addSection('📡  API Status');
    addStatusRow();

    // ═══════════════════════════════════════════════════
    // CUSTOMIZATION TAB — second panel appended below
    // Implemented as a second scrollable section
    // ═══════════════════════════════════════════════════
    addSep();
    addSection('🎨  Customization');

    // Helper: add a UI size slider that updates the UI object and redraws
    function addUISlider(label, key, min, max, step) {
        addSlider({
            label,                          // Display label for this size control
            get:  () => UI[key],
            set:  v  => { UI[key] = v; },
            fmt:  v  => v + 'px',
            min, max, step,
            onCommit: () => { /* Sizes take effect on next draw */ },
        });
    }

    // ── Blip sizes ──────────────────
    addUISlider('Blip Dot Size',        'blipDotR',       2,  14, 1);
    addUISlider('Traffic Triangle Size','blipTriTip',     6,  20, 1);
    addUISlider('Blip Label Font',      'blipLabelFont',  8,  18, 1);
    addSep();

    // ── Player sizes ─────────────────
    addUISlider('Player Triangle Size', 'playerTriTip',   8,  24, 1);
    addUISlider('Player CS Font',       'playerCsFont',   10, 22, 1);
    addSep();

    // ── HUD fonts ────────────────────
    addUISlider('HUD Callsign Font',    'hudCallsignFont', 12, 26, 1);
    addUISlider('HUD Data Font',        'hudDataFont',    10, 22, 1);
    addUISlider('HUD Label Font',       'hudSectionLabelFont', 10, 20, 1);
    addSep();

    // ── Compass / Ring fonts ──────────
    addUISlider('Compass Font',         'compassFont',    16, 40, 1);
    addUISlider('Ring Label Font',      'ringLabelFont',  10, 22, 1);
    addSep();

    // ── Popup fonts ───────────────────
    addUISlider('Popup Title Font',     'popupTitleFont', 12, 24, 1);
    addUISlider('Popup Body Font',      'popupBodyFont',  11, 20, 1);
    addSep();

    // ── Trail width ───────────────────
    addSlider({
        label:    'Trail Thickness',           // Trail line width in pixels
        get:      () => prefs.trailWidth,
        set:      v  => { prefs.trailWidth = v; },
        fmt:      v  => v + ' px',
        min: 1, max: 8, step: 0.5,
        onCommit: savePrefs,
    });
    addSep();

    // ── ILS Font sizes ────────────────
    addSection('🛬  ILS Display');
    function addILSFontSlider(label, key) {
        addSlider({
            label,
            get:  () => ilsPrefs[key],
            set:  v  => { ilsPrefs[key] = v; },
            fmt:  v  => v + 'px',
            min: 7, max: 24, step: 1,
            onCommit: saveIlsPrefs,   // Persist to localStorage
        });
    }
    addILSFontSlider('ILS Header Font',       'fontHeader');
    addILSFontSlider('ILS Label Font',         'fontLabel');
    addILSFontSlider('ILS Value Font',         'fontValue');
    addILSFontSlider('ILS Pill Label Font',    'fontPillLabel');
    addILSFontSlider('ILS Pill Value Font',    'fontPillValue');
    addILSFontSlider('ILS Footer Font',        'fontFooter');
    addILSFontSlider('ILS Bank Label Font',    'fontBankValue');
    addSep();

    // ── TCAS ─────────────────────────
    addSection('⚠️  TCAS');
    // TCAS enable toggle
    {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px;cursor:pointer;transition:background .15s;`;
        row.onmouseover = () => row.style.background = T().menuRowHover;
        row.onmouseout  = () => row.style.background = '';
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        lbl.textContent = 'TCAS Warning';  // Flash TRAFFIC + audio when on collision course
        const sw  = document.createElement('div');
        const knobOff = 3, knobOn = UI.menuSwitchW - UI.menuKnobSize - 3;
        sw.style.cssText = `width:${UI.menuSwitchW}px;height:${UI.menuSwitchH}px;
            border-radius:${UI.menuSwitchH/2}px;position:relative;
            background:${prefs.tcasEnabled ? 'rgba(0,200,0,0.75)' : 'rgba(80,80,80,0.5)'};
            border:1px solid rgba(0,255,0,0.3);transition:background .2s;flex-shrink:0;`;
        const knob = document.createElement('div');
        knob.style.cssText = `position:absolute;top:${(UI.menuSwitchH-UI.menuKnobSize)/2}px;
            left:${prefs.tcasEnabled ? knobOn : knobOff}px;
            width:${UI.menuKnobSize}px;height:${UI.menuKnobSize}px;border-radius:50%;
            background:${prefs.tcasEnabled ? '#0f0' : '#888'};transition:left .2s,background .2s;`;
        sw.appendChild(knob); row.appendChild(lbl); row.appendChild(sw);
        row.onclick = () => {
            prefs.tcasEnabled = !prefs.tcasEnabled;
            const tc = T();
            sw.style.background   = prefs.tcasEnabled ? tc.switchOn  : tc.switchOff;
            knob.style.left       = prefs.tcasEnabled ? knobOn+'px'  : knobOff+'px';
            knob.style.background = prefs.tcasEnabled ? tc.knobOn    : tc.knobOff;
            if (!prefs.tcasEnabled) _stopTCAS();
            savePrefs();
        };
        panel.appendChild(row);
    }

    // ── TCAS Audio toggle (reads/writes prefs, not settings) ─────────────
    {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
            padding:${UI.menuRowPadY}px 16px;cursor:pointer;transition:background .15s;`;
        row.onmouseover = () => row.style.background = T().menuRowHover;
        row.onmouseout  = () => row.style.background = '';
        const lbl = document.createElement('span');
        lbl.dataset.menuRowlbl = '1';
        lbl.style.cssText = `color:rgba(200,255,200,0.9);font:${UI.menuRowFont}px ${FONT_SANS};`;
        lbl.textContent = 'TCAS Audio';
        const sw = document.createElement('div');
        const knobOff = 3, knobOn = UI.menuSwitchW - UI.menuKnobSize - 3;
        sw.style.cssText = `width:${UI.menuSwitchW}px;height:${UI.menuSwitchH}px;
            border-radius:${UI.menuSwitchH/2}px;position:relative;
            background:${prefs.tcasAudioEnabled ? 'rgba(0,200,0,0.75)' : 'rgba(80,80,80,0.5)'};
            border:1px solid rgba(0,255,0,0.3);transition:background .2s;flex-shrink:0;`;
        const knob = document.createElement('div');
        knob.style.cssText = `position:absolute;top:${(UI.menuSwitchH-UI.menuKnobSize)/2}px;
            left:${prefs.tcasAudioEnabled ? knobOn : knobOff}px;
            width:${UI.menuKnobSize}px;height:${UI.menuKnobSize}px;border-radius:50%;
            background:${prefs.tcasAudioEnabled ? '#0f0' : '#888'};transition:left .2s,background .2s;`;
        sw.appendChild(knob); row.appendChild(lbl); row.appendChild(sw);
        row.onclick = () => {
            prefs.tcasAudioEnabled = !prefs.tcasAudioEnabled;
            const tc = T();
            sw.style.background   = prefs.tcasAudioEnabled ? tc.switchOn  : tc.switchOff;
            knob.style.left       = prefs.tcasAudioEnabled ? knobOn+'px'  : knobOff+'px';
            knob.style.background = prefs.tcasAudioEnabled ? tc.knobOn    : tc.knobOff;
            savePrefs();
        };
        panel.appendChild(row);
    }

    // ── TCAS tuning sliders ───────────────────────
    addSlider({
        label: 'Lookahead Time',                    // How far ahead (seconds) to project each path
        get:   () => prefs.tcasLookaheadS,
        set:   v  => { prefs.tcasLookaheadS = v; },
        fmt:   v  => v + ' s',
        min: 5, max: 120, step: 5,
        onCommit: savePrefs,
    });
    addSlider({
        label: 'Altitude Band',                     // ±feet altitude difference to consider a threat
        get:   () => prefs.tcasAltBandFt,
        set:   v  => { prefs.tcasAltBandFt = v; },
        fmt:   v  => '±' + v + ' ft',
        min: 50, max: 2000, step: 50,
        onCommit: savePrefs,
    });
    addSlider({
        label: 'Min Altitude (AGL)',                // Both aircraft must be above this to warn
        get:   () => prefs.tcasMinAltFt,
        set:   v  => { prefs.tcasMinAltFt = v; },
        fmt:   v  => v + ' ft',
        min: 0, max: 2000, step: 50,
        onCommit: savePrefs,
    });
    addSlider({
        label: 'Intersection Margin',               // How close (metres) paths must cross to trigger
        get:   () => prefs.tcasMarginM,
        set:   v  => { prefs.tcasMarginM = v; },
        fmt:   v  => v + ' m',
        min: 50, max: 2000, step: 50,
        onCommit: savePrefs,
    });
    addSlider({
        label: 'Audio Cooldown',                    // Minimum seconds between audio replays
        get:   () => prefs.tcasAudioCooldownMs / 1000,
        set:   v  => { prefs.tcasAudioCooldownMs = v * 1000; },
        fmt:   v  => v + ' s',
        min: 1, max: 60, step: 1,
        onCommit: savePrefs,
    });
    addSlider({
        label: 'Time Sync Tolerance',               // ±% — how closely both aircraft must hit the intersection at the same time
        get:   () => prefs.tcasTimeTolPct,
        set:   v  => { prefs.tcasTimeTolPct = v; },
        fmt:   v  => '±' + v + '%',
        min: 1, max: 30, step: 1,
        onCommit: savePrefs,
    });

    document.body.appendChild(panel);
    repositionMenu();
}

function repositionMenu() {
    const btn   = document.getElementById('radarMenuBtn');
    const panel = document.getElementById('radarMenuPanel');
    if (!btn || !panel) return;
    const rl = parseInt(radarCanvas.style.left) || 5; // Radar left edge in px
    const rt = parseInt(radarCanvas.style.top)  || 0; // Radar top edge in px
    const spacing = 5; // Gap between elements in px

    // Place button to the RIGHT of the radar, at the top — never overlapping HUDs on the right side
    btn.style.left = (rl + radarSize + spacing) + 'px';
    btn.style.top  = rt + 'px';

    // Place panel below the button
    const panelTop = rt + 40 + spacing;
    const windowHeight   = window.innerHeight;
    const menuFullHeight = 640; // Estimated full panel height
    const maxAllowedH    = windowHeight - panelTop - 60; // Leave 60 px bottom gap
    const panelHeight    = Math.min(menuFullHeight, maxAllowedH);
    panel.style.top    = panelTop + 'px';
    panel.style.height = panelHeight + 'px';
    panel.style.left   = (rl + radarSize + spacing) + 'px';

    // If panel goes off-screen right, shift left
    const panelRight = parseInt(panel.style.left) + UI.menuW;
    if (panelRight > window.innerWidth) {
        panel.style.left = (window.innerWidth - UI.menuW - spacing) + 'px';
    }
    panel.style.borderBottom = panelHeight < menuFullHeight
        ? '2px solid rgba(255,200,0,0.5)' : '1.5px solid rgba(0,255,0,0.35)';
}

function updateMenuInfoCallsign(cs, lat, lon) {
    const csEl  = document.getElementById('radarInfo_callsign');
    const posEl = document.getElementById('radarInfo_position');
    if (csEl) csEl.textContent = cs || '—';
    if (posEl && lat != null) {
        const latStr = Math.abs(lat).toFixed(3) + (lat >= 0 ? '°N' : '°S');
        const lonStr = Math.abs(lon).toFixed(3) + (lon >= 0 ? '°E' : '°W');
        posEl.textContent = `${latStr} ${lonStr}`;
    } else if (posEl) posEl.textContent = '—';
}

function updateApiStatus(msg, ok) {
    const el = document.getElementById('radarInfo_apistatus');
    if (!el) return;
    el.textContent      = msg;
    el.dataset.statusOk = ok ? 'true' : 'false';
    el.style.color = ok ? T().menuStatus : 'rgba(255,120,60,0.95)';
}

function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }
function openMenu()  { menuOpen=true; const p=document.getElementById('radarMenuPanel'); if(p){p.style.display='block'; repositionMenu();} }
function closeMenu() { menuOpen=false; const p=document.getElementById('radarMenuPanel'); if(p) p.style.display='none'; }

window.addEventListener('resize', () => { repositionMenu(); repositionNearestHUD(); });

// ═══════════════════════════════════════════════════
// SECTION 6 — BLIP POPUP
// ═══════════════════════════════════════════════════

let popup = null;
let lastBlipPositions = [];

function createPopupEl() {
    const p = document.createElement('div');
    p.id = 'radarPopup';
    p.style.cssText = `
        position:fixed;min-width:210px;
        background:rgba(0,12,0,0.97);border:1.5px solid rgba(0,255,0,0.5);
        border-radius:10px;padding:11px 15px;
        z-index:2147483647;pointer-events:none;display:none;
        font-family:${FONT_MONO};font-size:${UI.popupBodyFont}px;
        box-shadow:0 3px 20px rgba(0,0,0,0.88);
    `;
    document.body.appendChild(p);
    return p;
}

function showPopup(ac, distance, screenX, screenY, myData) {
    if (!popup) popup = createPopupEl();
    const cs   = ac.cs || 'UNKNOWN';
    const hdg  = ac.h != null ? fmtHdg(ac.h) : 'N/A';
    const _rawAlt = (() => {
        const v = parseFloat(ac.al);
        if (isFinite(v)) return v;
        if (ac.co && ac.co.length >= 3) { const vCo = parseFloat(ac.co[2]); if (isFinite(vCo)) return vCo * 3.28084; }
        return null;
    })();
    const altStr = _rawAlt !== null ? (fmtAlt(_rawAlt) ?? '–') : '–';
    const _rawSpd = isFinite(parseFloat(ac.s)) ? parseFloat(ac.s)
        : (typeof ac._computedSpd === 'number' && isFinite(ac._computedSpd) ? ac._computedSpd : null);
    const spdStr = _rawSpd !== null ? (fmtSpd(_rawSpd) ?? '–') : '–';
    let brgStr='—', nmStr='—';
    if (myData && ac.co) {
        const nm  = calcDistNm(myData.lat, myData.lon, ac.co[0], ac.co[1]);
        const brg = calcBearing(myData.lat, myData.lon, ac.co[0], ac.co[1]);
        nmStr = fmtDist(nm);
        brgStr = `${Math.round(brg).toString().padStart(3,'0')}° ${bearingCompass(brg)}`;
    }
    let altDelta = '';
    if (myData && _rawAlt !== null) {
        const d = Math.round(_rawAlt - myData.altFt);
        const sign = d >= 0 ? '▲+' : '▼';
        const col  = d > 0 ? '#88ff88' : '#ff8888';
        altDelta = ` <span style="color:${col};font-size:${UI.popupAltDeltaFont}px">${sign}${Math.abs(d).toLocaleString()} ft</span>`;
    }
    popup.innerHTML = `
        <div style="color:#0f0;font-weight:bold;font-size:${UI.popupTitleFont}px;margin-bottom:7px;
             border-bottom:1px solid rgba(0,255,0,0.2);padding-bottom:5px;letter-spacing:1px">${cs}</div>
        <div style="display:grid;grid-template-columns:78px 1fr;gap:4px 10px;
             color:rgba(200,255,200,0.9);line-height:1.8;font-size:${UI.popupBodyFont}px">
            <span style="color:rgba(0,200,0,0.6)">Distance</span><span style="color:rgba(255,160,40,0.95)">${nmStr}</span>
            <span style="color:rgba(0,200,0,0.6)">Bearing</span><span style="color:rgba(180,255,180,0.9)">${brgStr}</span>
            <span style="color:rgba(0,200,0,0.6)">Altitude</span><span style="color:rgba(0,240,255,0.95)">${altStr}${altDelta}</span>
            <span style="color:rgba(0,200,0,0.6)">Speed GS</span><span style="color:rgba(255,220,80,0.95)">${spdStr}</span>
            <span style="color:rgba(0,200,0,0.6)">Heading</span><span style="color:rgba(180,255,180,0.9)">${hdg}</span>
        </div>`;
    const rl = parseInt(radarCanvas.style.left) || 0;
    const rt = parseInt(radarCanvas.style.top)  || 0;
    let px = rl + screenX + 14, py = rt + screenY - 20;
    if (px + 200 > window.innerWidth)  px = rl + screenX - 205;
    if (py + 160 > window.innerHeight) py = rt + screenY - 160;
    popup.style.left    = px + 'px';
    popup.style.top     = py + 'px';
    popup.style.display = 'block';
}

function hidePopup() { if (popup) popup.style.display = 'none'; }

let activePopupCs = null;

// ── Point-to-segment distance (for runway click detection) ────────────────
function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx*dx + dy*dy;
    if (lenSq === 0) return Math.hypot(px-x1, py-y1);
    const t = Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / lenSq));
    return Math.hypot(px - (x1+t*dx), py - (y1+t*dy));
}

radarCanvas.addEventListener('click', (e) => {
    const rect = radarCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // ── Blip detection (aircraft) ──────────────────
    let closest = null, closestDist = 12;
    lastBlipPositions.forEach(b => {
        const d = Math.hypot(mx - b.x, my - b.y);
        if (d < closestDist) { closestDist = d; closest = b; }
    });

    if (closest) {
        const isSameBlip = _trackedId && _trackedId === closest.ac.id;
        if (isSameBlip) {
            hidePopup(); stopTracking();
        } else {
            activePopupCs  = closest.ac.cs;
            _trackedAc     = closest.ac;
            _trackedId     = closest.ac.id;
            _lastHudUpdate = 0;
            _lastNearestCs = null;
            updateNearestHUD(closest.ac, closest.myData);
            hidePopup();
        }
        return;
    }

    // ── Runway detection (ILS activation) ─────────
    let closestRwy = null, closestRwyDist = 14;
    _lastRunwayPositions.forEach(r => {
        const d = distToSegment(mx, my, r.x1, r.y1, r.x2, r.y2);
        if (d < closestRwyDist) { closestRwyDist = d; closestRwy = r; }
    });

    if (closestRwy) {
        if (_ilsActive && _ilsRunway === closestRwy.rwyData) {
            deactivateILS();
        } else {
            activateILS(closestRwy.rwyData, closestRwy.airportICAO);
        }
        return;
    }

    hidePopup();
    stopTracking();
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
        if (rb) rb.style.display = hide ? 'none' : 'flex';
        const mb = document.getElementById('radarMenuBtn');
        if (mb) mb.style.display = hide ? 'none' : 'flex';
        nearestHUD.style.display = (hide || !settings.showNearestHUD) ? 'none' : 'block';
        ilsHUD.style.display = (hide || !_ilsActive) ? 'none' : 'block';
        if (hide) { hidePopup(); closeMenu(); _stopTCAS(); }
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
            if (fromAircraft && fromAircraft !== 'Foo' && fromAircraft.length > 0) { window._radarMyCallsign = fromAircraft; return fromAircraft; }
            const fromRecord = geofs.userRecord?.callsign;
            if (fromRecord && fromRecord !== 'Foo' && fromRecord.length > 0) { window._radarMyCallsign = fromRecord; return fromRecord; }
            const fromLogin = geofs.userRecord?.login;
            if (fromLogin && fromLogin.length > 0) { window._radarMyCallsign = fromLogin; return fromLogin; }
        }
    } catch(e) {}
    return window._radarMyCallsign || null;
}

// ═══════════════════════════════════════════════════
// SECTION 10 — GAME PAUSE DETECTION
// ═══════════════════════════════════════════════════

setInterval(() => {
    try {
        if (window.geofs) isGamePaused = geofs.gui?.pause ?? geofs.pause ?? false;
        const t = T();
        const o = isGamePaused ? '0.45' : String(prefs.radarOpacity ?? 1);
        radarCanvas.style.opacity   = o;
        radarCanvas.style.boxShadow = isGamePaused ? '0 0 10px rgba(255,220,0,0.4)' : t.canvasGlow;
        const rb = document.getElementById('radarRangeBox');
        if (rb) rb.style.opacity = o;
        const mb = document.getElementById('radarMenuBtn');
        if (mb) mb.style.opacity = o;
        const mp = document.getElementById('radarMenuPanel');
        if (mp) mp.style.opacity = o;
        nearestHUD.style.opacity = o;
        ilsHUD.style.opacity = o;
    } catch(e) {}
}, PAUSE_POLL_INTERVAL);

let aircraftListCache = [];
const prevAcData = new Map();

function normalizeAc(raw) {
    const ac = Object.assign({}, raw);
    if (ac.h == null && Array.isArray(ac.co) && ac.co.length > 3) { const v=parseFloat(ac.co[3]); if(isFinite(v)) ac.h=v; }
    if (ac.al == null && Array.isArray(ac.co) && ac.co.length > 2) { const v=parseFloat(ac.co[2]); if(isFinite(v)) ac.al=v*3.28084; }
    if (ac.s == null && ac.st && ac.st.as != null) { const v=parseFloat(ac.st.as); if(isFinite(v)) ac.s=v; }
    return ac;
}

// ═══════════════════════════════════════════════════
// SECTION 11 — MULTIPLAYER DATA SOURCE
// ═══════════════════════════════════════════════════

const prevAcData_rest = new Map();

function _applySpeedDelta(ac, prevMap, now) {
    if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) return;
    const id   = ac.id || ac.cs || `${Math.round(ac.co[0]*1000)},${Math.round(ac.co[1]*1000)}`;
    const prev = prevMap.get(id);
    if (prev) {
        const dt = (now - prev.time) / 1000;
        if (dt > FETCH_SPEED_DT_MIN && dt <= FETCH_SPEED_DT_MAX) {
            const dLat = (ac.co[0] - prev.lat) * Math.PI / 180;
            const dLon = (ac.co[1] - prev.lon) * Math.PI / 180;
            const R = 6371000;
            const a = Math.sin(dLat/2)**2 + Math.cos(prev.lat*Math.PI/180)*Math.cos(ac.co[0]*Math.PI/180)*Math.sin(dLon/2)**2;
            const distM  = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const speedKt = (distM / dt) / 0.514444;
            if (ac.s == null && speedKt <= 3000) ac._computedSpd = speedKt;
            else if (ac.s == null && typeof prev._computedSpd === 'number') ac._computedSpd = prev._computedSpd;
        } else if (ac.s == null && typeof prev._computedSpd === 'number') {
            ac._computedSpd = prev._computedSpd;
        }
    }
    prevMap.set(id, { lat:ac.co[0], lon:ac.co[1], time:now, ...(typeof ac._computedSpd==='number' && {_computedSpd:ac._computedSpd}) });
}

function _normalizeInternal(raw) {
    if (!raw) return null;
    try {
        const ac = {};
        ac.id = raw.id ?? raw.userId ?? raw.sessionId ?? null;
        ac.cs = raw.callsign ?? raw.cs ?? null;
        ac.ac = raw.aircraftIndex ?? raw.ac ?? raw.aircraftId ?? null;
        if (Array.isArray(raw.llaLocation) && raw.llaLocation.length >= 2) {
            const lat = parseFloat(raw.llaLocation[0]), lon = parseFloat(raw.llaLocation[1]), alt = parseFloat(raw.llaLocation[2]);
            if (!isFinite(lat) || !isFinite(lon)) return null;
            ac.co = [lat, lon, isFinite(alt) ? alt : 0];
            if (isFinite(alt)) ac.al = alt * 3.28084;
        } else if (Array.isArray(raw.co) && raw.co.length >= 2) {
            ac.co = raw.co;
        } else return null;
        const hdg = raw.animationValue?.heading360 ?? raw.animationValue?.heading ?? raw.heading ?? (Array.isArray(raw.co) && raw.co[3]!=null ? raw.co[3] : null) ?? raw.h ?? null;
        if (hdg != null && isFinite(parseFloat(hdg))) ac.h = parseFloat(hdg);
        if (ac.al == null) { const altFt = raw.animationValue?.altitude ?? raw.altitude ?? null; if (altFt!=null && isFinite(parseFloat(altFt))) ac.al=parseFloat(altFt); }
        const spd = raw.animationValue?.speed ?? raw.animationValue?.kias ?? raw.st?.as ?? raw.s ?? null;
        if (spd != null && isFinite(parseFloat(spd))) ac.s = parseFloat(spd);
        return ac;
    } catch(e) { return null; }
}

function _readInternalMultiplayer() {
    try {
        const mp = window.geofs?.multiplayer;
        if (!mp) return null;
        const candidates = [mp._users, mp.users, mp._clients, mp.clients, mp._otherAircraft, mp.otherAircraft, mp._aircraft];
        for (const raw of candidates) {
            if (!raw) continue;
            let list;
            if (raw instanceof Map) list = Array.from(raw.values());
            else if (Array.isArray(raw)) list = raw;
            else if (typeof raw === 'object') list = Object.values(raw);
            else continue;
            if (!list.length) continue;
            const sample = list[0];
            const hasPos = Array.isArray(sample?.llaLocation) || Array.isArray(sample?.co);
            if (!hasPos) continue;
            const now = Date.now();
            const acList = [];
            list.forEach(raw => { const ac=_normalizeInternal(raw); if(!ac) return; _applySpeedDelta(ac,prevAcData,now); acList.push(ac); });
            if (acList.length > 0) return acList;
        }
    } catch(e) {}
    return null;
}

let _internalSourceActive = false;
let _internalConsecutiveFails = 0;
const INTERNAL_FAIL_THRESHOLD = 10;

function _tickInternalSource() {
    if (isGamePaused) return;
    const result = _readInternalMultiplayer();
    if (result !== null) {
        aircraftListCache = result;
        _internalSourceActive = true;
        _internalConsecutiveFails = 0;
        updateApiStatus(`Internal — ${result.length} aircraft (real-time)`, true);
    } else {
        _internalConsecutiveFails++;
        if (_internalSourceActive && _internalConsecutiveFails >= INTERNAL_FAIL_THRESHOLD) {
            _internalSourceActive = false;
            updateApiStatus('Internal unavailable — switching to REST…', false);
            scheduleFetch(FETCH_DELAY_BASE);
        }
    }
}
setInterval(_tickInternalSource, DRAW_INTERVAL);

let _fetchConsecutiveErrors = 0;
let _fetchDelay = FETCH_DELAY_BASE;
const FETCH_MIN = FETCH_DELAY_BASE;
const FETCH_MAX = FETCH_DELAY_MAX;
let _fetchTimer = null;

function scheduleFetch(delay) { if (_fetchTimer) clearTimeout(_fetchTimer); _fetchTimer = setTimeout(doFetch, delay); }

async function doFetch() {
    if (_internalSourceActive) { scheduleFetch(2000); return; }
    if (!isGamePaused) {
        try {
            const res = await fetch('https://mps.geo-fs.com/map');
            if (res.status === 429) {
                _fetchDelay = Math.min(_fetchDelay*2, FETCH_MAX);
                _fetchConsecutiveErrors++;
                updateApiStatus(`429 Rate limited — retrying in ${_fetchDelay/1000}s (×${_fetchConsecutiveErrors})`, false);
                scheduleFetch(_fetchDelay); return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data  = await res.json();
            const now   = Date.now();
            const users = (data.users || []).map(normalizeAc);
            users.forEach(ac => _applySpeedDelta(ac, prevAcData_rest, now));
            aircraftListCache = users;
            _fetchConsecutiveErrors = 0;
            _fetchDelay = Math.max(FETCH_MIN, _fetchDelay * 0.75);
            updateApiStatus(`REST — ${users.length} aircraft`, true);
        } catch(e) {
            _fetchConsecutiveErrors++;
            _fetchDelay = Math.min(_fetchDelay*1.5, FETCH_MAX);
            updateApiStatus(`Error (×${_fetchConsecutiveErrors}): ${e.message}`, false);
        }
    }
    scheduleFetch(_fetchDelay);
}
scheduleFetch(FETCH_DELAY_INITIAL);

// ═══════════════════════════════════════════════════
// SECTION 12 — AIRPORT / RUNWAY DATA
// ═══════════════════════════════════════════════════

let runwayCache  = [];
let airportCache = [];
let lastAirportFetch = 0;

function runwayEndpointsFromCenter(lat, lon, hdgDeg, lenM) {
    const R = 6371000, half = (lenM || 1800) / 2, hRad = hdgDeg * Math.PI / 180;
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
                const flds = parseLine(l), o = {};
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
            const id = row['airport_ident']; if (!id) return;
            const lat1=parseFloat(row['le_latitude_deg']), lon1=parseFloat(row['le_longitude_deg']);
            const lat2=parseFloat(row['he_latitude_deg']), lon2=parseFloat(row['he_longitude_deg']);
            const lenM = parseFloat(row['length_ft']) * 0.3048;
            const name = [row['le_ident'], row['he_ident']].filter(Boolean).join('/');
            if (!rwByIdent[id]) rwByIdent[id] = [];
            if (isFinite(lat1)&&isFinite(lon1)&&isFinite(lat2)&&isFinite(lon2)) {
                rwByIdent[id].push({ lat1,lon1,lat2,lon2, name, length: isFinite(lenM)?lenM:1800 });
            } else if (isFinite(lat1)&&isFinite(lon1)) {
                const hdg = parseFloat(row['le_heading_degT']), len = isFinite(lenM)?lenM:1800;
                if (isFinite(hdg)) {
                    const R=6371000, hR=hdg*Math.PI/180;
                    rwByIdent[id].push({ lat1, lon1, lat2:lat1+((len/R)*Math.cos(hR))*(180/Math.PI), lon2:lon1+((len/R)*Math.sin(hR))*(180/Math.PI)/Math.cos(lat1*Math.PI/180), name, length:len });
                }
            }
        });

        runwayCache  = [];
        airportCache = [];
        airportRows.forEach(row => {
            const lat = parseFloat(row['latitude_deg']), lon = parseFloat(row['longitude_deg']);
            if (!isFinite(lat)||!isFinite(lon)) return;
            const icao = row['ident'] || row['gps_code'] || 'UNKN';
            const elevFt = parseFloat(row['elevation_ft']) || 0; // ← airport elevation for ILS AGL
            airportCache.push({ icao, name: row['name']||icao, lat, lon, elevFt });
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
        drawAirportsAndRunways._cachedGroups = null;
        _airportCache_lastLat  = null;
        _airportCache_lastLon  = null;
        console.log(`OurAirports: ${airportCache.length} airports, ${runwayCache.length} runways`);
    } catch(e) { console.error('Airport fetch error:', e); }
}

setTimeout(fetchAirportData, AIRPORT_FETCH_INITIAL);
setInterval(fetchAirportData, AIRPORT_REFETCH);

// ═══════════════════════════════════════════════════
// ILS SYSTEM
// ═══════════════════════════════════════════════════

// ── State ─────────────────────────────────────────
let _ilsRunway        = null;   // {lat1,lon1,lat2,lon2,name,airport,length}
let _ilsAirportICAO   = null;
let _ilsAirportElevFt = 0;
let _ilsActive        = false;
let _vsHistory        = [];
let _lastRunwayPositions = [];  // [{x1,y1,x2,y2,rwyData,airportICAO}] for click detection

// ── ILS HUD element ───────────────────────────────
const ilsHUD = document.createElement('div');
ilsHUD.id = 'radarILSHUD';
ilsHUD.style.cssText = `
    position:fixed; z-index:2147483646; display:none;
    pointer-events:auto; font-family:${FONT_MONO};
`;
document.body.appendChild(ilsHUD);

// ── CDI canvas (reused, not re-created each frame) ─
const ilsCDICanvas = document.createElement('canvas');
ilsCDICanvas.width  = 200;
ilsCDICanvas.height = 200;
const ilsCtx2 = ilsCDICanvas.getContext('2d');

// ── Activate / Deactivate ─────────────────────────
function activateILS(rwy, airportICAO) {
    _ilsRunway       = rwy;
    _ilsAirportICAO  = airportICAO;
    const ap = airportCache.find(a => a.icao === airportICAO);
    _ilsAirportElevFt = ap?.elevFt ?? 0;
    _ilsActive = true;
    _vsHistory = [];
    nearestHUD.style.display = 'none';
    ilsHUD.style.display = 'block';
    repositionILSHUD();
    updateILSHUD(null); // render immediately with placeholder data
}

function deactivateILS() {
    _ilsActive  = false;
    _ilsRunway  = null;
    ilsHUD.style.display = 'none';
    // Restore nearest HUD if enabled
    updateNearestHUD(_hudNearestData?.nearest ?? null, _hudNearestData?.myData ?? null);
}

function repositionILSHUD() {
    const rl = parseInt(radarCanvas.style.left) || 5; // Radar left edge
    const rt = parseInt(radarCanvas.style.top)  || 0; // Radar top edge
    const spacing = 5;
    // ILS HUD sits in the same position as the Nearest HUD (they are mutually exclusive)
    ilsHUD.style.left = (rl + radarSize + spacing) + 'px';
    ilsHUD.style.top  = (rt + 40 + spacing + 5) + 'px';
}

// ── Vertical speed calculator ─────────────────────
function computeVS(altFt) {
    const now = Date.now();
    _vsHistory.push({ altFt, time: now });
    _vsHistory = _vsHistory.filter(h => now - h.time < 8000);
    if (_vsHistory.length < 2) return null;
    const oldest = _vsHistory[0];
    const dt = (now - oldest.time) / 60000; // minutes
    if (dt < 0.005) return null;
    return Math.round((altFt - oldest.altFt) / dt); // fpm
}

// ── Determine which runway threshold to use ───────
// Returns {tLat, tLon, oLat, oLon} where t = touchdown end, o = opposite
function getApproachThreshold(playerLat, playerLon, playerHdg, rwy) {
    const brg1 = calcBearing(playerLat, playerLon, rwy.lat1, rwy.lon1);
    const brg2 = calcBearing(playerLat, playerLon, rwy.lat2, rwy.lon2);
    const diff1 = Math.abs(((playerHdg - brg1 + 540) % 360) - 180);
    const diff2 = Math.abs(((playerHdg - brg2 + 540) % 360) - 180);
    return diff1 < diff2
        ? { tLat: rwy.lat1, tLon: rwy.lon1, oLat: rwy.lat2, oLon: rwy.lon2 }
        : { tLat: rwy.lat2, tLon: rwy.lon2, oLat: rwy.lat1, oLon: rwy.lon1 };
}

// ── Compute all ILS parameters ────────────────────
function computeILSData(playerLat, playerLon, playerHdg, playerAltFt, playerSpeedKts) {
    if (!_ilsRunway) return null;

    const { tLat, tLon, oLat, oLon } = getApproachThreshold(playerLat, playerLon, playerHdg, _ilsRunway);

    // Convert to metres from threshold
    const [pDx, pDy] = latLonToMeters(tLat, tLon, playerLat, playerLon);
    const [rDx, rDy] = latLonToMeters(tLat, tLon, oLat, oLon);
    const rLen = Math.hypot(rDx, rDy);
    if (rLen < 1) return null;

    const rUx = rDx / rLen, rUy = rDy / rLen;
    const along = pDx * rUx + pDy * rUy;   // positive = past threshold
    const cross  = pDx * (-rUy) + pDy * rUx; // positive = right of centreline
    const distToThreshM = -along;            // positive = still approaching

    // ── Read accurate values from geofs.animation.values (matches reference script) ──
    const av = window.geofs?.animation?.values; // Pre-computed GeoFS flight data

    // Altitude AGL — use groundElevationFeet if available (same as reference script)
    let playerAltAGL;
    if (av && av.altitude !== undefined && av.groundElevationFeet !== undefined) {
        // Same method as GeoFS Information Display: altitude - groundElevationFeet + wheel offset
        const wheelOffsetFt = (() => {
            try {
                const cps = geofs.aircraft?.instance?.collisionPoints;
                if (cps && cps.length >= 2) return cps[cps.length - 2].worldPosition[2] * 3.2808399;
            } catch(e) {}
            return 0;
        })();
        playerAltAGL = Math.round((av.altitude - av.groundElevationFeet) + wheelOffsetFt);
    } else {
        playerAltAGL = playerAltFt - _ilsAirportElevFt; // Fallback: altitude above airport elevation
    }

    // Ideal altitude at this distance on a 3° glideslope
    const GS_DEG    = 3.0;
    const idealAltFt = Math.max(0, distToThreshM) * Math.tan(GS_DEG * Math.PI / 180) * 3.28084;
    const gsErrFt   = playerAltAGL - idealAltFt; // positive = above GS

    // Localizer angular error (degrees) — positive = aircraft right of centreline
    const locErrDeg = Math.atan2(cross, Math.max(100, Math.abs(distToThreshM))) * 180 / Math.PI;

    // Glideslope angular error (degrees above 3° path)
    const gsErrDeg  = Math.atan2(gsErrFt / 3.28084, Math.max(100, Math.abs(distToThreshM))) * 180 / Math.PI;

    // Vertical speed — prefer geofs.animation.values.verticalSpeed (fpm), same as reference script
    let vs = null;
    if (av && av.verticalSpeed !== undefined && isFinite(av.verticalSpeed)) {
        vs = Math.round(av.verticalSpeed); // fpm directly from GeoFS
    } else {
        vs = computeVS(playerAltFt);       // Fallback: compute from altitude history
    }

    // Speed — prefer animation.values.kias (knots IAS) or groundSpeed
    let speedKts = playerSpeedKts;
    if (av && av.kias !== undefined && isFinite(av.kias) && av.kias > 0) {
        speedKts = av.kias;
    } else if (av && av.groundSpeed !== undefined && isFinite(av.groundSpeed)) {
        speedKts = av.groundSpeed;
    }

    // Actual descent angle: atan2(-VS_fpm, groundspeed_fpm)
    let descentAngle = null;
    if (vs !== null && isFinite(vs) && speedKts > 10) {
        const gsFtMin  = speedKts * 101.269;          // knots → ft/min
        descentAngle   = Math.atan2(-vs, gsFtMin) * 180 / Math.PI;
        descentAngle   = Math.round(descentAngle * 10) / 10;
    }

    // Bank angle — prefer animation.values roll if available, else animationValue
    let bankDeg = null;
    try {
        // geofs.animation.values doesn't expose roll directly; use animationValue.roll
        const rawRoll = av?.roll ?? geofs.aircraft?.instance?.animationValue?.roll ?? null;
        if (rawRoll !== null && isFinite(rawRoll)) {
            bankDeg = Math.abs(rawRoll) <= 6.28 ? rawRoll * 180 / Math.PI : rawRoll; // radians → degrees
            bankDeg = Math.round(bankDeg * 10) / 10;
        }
    } catch(e) {}

    const rwHdg = calcBearing(oLat, oLon, tLat, tLon); // Inbound course to threshold

    return {
        locErrDeg,
        gsErrDeg,
        gsErrFt:        Math.round(gsErrFt),
        distToThreshNm: distToThreshM / 1852,
        distToThreshM,
        altAGL:         Math.round(playerAltAGL),
        vs,
        descentAngle,
        bankDeg,
        rwHdg:          Math.round(((rwHdg % 360) + 360) % 360),
        runwayName:     _ilsRunway.name || 'RWY',
        airportICAO:    _ilsAirportICAO,
        onGround:       distToThreshM < 50 && Math.abs(along) < rLen + 50,
    };
}

// ── Draw CDI instrument onto ilsCDICanvas ─────────
function drawCDIInstrument(locErrDeg, gsErrDeg) {
    const W = 200, H = 200, cx = W / 2, cy = H / 2;
    const DOT_SPACING = 30;   // px between reference dots
    const LOC_FS = 2.5;       // degrees for full-scale localizer deflection
    const GS_FS  = 0.7;       // degrees for full-scale glideslope deflection
    const MAX_PX = DOT_SPACING * 2; // 2 dots = full scale pixel offset

    const c = ilsCtx2;
    c.clearRect(0, 0, W, H);

    // ── Background ──────────────────────────────────
    c.beginPath(); c.arc(cx, cy, W / 2 - 1, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,6,12,0.97)'; c.fill();
    c.strokeStyle = 'rgba(0,160,230,0.7)'; c.lineWidth = 2; c.stroke();

    // ── Dashed crosshair guides ──────────────────────
    c.save();
    c.beginPath(); c.arc(cx, cy, W/2 - 3, 0, Math.PI*2); c.clip();
    c.strokeStyle = 'rgba(0,80,120,0.5)'; c.lineWidth = 1;
    c.setLineDash([4, 5]);
    c.beginPath();
    c.moveTo(cx, 18); c.lineTo(cx, H - 18);
    c.moveTo(18, cy); c.lineTo(W - 18, cy);
    c.stroke();
    c.setLineDash([]);
    c.restore();

    // ── Reference dots (localizer = horizontal axis) ─
    [-2, -1, 1, 2].forEach(i => {
        c.beginPath(); c.arc(cx + i * DOT_SPACING, cy, 4.5, 0, Math.PI * 2);
        c.fillStyle = 'rgba(0,130,180,0.75)'; c.fill();
    });

    // ── Reference dots (glideslope = vertical axis) ──
    [-2, -1, 1, 2].forEach(i => {
        c.beginPath(); c.arc(cx, cy + i * DOT_SPACING, 4.5, 0, Math.PI * 2);
        c.fillStyle = 'rgba(0,130,180,0.75)'; c.fill();
    });

    // ── Compute needle deviations in pixels ──────────
    // LOC needle moves LEFT when aircraft is RIGHT of course
    const locPx = Math.max(-MAX_PX * 1.6, Math.min(MAX_PX * 1.6,
        -(locErrDeg / LOC_FS) * MAX_PX));
    // GS needle moves DOWN when aircraft is ABOVE glideslope
    const gsPx  = Math.max(-MAX_PX * 1.6, Math.min(MAX_PX * 1.6,
        (gsErrDeg / GS_FS) * MAX_PX));

    // Dot scale (0 = centred, 2 = full scale)
    const locDots = Math.abs(locErrDeg) / LOC_FS * 2;
    const gsDots  = Math.abs(gsErrDeg)  / GS_FS  * 2;

    // Colour: green ≤1 dot, yellow ≤2, red >2
    function needleColor(dots) {
        if (dots < 1.0) return '#00ffaa';
        if (dots < 2.0) return '#ffcc00';
        return '#ff4444';
    }
    const locColor = needleColor(locDots);
    const gsColor  = needleColor(gsDots);

    // Clip to instrument circle
    c.save();
    c.beginPath(); c.arc(cx, cy, W/2 - 5, 0, Math.PI*2); c.clip();

    // ── Localizer needle (vertical bar) ──────────────
    c.strokeStyle = locColor; c.lineWidth = 5;
    c.shadowColor = locColor; c.shadowBlur  = 10;
    c.beginPath();
    c.moveTo(cx + locPx, 16); c.lineTo(cx + locPx, H - 16);
    c.stroke();
    c.shadowBlur = 0;

    // ── Glideslope needle (horizontal bar) ───────────
    c.strokeStyle = gsColor; c.lineWidth = 5;
    c.shadowColor = gsColor; c.shadowBlur  = 10;
    c.beginPath();
    c.moveTo(16, cy + gsPx); c.lineTo(W - 16, cy + gsPx);
    c.stroke();
    c.shadowBlur = 0;

    c.restore();

    // ── Centre fixed target ring ─────────────────────
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, 10, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(cx - 16, cy); c.lineTo(cx - 12, cy);
    c.moveTo(cx + 12, cy); c.lineTo(cx + 16, cy);
    c.moveTo(cx, cy - 16); c.lineTo(cx, cy - 12);
    c.moveTo(cx, cy + 12); c.lineTo(cx, cy + 16);
    c.stroke();

    // ── Labels ───────────────────────────────────────
    c.font = 'bold 10px Arial';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,160,210,0.8)';
    c.fillText('LOC', 6, cy - 5);
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText('G/S', cx + 6, 5);
}

// ── Bank angle arc indicator (separate small canvas) ─
function drawBankIndicator(bankDeg) {
    // W×H canvas: arc is a semicircle, needle starts from bottom-centre (cy)
    const W = 200, H = 44;
    const cx = W / 2; // Horizontal centre of the arc pivot point
    const cy = H - 4; // Vertical pivot — bottom of canvas
    const R  = 60;    // Arc radius in pixels

    const bc = ilsBankCtx; // Bank canvas 2D context
    bc.clearRect(0, 0, W, H);

    // ── Arc track background ─────────────────────────
    bc.strokeStyle = 'rgba(0,80,120,0.4)'; bc.lineWidth = 2;
    bc.beginPath();
    bc.arc(cx, cy, R, Math.PI, 2 * Math.PI); // Top semicircle
    bc.stroke();

    // ── Tick marks: 0° bank = straight up (top of arc), ±L/R move along arc
    // Angle mapping: 0° bank → angle=Math.PI*1.5 (12 o'clock), negative bank = left, positive = right
    // We use: needleAngle = Math.PI*1.5 + (bankDeg / 90) * (Math.PI/2)
    [-45, -30, -20, -10, 0, 10, 20, 30, 45].forEach(deg => {
        const angle  = Math.PI * 1.5 + (deg / 90) * (Math.PI / 2); // Map bank → arc angle
        const isMain = deg % 30 === 0 || deg === 0;
        const innerR = R - (isMain ? 10 : 6);
        bc.strokeStyle = isMain ? 'rgba(0,160,210,0.85)' : 'rgba(0,100,150,0.55)';
        bc.lineWidth   = isMain ? 2 : 1;
        bc.beginPath();
        bc.moveTo(cx + Math.cos(angle) * R,      cy + Math.sin(angle) * R);
        bc.lineTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
        bc.stroke();
    });

    // ── Bank needle ─────────────────────────────────
    // 0° bank → needle points straight up; positive bank → needle tips right; negative → left
    const clampedBank  = Math.max(-45, Math.min(45, bankDeg || 0)); // Clamp to ±45°
    const needleAngle  = Math.PI * 1.5 + (clampedBank / 90) * (Math.PI / 2); // Arc angle for needle
    const bankColor    = Math.abs(clampedBank) < 15 ? '#00ffaa'       // Green: wings-level
                       : Math.abs(clampedBank) < 30 ? '#ffcc00'       // Yellow: moderate bank
                       : '#ff4444';                                    // Red: steep bank

    bc.strokeStyle = bankColor; bc.lineWidth = 3;
    bc.shadowColor = bankColor; bc.shadowBlur = 8;
    bc.beginPath();
    bc.moveTo(cx, cy); // Start at pivot point (bottom centre)
    bc.lineTo(cx + Math.cos(needleAngle) * (R - 4), cy + Math.sin(needleAngle) * (R - 4));
    bc.stroke();
    bc.shadowBlur = 0;

    // ── Pivot dot ────────────────────────────────────
    bc.beginPath(); bc.arc(cx, cy, 4, 0, Math.PI * 2);
    bc.fillStyle = 'rgba(255,255,255,0.9)'; bc.fill();

    // ── Bank value text ──────────────────────────────
    bc.font = `bold ${ilsPrefs.fontBankValue}px Arial`;
    bc.textAlign = 'center'; bc.textBaseline = 'bottom';
    bc.fillStyle = bankColor;
    // L = left bank (negative), R = right bank (positive)
    bc.fillText((clampedBank <= 0 ? 'L' : 'R') + Math.abs(clampedBank).toFixed(1) + '°', cx, H - 0);
}

// Bank indicator canvas
const ilsBankCanvas = document.createElement('canvas');
ilsBankCanvas.width  = 200;
ilsBankCanvas.height = 44;
const ilsBankCtx = ilsBankCanvas.getContext('2d');

// ── Build / refresh the ILS HUD ───────────────────
let _ilsHUDBuilt = false;

function updateILSHUD(ilsData) {
    if (!_ilsActive) { ilsHUD.style.display = 'none'; return; }
    ilsHUD.style.display = 'block';

    const t = T();
    const rwyLabel = ilsData ? `${ilsData.runwayName}  ${ilsData.airportICAO}  HDG ${String(ilsData.rwHdg).padStart(3,'0')}°` : (_ilsRunway?.name ?? '—');

    const locErrDeg = ilsData?.locErrDeg ?? 0;
    const gsErrDeg  = ilsData?.gsErrDeg  ?? 0;

    // Draw CDI instrument
    drawCDIInstrument(locErrDeg, gsErrDeg);
    // Draw bank indicator
    drawBankIndicator(ilsData?.bankDeg ?? 0);

    // Localizer / GS deviation colours for text
    const locDots = Math.abs(locErrDeg) / 2.5 * 2;
    const gsDots  = Math.abs(gsErrDeg)  / 0.7 * 2;
    function dotColor(dots) { return dots < 1 ? 'rgba(0,255,170,0.95)' : dots < 2 ? 'rgba(255,204,0,0.95)' : 'rgba(255,68,68,0.95)'; }
    const locColor = dotColor(locDots);
    const gsColor  = dotColor(gsDots);

    const distStr = ilsData
        ? (ilsData.distToThreshNm > 0 ? ilsData.distToThreshNm.toFixed(1) + ' NM' : 'ON RUNWAY')
        : '—';
    const altStr  = ilsData ? ilsData.altAGL.toLocaleString() + ' ft' : '—';
    const vsRaw   = ilsData?.vs;
    const vsStr   = vsRaw != null ? (vsRaw > 0 ? '+' : '') + vsRaw + ' fpm' : '—';
    const vsColor = vsRaw != null && vsRaw < 0 ? 'rgba(80,255,140,0.95)' : 'rgba(255,120,120,0.95)';
    const dAngStr = ilsData?.descentAngle != null ? ilsData.descentAngle + '°' : '—';
    const bankVal = ilsData?.bankDeg;
    const bankStr = bankVal != null ? (bankVal >= 0 ? 'R ' : 'L ') + Math.abs(bankVal) + '°' : '—';
    const bankColor = bankVal != null ? (Math.abs(bankVal) < 15 ? 'rgba(0,255,170,0.95)' : Math.abs(bankVal) < 30 ? 'rgba(255,204,0,0.95)' : 'rgba(255,68,68,0.95)') : 'rgba(180,255,180,0.9)';
    const gsErrFtStr = ilsData
        ? (ilsData.gsErrFt >= 0 ? '+' + ilsData.gsErrFt : ilsData.gsErrFt) + ' ft  ' + (ilsData.gsErrFt > 0 ? 'ABOVE' : ilsData.gsErrFt < 0 ? 'BELOW' : 'ON GS')
        : '—';

    // Localizer deviation description
    const locDev = ilsData
        ? (Math.abs(locErrDeg) < 0.1 ? 'ON LOC' : (locErrDeg > 0 ? 'RIGHT' : 'LEFT') + ' ' + locDots.toFixed(1) + ' dots')
        : '—';

    ilsHUD.innerHTML = `
<div style="
    background:${t.hudBg};
    border:1.5px solid rgba(0,160,230,0.55);
    border-radius:10px; overflow:hidden;
    box-shadow:0 4px 22px rgba(0,0,0,0.8), 0 0 16px rgba(0,120,200,0.12);
    font-family:${FONT_MONO}; min-width:230px;
">
  <!-- Header -->
  <div style="padding:9px 14px 7px; border-bottom:1px solid ${t.hudSep};
    display:flex; align-items:center; gap:8px;">
    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
      background:rgba(0,200,255,1);box-shadow:0 0 7px rgba(0,200,255,0.9);flex-shrink:0;"></span>
    <span style="color:rgba(0,210,255,0.98);font-size:${ilsPrefs.fontHeader}px;letter-spacing:1.2px;
      text-transform:uppercase;font-weight:bold;flex:1;">ILS  ${rwyLabel}</span>
    <button id="ilsCloseBtn" style="
      background:none; border:1px solid rgba(0,160,230,0.35); color:rgba(0,180,230,0.7);
      border-radius:4px; cursor:pointer; font-size:${ilsPrefs.fontFooter}px; padding:2px 8px; flex-shrink:0;
      font-family:${FONT_SANS}; transition:background .15s;
    ">✕ CLOSE</button>
  </div>

  <!-- CDI instrument -->
  <div id="ilsCDIWrap" style="display:flex;justify-content:center;padding:10px 0 4px;
    border-bottom:1px solid ${t.hudSep};"></div>

  <!-- LOC / GS deviation pills -->
  <div style="display:flex; gap:8px; padding:6px 14px; border-bottom:1px solid ${t.hudSep};">
    <div style="flex:1; background:rgba(0,20,40,0.7); border-radius:6px; padding:5px 8px; text-align:center;">
      <div style="color:${t.hudLabel};font-size:${ilsPrefs.fontPillLabel}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">LOCALIZER</div>
      <div style="color:${locColor};font-size:${ilsPrefs.fontPillValue}px;font-weight:bold;">${locDev}</div>
    </div>
    <div style="flex:1; background:rgba(0,20,40,0.7); border-radius:6px; padding:5px 8px; text-align:center;">
      <div style="color:${t.hudLabel};font-size:${ilsPrefs.fontPillLabel}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">GLIDESLOPE</div>
      <div style="color:${gsColor};font-size:${ilsPrefs.fontPillValue}px;font-weight:bold;">${gsErrFtStr}</div>
    </div>
  </div>

  <!-- Data grid -->
  <div style="padding:8px 14px; display:grid; grid-template-columns:1fr 1fr; gap:6px 10px;
    border-bottom:1px solid ${t.hudSep};">
    <div>
      <div style="color:${t.hudLabel};font-size:${ilsPrefs.fontLabel}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">ALT AGL</div>
      <div style="color:rgba(0,240,255,0.95);font-size:${ilsPrefs.fontValue}px;font-weight:bold">${altStr}</div>
    </div>
    <div>
      <div style="color:${t.hudLabel};font-size:${ilsPrefs.fontLabel}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">DISTANCE</div>
      <div style="color:rgba(255,160,40,0.95);font-size:${ilsPrefs.fontValue}px;font-weight:bold">${distStr}</div>
    </div>
    <div>
      <div style="color:${t.hudLabel};font-size:${ilsPrefs.fontLabel}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">VERT SPEED</div>
      <div style="color:${vsColor};font-size:${ilsPrefs.fontValue}px;font-weight:bold">${vsStr}</div>
    </div>
    <div>
      <div style="color:${t.hudLabel};font-size:${ilsPrefs.fontLabel}px;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">DESCENT °</div>
      <div style="color:rgba(255,220,80,0.95);font-size:${ilsPrefs.fontValue}px;font-weight:bold">${dAngStr}</div>
    </div>
  </div>

  <!-- Bank indicator -->
  <div style="padding:6px 0 0; border-bottom:1px solid ${t.hudSep};">
    <div style="color:${t.hudLabel};font-size:${ilsPrefs.fontLabel}px;letter-spacing:1px;text-transform:uppercase;text-align:center;margin-bottom:2px">BANK ANGLE</div>
    <div id="ilsBankWrap" style="display:flex;justify-content:center;padding:0 0 4px;"></div>
  </div>

  <!-- GS info footer -->
  <div style="padding:5px 14px 7px; display:flex; align-items:center; justify-content:space-between;">
    <span style="color:${t.hudLabel};font-size:${ilsPrefs.fontFooter}px;">3° G/S  ·  Click runway to close ILS</span>
    <span style="color:${bankColor};font-size:${ilsPrefs.fontPillValue}px;font-weight:bold;">${bankStr}</span>
  </div>
</div>`;

    // Inject the canvases
    const cdiWrap  = document.getElementById('ilsCDIWrap');
    if (cdiWrap)  cdiWrap.appendChild(ilsCDICanvas);
    const bankWrap = document.getElementById('ilsBankWrap');
    if (bankWrap) bankWrap.appendChild(ilsBankCanvas);

    // Close button
    const closeBtn = document.getElementById('ilsCloseBtn');
    if (closeBtn) {
        closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(0,160,230,0.15)';
        closeBtn.onmouseout  = () => closeBtn.style.background = 'none';
        closeBtn.onclick = (e) => { e.stopPropagation(); deactivateILS(); };
    }
}

// ═══════════════════════════════════════════════════
// SECTION 13b — TCAS WARNING SYSTEM
// ═══════════════════════════════════════════════════

// ── TCAS state ───────────────────────────────────
let _tcasActive       = false;   // True when a TCAS warning is currently firing
let _tcasFlashTimer   = null;    // setInterval handle for the flash animation
let _tcasAudioCooldown = 0;      // Timestamp: don't replay audio before this time

// ── TCAS tuning — all configurable via settings menu sliders ─────────────
// Values are stored in prefs and accessed as prefs.tcasLookaheadS etc.
// Defaults live in _PREF_DEFAULTS above.
function _tcasLookahead()  { return prefs.tcasLookaheadS     || 30;    }
function _tcasAltBand()    { return prefs.tcasAltBandFt       || 200;   }
function _tcasMinAlt()     { return prefs.tcasMinAltFt        || 200;   }
function _tcasMargin()     { return prefs.tcasMarginM         || 300;   }
function _tcasCooldown()   { return prefs.tcasAudioCooldownMs || 10000; }

// ── TCAS overlay div ─────────────────────────────
const tcasOverlay = document.createElement('div');
tcasOverlay.id = 'radarTCAS';
tcasOverlay.style.cssText = `
    position:fixed; top:0; left:0; width:100%; height:100%;
    pointer-events:none; z-index:2147483640;
    display:none; align-items:center; justify-content:center;
`;
document.body.appendChild(tcasOverlay);

const tcasInner = document.createElement('div');
tcasInner.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
tcasOverlay.appendChild(tcasInner);

const tcasText = document.createElement('div');
tcasText.style.cssText = `
    font-family:Arial,sans-serif; font-size:72px; font-weight:bold;
    letter-spacing:8px; text-transform:uppercase;
    color:rgba(255,0,0,0.5); text-shadow:0 0 30px rgba(255,0,0,0.8);
    user-select:none; pointer-events:none; text-align:center; line-height:1;
`;
tcasText.textContent = 'TRAFFIC';
tcasInner.appendChild(tcasText);

const tcasCallsign = document.createElement('div');
tcasCallsign.style.cssText = `
    font-family:Arial,sans-serif; font-size:26px; font-weight:bold;
    letter-spacing:4px; color:rgba(255,130,0,0.80);
    text-shadow:0 0 16px rgba(255,80,0,0.6);
    user-select:none; pointer-events:none; text-align:center; margin-top:8px;
`;
tcasCallsign.textContent = '';
tcasInner.appendChild(tcasCallsign);

const tcasTimer = document.createElement('div');
tcasTimer.style.cssText = `
    font-family:Arial,sans-serif; font-size:18px; font-weight:bold;
    letter-spacing:2px; color:rgba(255,210,0,0.85);
    text-shadow:0 0 10px rgba(255,180,0,0.5);
    user-select:none; pointer-events:none; text-align:center; margin-top:4px;
`;
tcasTimer.textContent = '';
tcasInner.appendChild(tcasTimer);


// ── TCAS audio (lazy-loaded once) ────────────────
let _tcasAudio = null;
function _getTCASAudio() {
    if (!_tcasAudio) {
        _tcasAudio = new Audio('https://raw.githubusercontent.com/YK3D/Geo-FS-Radar/main/tcas-traffic-warning.mp3');
        _tcasAudio.volume = 1.0;
    }
    return _tcasAudio;
}

function _playTCASAudio() {
    if (!prefs.tcasAudioEnabled) return;          // Audio disabled in settings
    const now = Date.now();
    if (now < _tcasAudioCooldown) return;         // Still within cooldown window
    _tcasAudioCooldown = now + _tcasCooldown();
    try {
        const audio = _getTCASAudio();
        audio.currentTime = 0;
        audio.play().catch(() => {});
    } catch(e) {}
}

function _startTCAS(callsign, etaSec) {
    const isNew = !_tcasActive;
    _tcasActive = true;
    tcasOverlay.style.display = 'flex';
    // Update info fields every call (threat may have changed)
    tcasCallsign.textContent = callsign ? callsign.toUpperCase() : '';
    tcasTimer.textContent    = (etaSec != null && isFinite(etaSec))
        ? 'COLLISION IN ~' + Math.round(etaSec) + 's'
        : '';
    if (isNew) {
        _playTCASAudio();
        let _flashOn = true;
        _tcasFlashTimer = setInterval(() => {
            _flashOn = !_flashOn;
            const op = _flashOn ? '1' : '0';
            tcasText.style.opacity     = op;
            tcasCallsign.style.opacity = op;
            tcasTimer.style.opacity    = op;
        }, 400);
    }
}

function _stopTCAS() {
    if (!_tcasActive) return;
    _tcasActive = false;
    tcasOverlay.style.display = 'none';
    if (_tcasFlashTimer) { clearInterval(_tcasFlashTimer); _tcasFlashTimer = null; }
    // Stop audio immediately if playing
    try { if (_tcasAudio && !_tcasAudio.paused) { _tcasAudio.pause(); _tcasAudio.currentTime = 0; } } catch(e) {}
}

// Store my TCAS projected path endpoint for radar canvas drawing each frame
let _tcasMyEndX = 0, _tcasMyEndY = 0, _tcasHasPath = false;

// ── TCAS: simultaneous-time intersection check ───────────────────────────
//
// The key insight: two aircraft are on a collision course only if they reach
// the SAME POINT at the SAME TIME — not just if their paths happen to cross.
//
// Algorithm:
//   s = parameter along MY segment (0 = now, 1 = 30 s from now)
//   t = parameter along THEIR segment (0 = now, 1 = 30 s from now)
//
//   At time fraction s, I am at position P(s) = my_start + s * my_vector
//   At time fraction t, they are at Q(t) = their_start + t * their_vector
//
//   We find the s,t pair that minimises |P(s) - Q(t)|.
//   IF that minimum distance <= _tcasMargin() metres
//   AND |s - t| <= tcasTimeTolPct/100  (both at same relative time)
//   THEN it's a genuine collision course — alarm fires.
//
// This correctly rejects cases like: my path crosses their path at t=0.1
// but they won't be there until t=0.7. Those aircraft are NOT on a collision course.
function checkTCAS(myLat, myLon, myAltFt, myHdg, mySpeedKts, traffic, myCallsign) {
    if (!prefs.tcasEnabled) { _stopTCAS(); _tcasHasPath = false; return; }

    // Must be airborne
    let myAGL = myAltFt;
    try {
        const av = window.geofs?.animation?.values;
        if (av?.groundElevationFeet !== undefined) myAGL = av.altitude - av.groundElevationFeet;
    } catch(e) {}
    if (myAGL < _tcasMinAlt()) { _stopTCAS(); _tcasHasPath = false; return; }

    // Must be moving to have a meaningful vector
    const mySpeedMs = (mySpeedKts || 0) * 0.514444;
    if (mySpeedMs < 10) { _stopTCAS(); _tcasHasPath = false; return; }

    // My lookahead vector in flat-earth metres (east=X, north=Y)
    const myHdgRad   = myHdg * Math.PI / 180;
    const myPathDist = mySpeedMs * _tcasLookahead();
    _tcasMyEndX  = myPathDist * Math.sin(myHdgRad);   // east
    _tcasMyEndY  = myPathDist * Math.cos(myHdgRad);   // north
    _tcasHasPath = true;

    // Time tolerance: |s - t| must be within this fraction (e.g. 0.08 = ±8%)
    const timeTol = (prefs.tcasTimeTolPct || 8) / 100;

    let threat         = false;
    let threatCallsign = null;
    let threatETA      = null;

    for (const ac of traffic) {
        if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) continue;

        // Skip aircraft with the same callsign as me (own aircraft seen via API)
        const acCs = (ac.cs || ac.callsign || '').toLowerCase().trim();
        const myCs = (_cachedCallsign || myCallsign || '').toLowerCase().trim();
        if (acCs && myCs && myCs !== 'you' && acCs === myCs) continue;

        // Skip Foo players if that filter is active
        if (prefs.hideFooPlayers) {
            if (acCs === 'foo' || acCs.startsWith('foo ') || acCs === 'foo_') continue;
        }

        // Both must be airborne
        const acAltFt = isFinite(parseFloat(ac.al)) ? parseFloat(ac.al)
            : (ac.co.length >= 3 && isFinite(ac.co[2]) ? parseFloat(ac.co[2]) * 3.28084 : null);
        if (acAltFt === null || acAltFt < _tcasMinAlt()) continue;
        if (Math.abs(myAltFt - acAltFt) > _tcasAltBand()) continue;

        // Apply altitude display filter if enabled
        if (prefs.altFilterEnabled) {
            if (acAltFt < prefs.altFilterMinFt || acAltFt > prefs.altFilterMaxFt) continue;
        }

        // Traffic must have a known heading and be moving
        const acH = isFinite(parseFloat(ac.h)) ? parseFloat(ac.h) : null;
        if (acH === null) continue;
        const acS = isFinite(parseFloat(ac.s)) ? parseFloat(ac.s)
            : (typeof ac._computedSpd === 'number' ? ac._computedSpd : 0);
        const acSpeedMs = acS * 0.514444;
        if (acSpeedMs < 10) continue;

        // Traffic position in my local tangent plane
        const [acOffX, acOffY] = latLonToMeters(myLat, myLon, ac.co[0], ac.co[1]);

        // Their lookahead vector
        const acHdgRad   = acH * Math.PI / 180;
        const acPathDist = acSpeedMs * _tcasLookahead();
        const acVecX     = acPathDist * Math.sin(acHdgRad);
        const acVecY     = acPathDist * Math.cos(acHdgRad);

        const myVecX = _tcasMyEndX, myVecY = _tcasMyEndY;
        const mm  = myVecX*myVecX + myVecY*myVecY;
        const aa  = acVecX*acVecX + acVecY*acVecY;
        const ma  = myVecX*acVecX + myVecY*acVecY;
        const det = mm * aa - ma * ma;

        let s, t;
        if (Math.abs(det) < 1e-6) {
            s = 0.5; t = 0.5;
        } else {
            const rm = acOffX*myVecX + acOffY*myVecY;
            const ra = acOffX*acVecX + acOffY*acVecY;
            s = ( aa*rm - ma*ra) / det;
            t = ( ma*rm - mm*ra) / det;
            s = Math.max(0, Math.min(1, s));
            t = Math.max(0, Math.min(1, t));
        }

        const px = s * myVecX;
        const py = s * myVecY;
        const qx = acOffX + t * acVecX;
        const qy = acOffY + t * acVecY;
        const dist = Math.hypot(px - qx, py - qy);

        if (dist <= _tcasMargin() && Math.abs(s - t) <= timeTol) {
            threat         = true;
            threatCallsign = ac.cs || ac.callsign || ac.id || null;
            threatETA      = s * _tcasLookahead(); // seconds until closest approach
            break;
        }
    }

    if (threat) _startTCAS(threatCallsign, threatETA);
    else _stopTCAS();
}

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
// SECTION 14 — RAF DRAW LOOP
// ═══════════════════════════════════════════════════

let _rafActive   = true;
let _lastHeavyTs = 0;

function _rafTick(ts) {
    if (!_rafActive) return;
    const now = performance.now();
    if (now - _lastHeavyTs >= DRAW_INTERVAL && !isDragging) {
        _lastHeavyTs = now;
        drawRadar();
    }
    requestAnimationFrame(_rafTick);
}
requestAnimationFrame(_rafTick);

// ═══════════════════════════════════════════════════
// SECTION 15 — AIRPORT / RUNWAY DRAWING
// ═══════════════════════════════════════════════════

let _airportCache_lastLat   = null;
let _airportCache_lastLon   = null;
let _airportCache_lastRange = null;

function drawAirportsAndRunways(playerLat, playerLon, cx, cy, rotRad) {
    if (!settings.showAirports) { _lastRunwayPositions = []; return { runways: 0, airports: 0 }; }

    // Rebuild runway screen-position list every frame for accurate click detection
    _lastRunwayPositions = [];

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
            const [dx1, dy1] = latLonToMeters(playerLat, playerLon, rwy.lat1, rwy.lon1);
            const [dx2, dy2] = latLonToMeters(playerLat, playerLon, rwy.lat2, rwy.lon2);
            const cDist = Math.hypot((dx1+dx2)/2, (dy1+dy2)/2);
            if (cDist > radarRange * 1.2) return;
            const [x1, y1] = worldToCanvas(dx1, dy1, cx, cy, rotRad);
            const [x2, y2] = worldToCanvas(dx2, dy2, cx, cy, rotRad);
            if (Math.hypot(x1-cx, y1-cy) > radarSize/2 && Math.hypot(x2-cx, y2-cy) > radarSize/2) return;
            const icao = rwy.airport || 'UNKN';
            if (!groups[icao]) {
                const info = airportCache.find(a => a.icao === icao);
                groups[icao] = { runways: [], name: info?.name || icao, icao, dist: cDist };
            }
            if (cDist < groups[icao].dist) groups[icao].dist = cDist;
            groups[icao].runways.push({
                x1, y1, x2, y2,
                isPlaceholder: !!rwy.isPlaceholder,
                rwyData: { lat1: rwy.lat1, lon1: rwy.lon1, lat2: rwy.lat2, lon2: rwy.lon2, name: rwy.name, airport: rwy.airport, length: rwy.length },
            });
        });

        Object.values(groups).forEach(g => {
            if (!g.runways.length) return;
            const pts  = g.runways.flatMap(r => [{x:r.x1,y:r.y1},{x:r.x2,y:r.y2}]);
            const centX = pts.reduce((s,p) => s+p.x, 0) / pts.length;
            const centY = pts.reduce((s,p) => s+p.y, 0) / pts.length;
            const maxR  = Math.max(...pts.map(p => Math.hypot(p.x-centX, p.y-centY)));
            g.centX = centX; g.centY = centY; g.circleR = Math.max(maxR + 8, 14);
        });

        _cachedGroups = groups;
        drawAirportsAndRunways._cachedGroups = groups;
    }

    // Recompute screen positions for this frame (orientation / range might have changed)
    // We need fresh x/y for accurate clicks, so re-project from rwyData
    Object.values(_cachedGroups).forEach(g => {
        g.runways.forEach(r => {
            if (r.rwyData && !r.isPlaceholder) {
                const [dx1,dy1] = latLonToMeters(playerLat, playerLon, r.rwyData.lat1, r.rwyData.lon1);
                const [dx2,dy2] = latLonToMeters(playerLat, playerLon, r.rwyData.lat2, r.rwyData.lon2);
                const [x1,y1] = worldToCanvas(dx1, dy1, cx, cy, rotRad);
                const [x2,y2] = worldToCanvas(dx2, dy2, cx, cy, rotRad);
                r.x1 = x1; r.y1 = y1; r.x2 = x2; r.y2 = y2;
                _lastRunwayPositions.push({ x1, y1, x2, y2, rwyData: r.rwyData, airportICAO: g.icao });
            }
        });
    });

    let nearbyRunways = 0;
    Object.values(_cachedGroups).forEach(g => {
        if (!g.centX) return;
        const name = g.dist < radarRange * 0.5
            ? (g.name.length > 22 ? g.name.slice(0, 22) + '…' : g.name) : g.icao;
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
                const isActiveILS = _ilsActive && _ilsRunway && _ilsRunway === r.rwyData;

                // Highlight ILS-selected runway in cyan
                ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2);
                ctx.strokeStyle = isActiveILS ? 'rgba(0,240,255,0.95)' : 'rgba(255,255,255,0.95)';
                ctx.lineWidth   = isActiveILS ? 10 : 8;
                ctx.stroke();

                ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2);
                ctx.strokeStyle = isActiveILS ? 'rgba(0,180,255,0.5)' : 'rgba(160,160,160,0.35)';
                ctx.lineWidth   = 1.5;
                ctx.stroke();

                // ILS approach beacon on active runway
                if (isActiveILS) {
                    ctx.strokeStyle = 'rgba(0,220,255,0.6)'; ctx.lineWidth = 1;
                    ctx.setLineDash([4, 6]);
                    // Extended centerline 5nm ahead of threshold end being approached
                    ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(
                        r.x1 + (r.x1 - r.x2) * 0.6, r.y1 + (r.y1 - r.y2) * 0.6);
                    ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(r.x2, r.y2); ctx.lineTo(
                        r.x2 + (r.x2 - r.x1) * 0.6, r.y2 + (r.y2 - r.y1) * 0.6);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            });
        }

        const labelAnchorY = allPlaceholder ? (g.centY - 10) : (g.centY - g.circleR - 5);
        ctx.font = `bold ${UI.airportLabelFont}px ${FONT_CANVAS}`;
        ctx.textAlign = 'center';
        const tw = ctx.measureText(name).width;
        ctx.fillStyle = 'rgba(0,18,50,0.78)';
        if (ctx.roundRect) ctx.roundRect(g.centX-tw/2-4, labelAnchorY-12, tw+8, 13, 3);
        else ctx.rect(g.centX-tw/2-4, labelAnchorY-12, tw+8, 13);
        ctx.fill();
        ctx.fillStyle = 'rgba(80,180,255,1)';
        ctx.fillText(name, g.centX, labelAnchorY - 1);

        // "ILS" badge on airport with active runway
        if (_ilsActive && _ilsAirportICAO === g.icao) {
            ctx.font = 'bold 9px Arial';
            const badge = ' ILS ';
            const bw = ctx.measureText(badge).width + 4;
            ctx.fillStyle = 'rgba(0,180,255,0.9)';
            ctx.fillRect(g.centX - bw/2, labelAnchorY - 26, bw, 12);
            ctx.fillStyle = '#000'; ctx.textAlign = 'center';
            ctx.fillText(badge, g.centX, labelAnchorY - 16);
        }
    });

    return { runways: nearbyRunways, airports: Object.keys(_cachedGroups).length };
}

// ═══════════════════════════════════════════════════
// SECTION 16 — PLAYER TRIANGLE
// ═══════════════════════════════════════════════════

function drawPlayerTriangle(cx, cy, playerHeading, isGamePaused) {
    if (!settings.showPlayerTriangle) return;
    const angleRad = (settings.orientMode === 'north') ? (playerHeading * Math.PI / 180) : 0;
    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    ctx.setTransform(cos, sin, -sin, cos, cx, cy);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, -UI.playerTriTip);
    ctx.lineTo( UI.playerTriBase,  UI.playerTriBaseOff);
    ctx.lineTo(-UI.playerTriBase,  UI.playerTriBaseOff);
    ctx.closePath();
    ctx.fillStyle   = isGamePaused ? 'rgba(150,150,150,0.9)' : 'rgba(0,255,0,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white'; ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
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
    const cx = radarSize / 2, cy = radarSize / 2;

    ctx.clearRect(0, 0, radarSize, radarSize);
    ctx.beginPath(); ctx.arc(cx, cy, radarSize/2, 0, Math.PI*2);
    ctx.fillStyle = t.bg; ctx.fill();

    let player = null, playerHeading = 0, playerCallsign = 'YOU';
    let playerLat = 0, playerLon = 0, playerAlt = 0, playerAltFt = 0;

    try {
        player = geofs.aircraft?.instance;
        if (player) {
            // Use geofs.animation.values for accurate, pre-computed flight data (same approach as GeoFS Information Display script)
            const av = geofs.animation?.values;
            playerHeading  = av?.heading360 ?? player.animationValue?.heading360 ?? 0;       // Heading in degrees 0–360
            playerCallsign = player.callsign || 'YOU';                                         // Aircraft callsign string
            playerLat      = player.llaLocation[0];                                            // Latitude in decimal degrees
            playerLon      = player.llaLocation[1];                                            // Longitude in decimal degrees
            playerAlt      = player.llaLocation[2];                                            // Altitude in metres
            // Prefer animation.values.altitude (ft) for accuracy; fall back to metres→feet conversion
            playerAltFt    = av?.altitude ?? (playerAlt * 3.28084);                           // Altitude in feet
            if (isFinite(playerLat) && isFinite(playerLon) && (playerLat !== 0 || playerLon !== 0)) {
                _lastValidLat   = playerLat;   // Cache last valid position
                _lastValidLon   = playerLon;
                _lastValidAltFt = playerAltFt;

                // ── Trail recording ──────────────────────────
                if (prefs.showTrail) {
                    const now = Date.now();
                    // Add a point every ~500 ms (skip if too close in time)
                    if (_trailPoints.length === 0 || now - _trailPoints[_trailPoints.length-1].time > 500) {
                        _trailPoints.push({ lat: playerLat, lon: playerLon, time: now });
                    }
                    // Trim points older than trailLengthSec
                    const cutoff = now - (prefs.trailLengthSec * 1000);
                    while (_trailPoints.length > 0 && _trailPoints[0].time < cutoff) _trailPoints.shift();
                    // Also enforce max point count
                    while (_trailPoints.length > TRAIL_MAX_PTS) _trailPoints.shift();
                } else {
                    _trailPoints.length = 0; // Clear trail when disabled
                }
            }
        }
    } catch(e) {}

    const hasPos = !!player || (_lastValidLat !== null);
    if (!player && _lastValidLat !== null) {
        playerLat   = _lastValidLat;
        playerLon   = _lastValidLon;
        playerAltFt = _lastValidAltFt;
    }

    const _now = Date.now();
    if (_now - _lastMenuInfoUpdate > MENU_INFO_UPDATE_INTERVAL) {
        _lastMenuInfoUpdate = _now;
        _cachedCallsign = detectCallsign();
        if (_cachedCallsign) window.playerCallsign = _cachedCallsign;
    }
    const displayCallsign = _cachedCallsign || playerCallsign;
    updateMenuInfoCallsign(displayCallsign, hasPos ? playerLat : null, hasPos ? playerLon : null);

    const myData = hasPos ? { lat: playerLat, lon: playerLon, altFt: playerAltFt } : null;
    const rotRad = settings.orientMode === 'track' ? (playerHeading * Math.PI / 180) : 0;

    // ── Clip to circle ────────────────────────────
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radarSize/2, 0, Math.PI*2); ctx.clip();

    // ── Grid lines ────────────────────────────────
    ctx.strokeStyle = t.grid; ctx.lineWidth = UI.gridLineW;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, radarSize);
    ctx.moveTo(0, cy); ctx.lineTo(radarSize, cy);
    ctx.stroke();

    // ── Range rings ───────────────────────────────
    if (settings.showRings) {
        for (let i = 1; i <= 3; i++) {
            const rr = (radarSize / 2) * (i / 3);
            ctx.strokeStyle = t.ring; ctx.lineWidth = UI.ringLineW;
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2); ctx.stroke();
            if (settings.showRingLabels) {
                const dist = radarRange * (i / 3);
                const lbl  = dist >= 1000 ? (dist/1000).toFixed(dist%1000===0?0:1)+' km' : Math.round(dist)+' m';
                ctx.font = `bold ${UI.ringLabelFont}px ${FONT_CANVAS}`;
                const tw = ctx.measureText(lbl).width;
                const lx = cx + 8, ly = cy - rr + 10;
                ctx.fillStyle = 'rgba(0,0,0,0.65)';
                ctx.fillRect(lx - 4, ly - 12, tw + 8, 17);
                ctx.fillStyle = t.ringLabel; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(lbl, lx, ly - 2);
            }
        }
    }

    // ── Compass ───────────────────────────────────
    {
        const dirs  = ['N','E','S','W'];
        const edgeR = radarSize/2 - 16;
        ctx.font = `bold ${UI.compassFont}px ${FONT_CANVAS}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
            ctx.font = `bold ${UI.compassHdgFont}px ${FONT_CANVAS}`;
            ctx.fillStyle = 'rgba(180,180,180,0.55)';
            ctx.fillText(`HDG ${Math.round(playerHeading).toString().padStart(3,'0')}°`, cx, 30);
        }
    }

    // ── Airports & runways ────────────────────────
    if (!isGamePaused && hasPos) {
        drawAirportsAndRunways(playerLat, playerLon, cx, cy, rotRad);
    }

    // ── Own-aircraft trail ────────────────────────
    if (prefs.showTrail && hasPos && _trailPoints.length > 1) {
        const now = Date.now();
        ctx.save();
        for (let i = 1; i < _trailPoints.length; i++) {
            const pt  = _trailPoints[i];
            const ptP = _trailPoints[i - 1];
            // Age fraction 0 (oldest) → 1 (newest) for opacity fade
            const ageFrac = (pt.time - _trailPoints[0].time) /
                            Math.max(1, _trailPoints[_trailPoints.length-1].time - _trailPoints[0].time);
            const alpha = 0.15 + ageFrac * 0.65; // fade from dim to bright
            const [dx1, dy1] = latLonToMeters(playerLat, playerLon, ptP.lat, ptP.lon);
            const [dx2, dy2] = latLonToMeters(playerLat, playerLon, pt.lat,  pt.lon);
            const [sx1, sy1] = worldToCanvas(dx1, dy1, cx, cy, rotRad);
            const [sx2, sy2] = worldToCanvas(dx2, dy2, cx, cy, rotRad);
            ctx.strokeStyle = T().trailColor(alpha); // Use theme trail colour
            ctx.lineWidth   = prefs.trailWidth || 2;  // Trail thickness from prefs
            ctx.beginPath();
            ctx.moveTo(sx1, sy1);
            ctx.lineTo(sx2, sy2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── Other aircraft blips ──────────────────────
    lastBlipPositions = [];
    let nearestAc = null, nearestMeters = Infinity;

    if (settings.showTraffic && !isGamePaused && aircraftListCache.length > 0 && hasPos) {
        const myCs = _cachedCallsign || playerCallsign;
        aircraftListCache.forEach(ac => {
            if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) return;
            if (ac.cs && myCs && myCs !== 'YOU' && ac.cs.toLowerCase() === myCs.toLowerCase()) return;

            // ── Hide players named "Foo" ──────────────
            if (prefs.hideFooPlayers && ac.cs && (ac.cs === 'Foo' || ac.cs.toLowerCase() === 'foo')) return;

            // ── Hide players on the ground ────────────
            // A player is considered "on ground" if their AGL is very low (< 30 ft)
            if (prefs.hideGroundPlayers) {
                const acAltFt = isFinite(parseFloat(ac.al)) ? parseFloat(ac.al)
                    : (ac.co.length >= 3 && isFinite(parseFloat(ac.co[2])) ? parseFloat(ac.co[2]) * 3.28084 : null);
                if (acAltFt !== null && acAltFt < 200) return;
            }

            // ── Altitude filter ────────────────────────
            if (prefs.altFilterEnabled) {
                const acAltFt = isFinite(parseFloat(ac.al)) ? parseFloat(ac.al)
                    : (ac.co.length >= 3 && isFinite(parseFloat(ac.co[2])) ? parseFloat(ac.co[2]) * 3.28084 : null);
                if (acAltFt !== null && (acAltFt < prefs.altFilterMinFt || acAltFt > prefs.altFilterMaxFt)) return;
            }
            const [dx, dy] = latLonToMeters(playerLat, playerLon, ac.co[0], ac.co[1]);
            const distM    = Math.hypot(dx, dy);
            if (distM < nearestMeters) { nearestMeters = distM; nearestAc = ac; }
            if (distM > radarRange) return;
            ctx.save();
            try {
                if (_trackedId && settings.isolateTracked && ac.id !== _trackedId) { ctx.restore(); return; }
                const [rx, ry] = worldToCanvas(dx, dy, cx, cy, rotRad);
                if (Math.hypot(rx-cx, ry-cy) > radarSize/2) { ctx.restore(); return; }
                lastBlipPositions.push({ x:rx, y:ry, ac, distance:distM, myData });
                const isTrackedBlip = !!_trackedId && ac.id === _trackedId;
                ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.setLineDash([]);
                const acH  = parseFloat(ac.h);
                const _apiSpd  = parseFloat(ac.s);
                const _compSpd = typeof ac._computedSpd === 'number' ? ac._computedSpd : NaN;
                const acS = isFinite(_apiSpd) ? _apiSpd : (isFinite(_compSpd) ? _compSpd : NaN);
                if (settings.showVectors && isFinite(acH) && isFinite(acS)) {
                    const speedMs = acS * 0.514444;
                    const vecLen  = Math.min((speedMs * 30) / radarRange * (radarSize / 2), radarSize/2);
                    const hRad    = (acH * Math.PI / 180) - rotRad;
                    const vx = rx + Math.sin(hRad) * vecLen, vy = ry - Math.cos(hRad) * vecLen;
                    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(vx, vy);
                    ctx.strokeStyle = T().vector; ctx.lineWidth = UI.vectorLineW;
                    ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
                }
                const blipColor  = isTrackedBlip ? 'rgba(255,220,60,1)' : T().blipFill;
                const blipStroke = isTrackedBlip ? 'rgba(255,240,120,0.9)' : 'rgba(255,255,255,0.7)';
                if (isTrackedBlip) {
                    ctx.beginPath();
                    ctx.arc(rx, ry, (settings.showBlipTriangle && isFinite(acH) ? UI.blipTriTip : UI.blipDotR) + 7, 0, Math.PI*2);
                    ctx.strokeStyle = 'rgba(255,220,60,0.4)'; ctx.lineWidth = 2.5; ctx.stroke();
                }
                if (settings.showBlipTriangle && isFinite(acH)) {
                    const angle = (acH * Math.PI / 180) - rotRad;
                    ctx.save(); ctx.translate(rx, ry); ctx.rotate(angle);
                    ctx.beginPath(); ctx.moveTo(0,-UI.blipTriTip); ctx.lineTo(UI.blipTriBase,UI.blipTriTip*0.55); ctx.lineTo(-UI.blipTriBase,UI.blipTriTip*0.55); ctx.closePath();
                    ctx.fillStyle = blipColor; ctx.fill();
                    ctx.strokeStyle = blipStroke; ctx.lineWidth = isTrackedBlip ? 2 : 1.5; ctx.stroke();
                    ctx.restore();
                } else {
                    const blipR = isTrackedBlip ? UI.blipDotRActive : UI.blipDotR;
                    ctx.fillStyle = blipColor; ctx.beginPath(); ctx.arc(rx, ry, blipR, 0, Math.PI*2); ctx.fill();
                    ctx.strokeStyle = blipStroke; ctx.lineWidth = isTrackedBlip ? 2 : 1; ctx.stroke();
                }
                const blipBottom = settings.showBlipTriangle && isFinite(acH) ? ry+UI.blipTriTip+4 : ry+(isTrackedBlip?UI.blipDotRActive:UI.blipDotR)+4;
                let labelY = blipBottom;
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.font = `bold ${UI.blipLabelFont}px ${FONT_CANVAS}`;
                function drawTag(text, color, yOff) {
                    const tw = ctx.measureText(text).width, padX = UI.blipLabelPadX, rowH = UI.blipLabelRowH;
                    ctx.fillStyle = 'rgba(0,0,0,0.72)';
                    ctx.fillRect(rx-tw/2-padX, yOff, tw+padX*2, rowH-1);
                    ctx.fillStyle = color; ctx.fillText(text, rx, yOff+2);
                    return yOff + rowH;
                }
                if (settings.showCallsign && ac.cs) labelY = drawTag(ac.cs.substring(0,12), T().blipLabel, labelY);
                const rawAlt = isFinite(parseFloat(ac.al)) ? parseFloat(ac.al) : (ac.co.length>=3 && isFinite(parseFloat(ac.co[2])) ? parseFloat(ac.co[2])*3.28084 : null);
                const altFmt = rawAlt !== null ? fmtAlt(rawAlt) : null;
                if (settings.showAltitude && altFmt !== null) labelY = drawTag(altFmt, T().blipAlt, labelY);
                const spdFmt = isFinite(acS) ? fmtSpd(acS) : null;
                if (settings.showSpeed && spdFmt !== null) labelY = drawTag(spdFmt, T().blipSpeed, labelY);
                if (settings.showBlipDist) labelY = drawTag(fmtDistMetric(distM), T().blipLabel, labelY);
            } catch(e) {
            } finally { ctx.restore(); }
        });
    }

    ctx.restore(); // end circle clip

    // ── TCAS collision check ───────────────────────
    if (hasPos && !isGamePaused && settings.showTraffic) {
        let mySpeedKts = 0;
        try {
            const av = geofs.animation?.values;
            mySpeedKts = av?.groundSpeed ?? av?.kias ?? 0;
        } catch(e) {}
        checkTCAS(playerLat, playerLon, playerAltFt, playerHeading, mySpeedKts, aircraftListCache, _cachedCallsign || playerCallsign);
    } else {
        _stopTCAS();
    }

    // ── Player callsign tag ───────────────────────
    let _playerTagBottomY = cy + UI.playerTriBaseOff + UI.playerTriTip + 13;
    if (settings.showMyCallsign && displayCallsign) {
        const lbl = displayCallsign.substring(0, 12);
        ctx.font = `bold ${UI.playerCsFont}px ${FONT_CANVAS}`;
        const tw = ctx.measureText(lbl).width;
        const ty = _playerTagBottomY;
        ctx.fillStyle   = isGamePaused ? 'rgba(80,80,80,0.85)' : 'rgba(0,80,0,0.85)';
        ctx.strokeStyle = T().playerLabel; ctx.lineWidth = 1;
        ctx.fillRect(cx-tw/2-7, ty-11, tw+14, 22);
        ctx.strokeRect(cx-tw/2-7, ty-11, tw+14, 22);
        ctx.fillStyle = T().playerLabel;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, cx, ty);
    }

    // ── Paused overlay ────────────────────────────
    if (isGamePaused) {
        ctx.fillStyle = T().pauseText;
        ctx.font = `bold ${UI.pausedFont}px ${FONT_CANVAS}`;
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', cx, radarSize - 30);
    }

    // ── Player triangle — always on top ───────────
    drawPlayerTriangle(cx, cy, playerHeading, isGamePaused);

    // ── TCAS projected path line — starts at nose of player triangle ─────
    // Line = nose tip → nose tip + (speed × TCAS_LOOKAHEAD_S) metres along heading.
    if (_tcasHasPath && prefs.tcasEnabled && hasPos && !isGamePaused) {
        const scale    = (radarSize / 2) / radarRange; // canvas px per metre
        const isNorthUp = settings.orientMode === 'north';
        const fwdAngle  = isNorthUp ? (playerHeading * Math.PI / 180) : 0;
        const cosFwd = Math.cos(fwdAngle), sinFwd = Math.sin(fwdAngle);

        // Triangle nose tip in canvas coords (always UI.playerTriTip px forward from centre)
        const tipX = cx + sinFwd * UI.playerTriTip;
        const tipY = cy - cosFwd * UI.playerTriTip;

        // Convert path metres (east/north) → canvas pixels using the blip-loop rotation
        const cosR = Math.cos(-rotRad), sinR = Math.sin(-rotRad);
        // Rotate east/north into screen-right / screen-up
        const scrRight =  _tcasMyEndX * cosR + _tcasMyEndY * sinR;
        const scrUp    = -_tcasMyEndX * sinR + _tcasMyEndY * cosR;
        // End point: centre + rotated path, no extra tip offset (tip is already baked into tipX/Y start)
        const ex = cx + scrRight * scale;
        const ey = cy - scrUp   * scale;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(ex, ey);
        ctx.setLineDash([7, 5]);
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = _tcasActive
            ? 'rgba(255,60,60,0.70)'
            : 'rgba(255,190,0,0.32)';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

// ═══════════════════════════════════════════════════
// SECTION 18 — CHASE / ESCORT AUTOPILOT SYSTEM
// ═══════════════════════════════════════════════════

// ── PID constants ────────────────────────────────
const CHASE_PID_KP        =  8.0;
const CHASE_PID_KI        =  0.05;
const CHASE_PID_KD        =  3.0;
const CHASE_HDG_KP        = 20.0;
const CHASE_HDG_MAX_CORR  = 35;
const CHASE_MIN_SPEED_KT  = 60;
const CHASE_MAX_SPEED_KT  = 1000;
const CHASE_ARRIVAL_RATIO = 1.25;
const CHASE_DECEL_ZONE    = 8;
const CHASE_OVERSHOOT_R   = 0.85;
const AP_UI_SYNC_MS       = 400;
const AP_HDG_THRESH       = 1;
const AP_SPD_THRESH       = 5;
const AP_ALT_THRESH       = 50;

// ── Engagement state — prevents repeated toggle() calls ─────────────
// This is THE fix for the flicker: _apEngaged tracks whether we have
// already turned the AP on. _apEnable() is now a no-op if already engaged.
let _apEngaged = false;

// ── Autopilot wrappers ───────────────────────────

function _apFireInputChange(el, value) {
    if (!el) return;
    el.value = value;
    ['input', 'change'].forEach(type =>
        el.dispatchEvent(new Event(type, { bubbles: true })));
}

// Engage the autopilot ONCE. Subsequent calls while _apEngaged === true
// are no-ops, which is what prevents the toggle flicker.
function _apEnable() {
    if (_apEngaged) return;
    try {
        const ap = window.geofs?.autopilot;
        if (!ap) return;

        if (typeof ap.toggle === 'function') {
            if (!ap.engaged) ap.toggle();
            if (typeof ap.setMode === 'function') ap.setMode('HDG');
            _apEngaged = true;
            _apSyncBar(); // ← sync the bar exactly once, immediately after engagement
            return;
        }
        if (typeof ap.activate === 'function') { ap.activate(); _apEngaged = true; _apSyncBar(); return; }
        if (typeof ap.engage   === 'function') { ap.engage();   _apEngaged = true; _apSyncBar(); return; }
        if ('active'  in ap) { ap.active  = true; _apEngaged = true; _apSyncBar(); return; }
        if ('on'      in ap) { ap.on      = true; _apEngaged = true; _apSyncBar(); return; }
        if ('enabled' in ap) { ap.enabled = true; _apEngaged = true; _apSyncBar(); return; }
        const apBtn = document.querySelector(
            '[data-feature="autopilot"] button, .geofs-autopilot-toggle, #autopilot-toggle');
        if (apBtn && apBtn.dataset.active !== 'true') {
            apBtn.click();
            _apEngaged = true;
            _apSyncBar();
        }
    } catch(e) {}
}

// Disengage the autopilot and clear the engagement flag.
// Call this when chase/escort is stopped so _apEnable() works on the next session.
function _apDisable() {
    if (!_apEngaged) return;
    try {
        const ap = window.geofs?.autopilot;
        if (!ap) { _apEngaged = false; return; }

        if (typeof ap.toggle === 'function') {
            if (ap.engaged) ap.toggle();
        } else if (typeof ap.deactivate === 'function') { ap.deactivate(); }
        else if (typeof ap.disengage   === 'function') { ap.disengage(); }
        else if ('active'  in ap) { ap.active  = false; }
        else if ('on'      in ap) { ap.on      = false; }
        else if ('enabled' in ap) { ap.enabled = false; }
        else {
            const apBtn = document.querySelector(
                '[data-feature="autopilot"] button, .geofs-autopilot-toggle, #autopilot-toggle');
            if (apBtn && apBtn.dataset.active === 'true') apBtn.click();
        }
    } catch(e) {}
    _apEngaged = false;
}

function _apSetHeading(hdg) {
    try {
        const ap = window.geofs?.autopilot;
        if (!ap) return;
        const h = ((hdg % 360) + 360) % 360;
        if (Math.abs(((h - _apLastHdg + 540) % 360) - 180) < AP_HDG_THRESH) return;
        _apLastHdg = h;
        if (typeof ap.setCourse === 'function') { ap.setCourse(h); return; }
        const animVals = window.geofs?.animation?.values;
        if (ap.values != null && ap.values !== animVals) {
            if ('heading'    in ap.values) ap.values.heading    = h;
            if ('heading360' in ap.values) ap.values.heading360 = h;
            return;
        }
        if (typeof ap.setHDG     === 'function') { ap.setHDG(h); return; }
        if (typeof ap.setHeading === 'function') { ap.setHeading(h); return; }
        if (typeof ap.set        === 'function') { ap.set('heading', h); return; }
        if ('selectedHeading' in ap) { ap.selectedHeading = h; return; }
        if ('targetHeading'   in ap) { ap.targetHeading   = h; return; }
        if ('hdg'             in ap) { ap.hdg             = h; return; }
        if ('heading'         in ap) { ap.heading         = h; return; }
        _apSteerByBank(h);
    } catch(e) {}
}

function _apSteerByBank(targetHdg) {
    try {
        const av = window.geofs?.animation?.values;
        const currentHdg = av?.heading360 ?? 0;
        const err = ((targetHdg - currentHdg + 540) % 360) - 180;
        const bankDeg   = Math.max(-45, Math.min(45, err * 0.6));
        const rollInput = bankDeg / 45;
        const ac = window.geofs?.aircraft?.instance;
        if (!ac) return;
        if (Array.isArray(ac.controls))           { ac.controls[0] = rollInput; }
        else if (ac.controls?.roll !== undefined) { ac.controls.roll = rollInput; }
    } catch(e) {}
}

function _apSetSpeed(kts) {
    try {
        const ap = window.geofs?.autopilot;
        if (!ap) return;
        const s = Math.max(CHASE_MIN_SPEED_KT, Math.min(CHASE_MAX_SPEED_KT, Math.round(kts)));
        if (Math.abs(s - _apLastSpd) < AP_SPD_THRESH) return;
        _apLastSpd = s;
        if (typeof ap.setSpeed === 'function') { ap.setSpeed(s); return; }
        if (ap.values != null && 'speed' in ap.values) { ap.values.speed = s; return; }
        if ('speed' in ap) { ap.speed = s; return; }
    } catch(e) {}
}

function _apSetAltitude(ft) {
    try {
        const ap = window.geofs?.autopilot;
        if (!ap || !isFinite(ft)) return;
        const a = Math.round(ft);
        if (Math.abs(a - _apLastAlt) < AP_ALT_THRESH) return;
        _apLastAlt = a;
        if (typeof ap.setAltitude === 'function') { ap.setAltitude(a); return; }
        if (ap.values != null && 'altitude' in ap.values) { ap.values.altitude = a; return; }
        if ('altitude' in ap) { ap.altitude = a; return; }
    } catch(e) {}
}

function _apSyncBar() {
    const now = Date.now();
    if (now - _apUiSync < AP_UI_SYNC_MS) return;
    _apUiSync = now;
    if (_apLastHdg > -900) {
        _apFireInputChange(document.querySelector('.geofs-autopilot-bar .geofs-autopilot-course'), _apLastHdg);
        _apFireInputChange(document.querySelector('.geofs-autopilot .geofs-autopilot-course'), _apLastHdg);
    }
    if (_apLastSpd >= 0) {
        _apFireInputChange(document.querySelector('.geofs-autopilot-bar .geofs-autopilot-knots'), _apLastSpd);
        _apFireInputChange(document.querySelector('.geofs-autopilot-kias'), _apLastSpd);
    }
    if (_apLastAlt > -9e8) {
        _apFireInputChange(document.querySelector('.geofs-autopilot-bar .geofs-autopilot-altitude'), _apLastAlt);
        _apFireInputChange(document.querySelector('.geofs-autopilot .geofs-autopilot-altitude'), _apLastAlt);
    }
}

function _apSetAirbrakes(deploy) {
    try {
        const c = window.controls;
        if (!c?.airbrakes) return;
        const target = deploy ? 1 : 0;
        if (c.airbrakes.target === target) return;
        c.airbrakes.target = target;
        if (typeof c.setPartAnimationDelta === 'function')
            c.setPartAnimationDelta(c.airbrakes);
        _apAirbrakesOn = deploy;
    } catch(e) {}
}

function _apCurrentSpeed() {
    try {
        const av = window.geofs?.animation?.values;
        const s = av?.groundSpeed ?? av?.kias ?? 200;
        return isFinite(s) ? Math.max(0, s) : 200;
    } catch(e) { return 200; }
}

// ── PID step helpers ─────────────────────────────

function _pidStep(pid, error, dt) {
    pid.integral += error * dt;
    pid.integral  = Math.max(-200, Math.min(200, pid.integral));
    const deriv   = dt > 0 ? (error - pid.prevError) / dt : 0;
    pid.prevError = error;
    pid.lastTime  = Date.now();
    return CHASE_PID_KP * error + CHASE_PID_KI * pid.integral + CHASE_PID_KD * deriv;
}

function _hdgPidStep(pid, error, dt) {
    pid.prevError = error;
    pid.lastTime  = Date.now();
    return Math.max(-CHASE_HDG_MAX_CORR, Math.min(CHASE_HDG_MAX_CORR, CHASE_HDG_KP * error));
}

// ── Geometry helper ──────────────────────────────

function _relativePosition(myLat, myLon, trackedLat, trackedLon, trackedHdgDeg) {
    const [vEast, vNorth] = latLonToMeters(trackedLat, trackedLon, myLat, myLon);
    const θ = trackedHdgDeg * Math.PI / 180;
    const forwardM  =  vEast * Math.sin(θ) + vNorth * Math.cos(θ);
    const lateralM  =  vEast * Math.cos(θ) - vNorth * Math.sin(θ);
    return { forwardM, lateralM };
}

// ── Main chase/escort tick ───────────────────────
// _apEnable() is called each tick but is a no-op after first engagement —
// the AP stays on until _apDisable() is explicitly called on disengage.

function _tickChaseEscort(myLat, myLon, myData) {
    if (!_chaseActive || !_trackedAc || !_trackedAc.co) return;

    const trackedLat   = _trackedAc.co[0];
    const trackedLon   = _trackedAc.co[1];
    const trackedHdg   = isFinite(parseFloat(_trackedAc.h)) ? parseFloat(_trackedAc.h) : 0;
    const trackedAltFt = isFinite(parseFloat(_trackedAc.al)) ? parseFloat(_trackedAc.al)
        : (_trackedAc.co.length >= 3 && isFinite(parseFloat(_trackedAc.co[2]))
            ? parseFloat(_trackedAc.co[2]) * 3.28084 : null);

    const now   = Date.now();
    const dtRaw = (now - (_chasePid.lastTime || now)) / 1000;
    const dt    = Math.min(2, Math.max(0.05, dtRaw));

    const distNm      = calcDistNm(myLat, myLon, trackedLat, trackedLon);
    const bearingDeg  = calcBearing(myLat, myLon, trackedLat, trackedLon);
    const escortDistM = _escortDistNm * 1852;

    if (_chasePhase === 'chase') {
        _apEnable(); // no-op if already engaged
        _apSetHeading(bearingDeg);
        if (trackedAltFt !== null) _apSetAltitude(trackedAltFt);

        const decelZoneNm = _escortDistNm * CHASE_DECEL_ZONE;
        const closeRatio  = Math.max(0, Math.min(1, distNm / decelZoneNm));
        const chaseSpd    = Math.round(
            CHASE_MIN_SPEED_KT + (CHASE_MAX_SPEED_KT - CHASE_MIN_SPEED_KT) * closeRatio);

        if (distNm < _escortDistNm * CHASE_OVERSHOOT_R) {
            _apSetSpeed(CHASE_MIN_SPEED_KT);
            _apSetAirbrakes(true);
        } else {
            _apSetSpeed(chaseSpd);
            _apSetAirbrakes(false);
        }

        if (distNm <= _escortDistNm * CHASE_ARRIVAL_RATIO) {
            _chasePhase = 'escort';
            _apSetAirbrakes(false);
            _chasePid   = { integral: 0, prevError: 0, lastTime: now };
            _headingPid = { integral: 0, prevError: 0, lastTime: now };
            _lastHudUpdate = 0;
            _lastNearestCs = null;
        }

    } else {
        _apEnable(); // no-op if already engaged

        if (_escortMode === null) {
            _apSetHeading(trackedHdg);
            if (trackedAltFt !== null) _apSetAltitude(trackedAltFt);
            const errNm  = distNm - _escortDistNm;
            const pidOut = _pidStep(_chasePid, errNm, dt);
            _apSetSpeed(Math.max(CHASE_MIN_SPEED_KT,
                Math.min(CHASE_MAX_SPEED_KT, _apCurrentSpeed() + pidOut)));
            _apSyncBar();
            return;
        }

        const { forwardM, lateralM } = _relativePosition(
            myLat, myLon, trackedLat, trackedLon, trackedHdg);

        if (_escortMode === 'left' || _escortMode === 'right') {
            const targetLateral = (_escortMode === 'left') ? -escortDistM : +escortDistM;
            const lateralErr    = (lateralM - targetLateral) / 1852;
            const hdgCorr       = _hdgPidStep(_headingPid, lateralErr, dt);

            _apSetHeading(trackedHdg - hdgCorr);
            if (trackedAltFt !== null) _apSetAltitude(trackedAltFt);

            const trackedSpd = isFinite(parseFloat(_trackedAc.s)) ? parseFloat(_trackedAc.s)
                : (typeof _trackedAc._computedSpd === 'number'
                    ? _trackedAc._computedSpd : _apCurrentSpeed());
            const distErrNm = distNm - _escortDistNm;
            const spdAdj    = CHASE_PID_KP * distErrNm * 0.3;
            _apSetSpeed(Math.max(CHASE_MIN_SPEED_KT,
                Math.min(CHASE_MAX_SPEED_KT, trackedSpd + spdAdj)));

        } else if (_escortMode === 'forward' || _escortMode === 'back') {
            const targetForward = (_escortMode === 'forward') ? +escortDistM : -escortDistM;
            const forwardErrNm  = (forwardM - targetForward) / 1852;
            const pidOut        = _pidStep(_chasePid, -forwardErrNm, dt);

            _apSetHeading(trackedHdg);
            if (trackedAltFt !== null) _apSetAltitude(trackedAltFt);

            const baseSpeed = isFinite(parseFloat(_trackedAc.s)) ? parseFloat(_trackedAc.s)
                : (typeof _trackedAc._computedSpd === 'number'
                    ? _trackedAc._computedSpd : _apCurrentSpeed());
            _apSetSpeed(Math.max(CHASE_MIN_SPEED_KT,
                Math.min(CHASE_MAX_SPEED_KT, baseSpeed + pidOut)));
        }
    }
    _apSyncBar();
}

// ═══════════════════════════════════════════════════
// SECTION 19 — REPOSITION INTERVAL
// ═══════════════════════════════════════════════════

setInterval(repositionUI, REPOSITION_INTERVAL);

// ═══════════════════════════════════════════════════
// SECTION 19 — INIT
// ═══════════════════════════════════════════════════

setTimeout(() => {
    createMenu();
    loadPosition();
    applyTheme();
    repositionNearestHUD();
    repositionILSHUD();
}, INIT_DELAY);
