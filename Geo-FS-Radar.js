// ==UserScript==
// @name         GeoFS Radar
// @namespace    http://tampermonkey.net/
// @version      5.00
// @description  On screen radar for GeoFS with menu, TCAS vectors, night mode, track-up, blip popups
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

let radarRange   = parseInt(localStorage.getItem('radarRange') || '5000');
let isGamePaused = false;

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
};

// Load saved settings
try {
    const saved = JSON.parse(localStorage.getItem('radarSettings') || '{}');
    Object.assign(settings, saved);
} catch(e) {}

// Force these on at startup — a stale false in localStorage is the most
// common reason they disappear silently.
settings.showPlayerTriangle = true;
settings.showSpeed          = true;
settings.showAltitude       = true;

function saveSettings() {
    localStorage.setItem('radarSettings', JSON.stringify(settings));
    localStorage.setItem('radarRange', String(radarRange));
    applyTheme();
}

// ── Colour theme (switches on nightMode) ────────────
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
    }
};

function T() { return settings.nightMode ? THEMES.night : THEMES.normal; }

function applyTheme() {
    const t = T();
    radarCanvas.style.border     = `2px solid ${t.canvasBorder}`;
    radarCanvas.style.boxShadow  = t.canvasGlow;
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
    position:fixed; width:110px; height:46px;
    background:rgba(0,40,0,0.82); border:1.5px solid rgba(0,255,0,0.6);
    border-radius:12px; box-shadow:0 0 10px rgba(0,255,0,0.35);
    z-index:2147483646; display:flex; flex-direction:column;
    align-items:center; justify-content:center; pointer-events:none;
`;
rangeBox.innerHTML = `
    <span id="rangeVal" style="color:#0f0;font:bold 17px Arial;text-shadow:0 0 4px rgba(0,255,0,0.6)">${(radarRange/1000).toFixed(1)} km</span>
    <span style="color:#0f0;font:10px Arial;opacity:.7;margin-top:1px">RANGE</span>
`;
document.body.appendChild(rangeBox);

function updateRangeBox() {
    const el = document.getElementById('rangeVal');
    if (el) el.textContent = `${(radarRange/1000).toFixed(1)} km`;
}

// ═══════════════════════════════════════════════════
// SECTION 3 — DRAGGING
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
}

// ═══════════════════════════════════════════════════
// SECTION 4 — MENU
// ═══════════════════════════════════════════════════

let menuOpen = false;

function createMenu() {
    const btn = document.createElement('button');
    btn.id = 'radarMenuBtn';
    btn.title = 'Radar Settings';
    btn.innerHTML = '☰';
    btn.style.cssText = `
        position:fixed; width:32px; height:32px;
        background:rgba(0,60,0,0.92); color:#0f0;
        border:1.5px solid rgba(0,255,0,0.5); border-radius:50%;
        cursor:pointer; font-size:16px; font-weight:bold;
        z-index:2147483647; display:flex; align-items:center; justify-content:center;
        box-shadow:0 0 8px rgba(0,255,0,0.4); transition:all .2s;
    `;
    btn.onmouseover = () => btn.style.background = 'rgba(0,100,0,0.95)';
    btn.onmouseout  = () => btn.style.background = 'rgba(0,60,0,0.92)';
    btn.onclick = (e) => { e.stopPropagation(); toggleMenu(); };
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'radarMenuPanel';
    panel.style.cssText = `
        position:fixed; width:230px;
        background:rgba(0,12,0,0.96);
        border:1.5px solid rgba(0,255,0,0.35);
        border-radius:10px; padding:10px 0 8px;
        z-index:2147483646; display:none;
        box-shadow:0 4px 24px rgba(0,0,0,0.7);
        font-family:Arial,sans-serif;
        user-select:none;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
        color:rgba(0,255,0,0.85); font:bold 12px Arial;
        text-align:center; padding:0 12px 8px;
        border-bottom:1px solid rgba(0,255,0,0.15);
        margin-bottom:4px; letter-spacing:1px;
    `;
    title.textContent = 'RADAR SETTINGS';
    panel.appendChild(title);

    function addSection(label) {
        const s = document.createElement('div');
        s.style.cssText = `
            color:rgba(0,255,0,0.4); font:10px Arial;
            padding:6px 14px 2px; letter-spacing:1px; text-transform:uppercase;
        `;
        s.textContent = label;
        panel.appendChild(s);
    }

    function addToggle(label, key, onChange) {
        const row = document.createElement('div');
        row.style.cssText = `
            display:flex; align-items:center; justify-content:space-between;
            padding:5px 14px; cursor:pointer;
            transition:background .15s;
        `;
        row.onmouseover = () => row.style.background = 'rgba(0,255,0,0.06)';
        row.onmouseout  = () => row.style.background = '';

        const lbl = document.createElement('span');
        lbl.style.cssText = 'color:rgba(200,255,200,0.9); font:12px Arial;';
        lbl.textContent = label;

        const sw = document.createElement('div');
        sw.style.cssText = `
            width:32px; height:17px; border-radius:9px; position:relative;
            background:${settings[key] ? 'rgba(0,200,0,0.7)' : 'rgba(80,80,80,0.5)'};
            border:1px solid rgba(0,255,0,0.3); transition:background .2s; flex-shrink:0;
        `;
        const knob = document.createElement('div');
        knob.style.cssText = `
            position:absolute; top:2px;
            left:${settings[key] ? '15px' : '2px'};
            width:11px; height:11px; border-radius:50%;
            background:${settings[key] ? '#0f0' : '#888'};
            transition:left .2s, background .2s;
        `;
        sw.appendChild(knob);
        row.appendChild(lbl); row.appendChild(sw);

        row.onclick = () => {
            settings[key] = !settings[key];
            sw.style.background  = settings[key] ? 'rgba(0,200,0,0.7)' : 'rgba(80,80,80,0.5)';
            knob.style.left      = settings[key] ? '15px' : '2px';
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
            padding:5px 14px;
        `;
        const lbl = document.createElement('span');
        lbl.style.cssText = 'color:rgba(200,255,200,0.9); font:12px Arial; flex:1;';
        lbl.textContent = label;

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:4px;';

        [opt1, opt2].forEach((opt, i) => {
            const b = document.createElement('button');
            b.id = `radarRadio_${key}_${opt}`;
            b.textContent = [label1, label2][i];
            b.style.cssText = `
                padding:2px 7px; font:11px Arial; border-radius:4px; cursor:pointer;
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

    function addAction(label, color, onClick) {
        const row = document.createElement('div');
        row.style.cssText = 'padding:4px 14px;';
        const b = document.createElement('button');
        b.style.cssText = `
            width:100%; padding:5px 0; font:bold 11px Arial; cursor:pointer;
            border-radius:5px; border:1px solid ${color}40;
            background:${color}22; color:${color}; transition:all .15s;
        `;
        b.textContent = label;
        b.onmouseover = () => b.style.background = `${color}44`;
        b.onmouseout  = () => b.style.background = `${color}22`;
        b.onclick = (e) => { e.stopPropagation(); onClick(); };
        row.appendChild(b);
        panel.appendChild(row);
    }

    addSection('Display');
    addToggle('Night Mode',         'nightMode',         () => applyTheme());
    addRadio ('Orientation',        'orientMode',        'north', 'track', 'N↑', 'TRK↑');
    addToggle('Player Triangle',    'showPlayerTriangle');
    addToggle('Range Rings',        'showRings');
    addToggle('Ring Labels',        'showRingLabels');

    addSep();

    addSection('Traffic');
    addToggle('Callsign',         'showCallsign');
    addToggle('Altitude',         'showAltitude');
    addToggle('Speed',            'showSpeed');
    addRadio ('Speed Source',     'speedMode',    'GS', 'IAS', 'GS', 'IAS');
    addToggle('Heading Vectors',  'showVectors');

    addSep();

    addSection('Map');
    addToggle('Airports & Runways', 'showAirports');

    addSep();

    addSection('Actions');
    addAction('Reset Callsign', '#ff6060', () => {
        if (!confirm('Reset your callsign?')) return;
        ['callsign','playerCallsign','geoFSRadarCallsign'].forEach(k => localStorage.removeItem(k));
        window.playerCallsign = null;
        setTimeout(() => {
            const cs = prompt('Enter your GeoFS callsign (prevents showing yourself on radar):');
            if (cs && cs.trim()) {
                const v = cs.trim();
                ['callsign','playerCallsign','geoFSRadarCallsign'].forEach(k => localStorage.setItem(k, v));
                window.playerCallsign = v;
                alert(`Callsign set to: ${v}`);
            }
        }, 100);
    });
    addAction('Refresh Airport Data', '#4080ff', () => {
        fetchAirportData().then(() => {
            const n = document.createElement('div');
            n.textContent = '✓ Airports refreshed';
            n.style.cssText = `
                position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
                background:rgba(0,80,200,0.9); color:white; padding:6px 14px;
                border-radius:6px; font:12px Arial; z-index:2147483647;
            `;
            document.body.appendChild(n);
            setTimeout(() => n.remove(), 2500);
        });
    });

    document.body.appendChild(panel);

    document.addEventListener('click', (e) => {
        if (menuOpen && !panel.contains(e.target) && e.target !== btn) {
            closeMenu();
        }
    });
}

function toggleMenu() {
    menuOpen ? closeMenu() : openMenu();
}
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
// SECTION 5 — BLIP POPUP (click on aircraft)
// ═══════════════════════════════════════════════════

let popup = null;
let lastBlipPositions = [];

function createPopupEl() {
    const p = document.createElement('div');
    p.id = 'radarPopup';
    p.style.cssText = `
        position:fixed; min-width:160px;
        background:rgba(0,12,0,0.96); border:1.5px solid rgba(0,255,0,0.5);
        border-radius:8px; padding:8px 12px;
        z-index:2147483647; pointer-events:none; display:none;
        font-family:Arial,sans-serif; font-size:12px;
        box-shadow:0 2px 16px rgba(0,0,0,0.8);
    `;
    document.body.appendChild(p);
    return p;
}

function showPopup(ac, distance, screenX, screenY) {
    if (!popup) popup = createPopupEl();

    const cs   = ac.cs || 'UNKNOWN';
    const dist = distance >= 1000
        ? (distance/1000).toFixed(1) + ' km'
        : Math.round(distance) + ' m';
    const hdg  = ac.h != null ? Math.round(ac.h) + '°' : 'N/A';
    const altFt = ac.al != null ? Math.round(ac.al) : null;
    const altStr = altFt != null
        ? (altFt >= 10000 ? `FL${Math.round(altFt/100).toString().padStart(3,'0')}` : `${altFt.toLocaleString()} ft`)
        : 'N/A';
    const spdKts = ac.s != null ? Math.round(ac.s) : null;
    const spdStr = spdKts != null ? `${spdKts} kt GS` : 'N/A';

    popup.innerHTML = `
        <div style="color:#0f0;font-weight:bold;font-size:13px;margin-bottom:5px;border-bottom:1px solid rgba(0,255,0,0.2);padding-bottom:4px">${cs}</div>
        <div style="display:grid;grid-template-columns:70px 1fr;gap:3px 8px;color:rgba(200,255,200,0.9)">
            <span style="color:rgba(0,255,0,0.55)">Distance</span><span>${dist}</span>
            <span style="color:rgba(0,255,0,0.55)">Heading</span><span>${hdg}</span>
            <span style="color:rgba(0,255,0,0.55)">Altitude</span><span style="color:rgba(0,240,255,0.9)">${altStr}</span>
            <span style="color:rgba(0,255,0,0.55)">Speed</span><span style="color:rgba(255,220,80,0.9)">${spdStr}</span>
        </div>
    `;

    const rl = parseInt(radarCanvas.style.left) || 0;
    const rt = parseInt(radarCanvas.style.top)  || 0;
    let px = rl + screenX + 14;
    let py = rt + screenY - 20;
    if (px + 175 > window.innerWidth)  px = rl + screenX - 180;
    if (py + 130 > window.innerHeight) py = rt + screenY - 130;

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
            showPopup(closest.ac, closest.distance, closest.x, closest.y);
        }
    } else {
        hidePopup();
        activePopupCs = null;
    }
});

// ═══════════════════════════════════════════════════
// SECTION 6 — VISIBILITY TOGGLE (Alt+Z)
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
        if (hide) { hidePopup(); closeMenu(); }
        localStorage.setItem('radarVisible', !hide);
    }
});
if (localStorage.getItem('radarVisible') === 'false') radarCanvas.style.display = 'none';

// ═══════════════════════════════════════════════════
// SECTION 7 — SCROLL WHEEL (range)
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
// SECTION 8 — CALLSIGN
// ═══════════════════════════════════════════════════

(function initCallsign() {
    const cs = localStorage.getItem('playerCallsign') ||
               localStorage.getItem('callsign') ||
               localStorage.getItem('geoFSRadarCallsign');
    if (cs) {
        window.playerCallsign = cs;
        ['playerCallsign','callsign','geoFSRadarCallsign'].forEach(k => localStorage.setItem(k, cs));
    }
})();

// ═══════════════════════════════════════════════════
// SECTION 9 — GAME PAUSE DETECTION
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
// SECTION 10 — AIRCRAFT CACHE
// ═══════════════════════════════════════════════════

let aircraftListCache = [];

async function updateAircraftCache() {
    if (isGamePaused) return;
    try {
        const res  = await fetch('https://mps.geo-fs.com/map');
        const data = await res.json();
        // Store all users — range filtering happens at draw time using the live
        // radarRange and player position, so we only store the raw list here.
        aircraftListCache = data.users || [];
    } catch(e) {}
}
setInterval(updateAircraftCache, 1000);
updateAircraftCache();

// ═══════════════════════════════════════════════════
// SECTION 11 — AIRPORT / RUNWAY DATA
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
        console.log(`OurAirports: ${airportCache.length} airports, ${runwayCache.length} runways`);
    } catch(e) { console.error('Airport fetch error:', e); }
}

[1000,2000,3000,5000].forEach(t => setTimeout(fetchAirportData, t));
setInterval(fetchAirportData, AIRPORT_REFETCH);

// ═══════════════════════════════════════════════════
// SECTION 12 — COORDINATE HELPERS
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
    // rotRad = playerHeading in radians (track-up mode only; 0 in north-up).
    // World axes: dx=East(+), dy=North(+). Canvas: right=+x, down=+y (Y flipped).
    // To put the player's heading at canvas-top, rotate world by heading angle:
    //   rx = dx*cos(θ) - dy*sin(θ)   (standard 2D rotation in East/North space)
    //   ry = dx*sin(θ) + dy*cos(θ)
    // Then map: canvas_x = cx + rx*scale,  canvas_y = cy - ry*scale (Y-flip)
    // Verified: heading=90°, due-East point → top of radar ✓
    //           heading=90°, due-North point → left of radar ✓
    const rx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
    const ry = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
    return [
        cx + (rx / radarRange) * (radarSize / 2),
        cy - (ry / radarRange) * (radarSize / 2)
    ];
}

// ═══════════════════════════════════════════════════
// SECTION 13 — SPIN LINE
// ═══════════════════════════════════════════════════

let spinAngle = 0;
const SPIN_SPEED  = 0.05;
const TRAIL_LEN   = 20;
let spinTrail = [];

function drawSpinLine() {
    if (isGamePaused) return;
    const cx = radarSize/2, cy = radarSize/2;
    const R  = radarSize/2 - 10;
    const t  = T();

    spinAngle += SPIN_SPEED;
    if (spinAngle > Math.PI*2) spinAngle -= Math.PI*2;

    const ex = cx + Math.cos(spinAngle)*R;
    const ey = cy + Math.sin(spinAngle)*R;

    spinTrail.push({x:ex, y:ey, a:1});
    if (spinTrail.length > TRAIL_LEN) spinTrail.shift();
    spinTrail.forEach((p,i) => p.a = i / TRAIL_LEN);

    for (let i=0; i<spinTrail.length-1; i++) {
        const p = spinTrail[i], n = spinTrail[i+1];
        const g = ctx.createLinearGradient(p.x,p.y,n.x,n.y);
        g.addColorStop(0, t.trailColor(p.a*0.3));
        g.addColorStop(1, t.trailColor(p.a*0.1));
        ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(n.x,n.y);
        ctx.strokeStyle = g; ctx.lineWidth = 1.5+p.a*2; ctx.stroke();
    }

    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey);
    const lg = ctx.createLinearGradient(cx,cy,ex,ey);
    lg.addColorStop(0, t.scanLine[0]); lg.addColorStop(1, t.scanLine[1]);
    ctx.strokeStyle = lg; ctx.lineWidth = 2.5; ctx.stroke();

    ctx.beginPath(); ctx.arc(ex,ey,3,0,Math.PI*2);
    ctx.fillStyle = t.scanLine[0]; ctx.fill();
}

// ═══════════════════════════════════════════════════
// SECTION 14 — AIRPORT / RUNWAY DRAWING
// ═══════════════════════════════════════════════════

function drawAirportsAndRunways(playerLat, playerLon, cx, cy, rotRad) {
    if (!settings.showAirports) return {runways:0, airports:0};

    const groups = {};

    // ── Step 1: build a Set of airport ICAOs within range ─────────────────
    // Culling by airport centre (O(airports)) is far cheaper than computing
    // both runway endpoints for every entry in runwayCache (O(runways)).
    const inRangeICAOs = new Set();
    airportCache.forEach(ap => {
        const [adx, ady] = latLonToMeters(playerLat, playerLon, ap.lat, ap.lon);
        if (Math.hypot(adx, ady) <= radarRange * 1.3) inRangeICAOs.add(ap.icao);
    });

    // ── Step 2: only process runways whose airport is in range ─────────────
    runwayCache.forEach(rwy => {
        if (!inRangeICAOs.has(rwy.airport)) return;   // ← cheap set lookup

        const [dx1,dy1] = latLonToMeters(playerLat, playerLon, rwy.lat1, rwy.lon1);
        const [dx2,dy2] = latLonToMeters(playerLat, playerLon, rwy.lat2, rwy.lon2);
        const cDist = Math.hypot((dx1+dx2)/2, (dy1+dy2)/2);
        if (cDist > radarRange*1.2) return;

        const [x1,y1] = worldToCanvas(dx1,dy1,cx,cy,rotRad);
        const [x2,y2] = worldToCanvas(dx2,dy2,cx,cy,rotRad);

        if (Math.hypot(x1-cx,y1-cy) > radarSize/2 &&
            Math.hypot(x2-cx,y2-cy) > radarSize/2) return;

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

    let nearbyRunways = 0;
    Object.values(groups).forEach(g => {
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

    return { runways: nearbyRunways, airports: Object.keys(groups).length };
}

// ═══════════════════════════════════════════════════
// SECTION 15 — PLAYER TRIANGLE
// ═══════════════════════════════════════════════════

function drawPlayerTriangle(cx, cy, playerHeading, isGamePaused) {
    if (!settings.showPlayerTriangle) return;

    // Use setTransform to do a hard reset of the entire transform matrix —
    // this is immune to any mismatched save/restore from earlier drawing code.
    // We build the transform manually: identity → translate to centre → optional rotate.
    const angleRad = (settings.orientMode === 'north')
        ? (playerHeading * Math.PI / 180)
        : 0;

    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // setTransform(a, b, c, d, e, f) — sets the matrix directly, no stack involved
    // Equivalent to: identity → rotate(angleRad) → translate(cx, cy)
    ctx.setTransform(cos, sin, -sin, cos, cx, cy);

    // Explicitly kill all shadow and dash — setTransform doesn't reset these
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    ctx.setLineDash([]);

    // Triangle: nose at top (negative Y), two rear corners
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(8, 8);
    ctx.lineTo(-8, 8);
    ctx.closePath();

    ctx.fillStyle = isGamePaused ? 'rgba(150,150,150,0.9)' : 'rgba(0,255,0,0.95)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Centre dot
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    // Hard-reset transform back to identity so nothing after us is affected
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
}

// ═══════════════════════════════════════════════════
// SECTION 16 — MAIN DRAW
// ═══════════════════════════════════════════════════

function drawRadar() {
    const t  = T();
    const cx = radarSize/2, cy = radarSize/2;

    ctx.clearRect(0, 0, radarSize, radarSize);
    ctx.beginPath();
    ctx.arc(cx, cy, radarSize/2, 0, Math.PI*2);
    ctx.fillStyle = t.bg;
    ctx.fill();

    let player = null, playerHeading = 0, playerCallsign = 'YOU';
    let playerLat = 0, playerLon = 0, playerAlt = 0;
    try {
        player = geofs.aircraft?.instance;
        if (player) {
            playerHeading  = player.animationValue?.heading360 || 0;
            playerCallsign = player.callsign || 'YOU';
            playerLat      = player.llaLocation[0];
            playerLon      = player.llaLocation[1];
            playerAlt      = player.llaLocation[2];
            if (player.callsign && !window.playerCallsign) {
                window.playerCallsign = player.callsign;
                ['playerCallsign','callsign','geoFSRadarCallsign']
                    .forEach(k => localStorage.setItem(k, player.callsign));
            }
        }
    } catch(e) {}

    const displayCallsign = window.playerCallsign || playerCallsign;

    const rotRad = settings.orientMode === 'track'
        ? (playerHeading * Math.PI / 180)
        : 0;

    // ── Clip to circle ───────────────────────────
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy,radarSize/2,0,Math.PI*2); ctx.clip();

    // ── Grid lines ───────────────────────────────
    ctx.strokeStyle = t.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx,0); ctx.lineTo(cx,radarSize);
    ctx.moveTo(0,cy); ctx.lineTo(radarSize,cy);
    ctx.stroke();

    // ── Range rings ──────────────────────────────
    if (settings.showRings) {
        for (let i=1; i<=3; i++) {
            const rr = (radarSize/2) * (i/3);
            ctx.strokeStyle = t.ring; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();

            if (settings.showRingLabels) {
                const dist = radarRange * (i/3);
                const lbl  = dist >= 1000
                    ? (dist/1000).toFixed(dist%1000===0?0:1)+' km'
                    : Math.round(dist)+' m';
                ctx.font = 'bold 12px Arial';
                const tw = ctx.measureText(lbl).width;
                const lx = cx + 6;
                const ly = cy - rr + 8;
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(lx-3, ly-10, tw+6, 14);
                ctx.fillStyle    = t.ringLabel;
                ctx.textAlign    = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(lbl, lx, ly - 3);
            }
        }
    }

    // ── Compass ──────────────────────────────────
    {
        const dirs  = ['N','E','S','W'];
        const edgeR = radarSize/2 - 14;
        ctx.font         = 'bold 16px Arial';
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
            ctx.font      = 'bold 10px Arial';
            ctx.fillStyle = 'rgba(180,180,180,0.55)';
            ctx.fillText(`HDG ${Math.round(playerHeading).toString().padStart(3,'0')}°`, cx, 26);
        }
    }

    // ── Spin line ────────────────────────────────
    if (!isGamePaused) drawSpinLine();

    // ── Airports & runways ───────────────────────
    let runwayCount = 0, airportCount = 0;
    if (!isGamePaused && player) {
        const c = drawAirportsAndRunways(playerLat, playerLon, cx, cy, rotRad);
        runwayCount  = c.runways;
        airportCount = c.airports;
    }

    // ── Other aircraft ───────────────────────────
    let aircraftCount = 0;
    lastBlipPositions = [];

    if (!isGamePaused && aircraftListCache.length > 0 && player) {
        const myCs = window.playerCallsign || playerCallsign;

        aircraftListCache.forEach(ac => {
            // Each blip gets its own save/restore — a throw or bad state from one
            // blip can never corrupt the canvas stack for subsequent draws.
            ctx.save();
            try {
                if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) return;
                if (ac.cs && myCs && ac.cs.toLowerCase() === myCs.toLowerCase()) return;

                const [dx,dy]  = latLonToMeters(playerLat, playerLon, ac.co[0], ac.co[1]);
                const distance = Math.hypot(dx,dy);
                if (distance > radarRange) return;

                const [rx,ry] = worldToCanvas(dx,dy,cx,cy,rotRad);
                if (Math.hypot(rx-cx,ry-cy) > radarSize/2) return;

                aircraftCount++;
                lastBlipPositions.push({x:rx, y:ry, ac, distance});

                const isActive = (activePopupCs === ac.cs);

                // Always clear shadow and dash before drawing — never inherit from previous blip
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur  = 0;
                ctx.setLineDash([]);

                if (settings.showVectors && ac.h != null) {
                    const speedMs  = (ac.s || 0) * 0.514444;
                    const vecLen   = (speedMs * 30) / radarRange * (radarSize/2);
                    const hRad     = (ac.h * Math.PI / 180) - rotRad;
                    const vx       = rx + Math.sin(hRad) * vecLen;
                    const vy       = ry - Math.cos(hRad) * vecLen;
                    ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(vx,vy);
                    ctx.strokeStyle = T().vector; ctx.lineWidth = 1.5;
                    ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
                }

                ctx.fillStyle   = isActive ? '#fff' : T().blipFill;
                ctx.beginPath(); ctx.arc(rx,ry,isActive?7:5,0,Math.PI*2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();

                let labelY = ry + 12;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';

                function drawTag(text, color, yOffset) {
                    ctx.font = 'bold 10px Arial';
                    const tw = ctx.measureText(text).width;
                    ctx.fillStyle = 'rgba(0,0,0,0.65)';
                    ctx.fillRect(rx-tw/2-3, yOffset, tw+6, 13);
                    ctx.fillStyle = color;
                    ctx.fillText(text, rx, yOffset+1);
                    return yOffset + 14;
                }

                if (settings.showCallsign && ac.cs) {
                    labelY = drawTag(ac.cs.substring(0,12), T().blipLabel, labelY);
                }
                if (settings.showAltitude) {
                    const altFt = ac.al != null ? Math.round(ac.al) : null;
                    const altStr = altFt != null
                        ? (altFt >= 10000 ? `FL${Math.round(altFt/100).toString().padStart(3,'0')}` : `${altFt.toLocaleString()} ft`)
                        : 'ALT: N/A';
                    labelY = drawTag(altStr, T().blipAlt, labelY);
                }
                if (settings.showSpeed) {
                    const spdKts = ac.s != null ? Math.round(ac.s) : null;
                    const spdStr = spdKts != null ? `${spdKts} kt` : 'SPD: N/A';
                    labelY = drawTag(spdStr, T().blipSpeed, labelY);
                }
            } catch(e) {
                // Swallow per-blip errors — never let one bad blip corrupt the canvas stack
            } finally {
                ctx.restore();
            }
        });
    }

    ctx.restore(); // end circle clip

    // ── Player callsign tag ──────────────────────
    if (settings.showCallsign && displayCallsign) {
        const lbl = displayCallsign.substring(0,12);
        ctx.font = 'bold 11px Arial';
        const tw = ctx.measureText(lbl).width;
        const ty = cy + 22;
        ctx.fillStyle   = isGamePaused ? 'rgba(80,80,80,0.85)' : 'rgba(0,80,0,0.85)';
        ctx.strokeStyle = T().playerLabel; ctx.lineWidth = 1;
        ctx.fillRect(cx-tw/2-6, ty-9, tw+12, 18);
        ctx.strokeRect(cx-tw/2-6, ty-9, tw+12, 18);
        ctx.fillStyle   = T().playerLabel;
        ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, cx, ty);
    }

    // ── Paused overlay ───────────────────────────
    if (isGamePaused) {
        ctx.fillStyle = T().pauseText;
        ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
        ctx.fillText('PAUSED', cx, radarSize - 28);
    }

    // ── Player triangle — drawn last, always on top ──
    drawPlayerTriangle(cx, cy, playerHeading, isGamePaused);
}

// ═══════════════════════════════════════════════════
// SECTION 17 — ANIMATION LOOP
// ═══════════════════════════════════════════════════

function loop() {
    if (!isDragging) drawRadar();
    requestAnimationFrame(loop);
}
loop();
setInterval(() => { if (!isDragging) drawRadar(); }, 100);
setInterval(repositionUI, 1000);

// ═══════════════════════════════════════════════════
// SECTION 18 — INIT
// ═══════════════════════════════════════════════════

setTimeout(() => {
    createMenu();
    loadPosition();
    applyTheme();
}, 300);
