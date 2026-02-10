// ==UserScript==
// @name         Geo-FS-Radar
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  A mini-map Radar toggle with Alt+Z, drag to move
// @author       Massiv4515 & YK3D
// @match        https://www.geo-fs.com/geofs.php?v=3.9
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

// === Radar Settings (Change to your liking) === 
const radarRange = 10000; // meters, adjust to zoom in/out (max distance radar can detect aircrafts)
const radarSize = 450; // px (size on screen)
const updateInterval = 750; // time in ms

// === Game State ===
let isGamePaused = false;

// === Create radar container (to maintain circular shape) ===
const radarContainer = document.createElement('div');
radarContainer.style.position = 'absolute';
radarContainer.style.top = '66%';
radarContainer.style.left = '5px';
radarContainer.style.width = radarSize + 'px';
radarContainer.style.height = radarSize + 'px';
radarContainer.style.borderRadius = '50%';
radarContainer.style.overflow = 'hidden'; // Keep content within circle
radarContainer.style.zIndex = '9999';
radarContainer.style.cursor = 'move';
radarContainer.style.border = '2px solid rgba(255,255,255,0.3)';
radarContainer.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.5)';
radarContainer.style.background = 'rgba(0,0,0,0.7)';
document.body.appendChild(radarContainer);

// === Create radar canvas inside container ===
let radarCanvas = document.createElement('canvas');
radarCanvas.width = radarSize;
radarCanvas.height = radarSize;
radarCanvas.style.position = 'absolute';
radarCanvas.style.top = '0';
radarCanvas.style.left = '0';
radarContainer.appendChild(radarCanvas);

let ctx = radarCanvas.getContext('2d');

// === Animation variables for spinning line ===
let spinAngle = 0;
const spinSpeed = 0.05; // radians per frame
const spinTrailLength = 20; // how many frames to keep trail

// Store trail points
let spinTrail = [];

// === Drag and Drop Variables ===
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// === Player Information ===
let playerCallsign = "";
let playerLat = 0;
let playerLon = 0;
let playerData = null;

// === Check if game is paused ===
function checkGamePaused() {
    try {
        // Check various pause indicators in GeoFS
        if (geofs.gui && geofs.gui.pause) {
            isGamePaused = geofs.gui.pause;
        } else if (geofs.pause) {
            isGamePaused = geofs.pause;
        } else if (document.querySelector('.pause-menu, .paused, [style*="pause"]')) {
            isGamePaused = true;
        } else {
            isGamePaused = false;
        }

        // Update radar appearance when paused
        if (isGamePaused) {
            radarContainer.style.opacity = '0.7';
            radarContainer.style.boxShadow = '0 0 10px rgba(255, 255, 0, 0.5)';
            radarContainer.style.border = '2px solid rgba(255, 255, 0, 0.5)';
        } else {
            radarContainer.style.opacity = '1';
            radarContainer.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.5)';
            radarContainer.style.border = '2px solid rgba(255,255,255,0.3)';
        }
    } catch (e) {
        console.log("Could not check game pause state");
    }
}

// === Callsign Input System ===
function createCallsignInput() {
    // Check if already saved in localStorage
    const savedCallsign = localStorage.getItem('geoFSRadarCallsign');
    if (savedCallsign) {
        playerCallsign = savedCallsign;
        createResetButton(); // Create reset button after callsign is loaded
        return;
    }

    // Create input overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    overlay.style.zIndex = '10000';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';

    const inputContainer = document.createElement('div');
    inputContainer.style.backgroundColor = 'rgba(0, 50, 0, 0.9)';
    inputContainer.style.padding = '30px';
    inputContainer.style.borderRadius = '15px';
    inputContainer.style.border = '3px solid rgba(0, 255, 0, 0.7)';
    inputContainer.style.boxShadow = '0 0 30px rgba(0, 255, 0, 0.5)';
    inputContainer.style.textAlign = 'center';
    inputContainer.style.maxWidth = '500px';

    const title = document.createElement('h2');
    title.textContent = 'GEO-FS RADAR SETUP';
    title.style.color = '#0f0';
    title.style.marginBottom = '20px';
    title.style.fontFamily = 'Arial, sans-serif';
    title.style.textShadow = '0 0 10px rgba(0, 255, 0, 0.7)';

    const instruction = document.createElement('p');
    instruction.textContent = 'Enter your Geo-FS callsign to prevent showing yourself as an aircraft on radar:';
    instruction.style.color = '#fff';
    instruction.style.marginBottom = '25px';
    instruction.style.fontFamily = 'Arial, sans-serif';
    instruction.style.lineHeight = '1.5';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter your callsign (e.g., N123AB)';
    input.style.width = '100%';
    input.style.padding = '15px';
    input.style.fontSize = '18px';
    input.style.border = '2px solid #0f0';
    input.style.borderRadius = '8px';
    input.style.backgroundColor = 'rgba(0, 20, 0, 0.8)';
    input.style.color = '#0f0';
    input.style.textAlign = 'center';
    input.style.marginBottom = '25px';
    input.style.outline = 'none';

    const button = document.createElement('button');
    button.textContent = 'SAVE CALLSIGN';
    button.style.padding = '15px 40px';
    button.style.fontSize = '18px';
    button.style.fontWeight = 'bold';
    button.style.backgroundColor = '#0f0';
    button.style.color = '#000';
    button.style.border = 'none';
    button.style.borderRadius = '8px';
    button.style.cursor = 'pointer';
    button.style.transition = 'all 0.3s';

    button.onmouseover = () => {
        button.style.backgroundColor = '#0c0';
        button.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.7)';
    };

    button.onmouseout = () => {
        button.style.backgroundColor = '#0f0';
        button.style.boxShadow = 'none';
    };

    button.onclick = () => {
        const callsign = input.value.trim();
        if (callsign) {
            playerCallsign = callsign.toUpperCase();
            localStorage.setItem('geoFSRadarCallsign', playerCallsign);
            overlay.remove();

            // Create reset button
            createResetButton();

            // Show confirmation
            showMessage(`Callsign set to: ${playerCallsign}`);

            // Start radar
            radarContainer.style.display = 'block';
        }
    };

    // Add enter key support
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            button.click();
        }
    });

    // Add note
    const note = document.createElement('p');
    note.textContent = 'Note: You can change this later using the reset button on the radar.';
    note.style.color = '#aaa';
    note.style.fontSize = '12px';
    note.style.marginTop = '20px';
    note.style.fontFamily = 'Arial, sans-serif';

    inputContainer.appendChild(title);
    inputContainer.appendChild(instruction);
    inputContainer.appendChild(input);
    inputContainer.appendChild(button);
    inputContainer.appendChild(note);
    overlay.appendChild(inputContainer);

    document.body.appendChild(overlay);

    // Focus input
    setTimeout(() => input.focus(), 100);
}

// === Show message function ===
function showMessage(text) {
    const message = document.createElement('div');
    message.textContent = text;
    message.style.position = 'fixed';
    message.style.top = '20px';
    message.style.right = '20px';
    message.style.backgroundColor = 'rgba(0, 50, 0, 0.9)';
    message.style.color = '#0f0';
    message.style.padding = '15px 25px';
    message.style.borderRadius = '8px';
    message.style.border = '2px solid #0f0';
    message.style.zIndex = '10001';
    message.style.fontFamily = 'Arial, sans-serif';
    message.style.fontWeight = 'bold';
    message.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.5)';

    document.body.appendChild(message);

    // Remove after 3 seconds
    setTimeout(() => {
        message.style.opacity = '0';
        message.style.transition = 'opacity 0.5s';
        setTimeout(() => message.remove(), 500);
    }, 3000);
}

// === Callsign reset button ===
function createResetButton() {
    // Remove existing reset button if any
    const existingResetBtn = document.getElementById('radarResetBtn');
    if (existingResetBtn) {
        existingResetBtn.remove();
    }

    const resetBtn = document.createElement('button');
    resetBtn.id = 'radarResetBtn';
    resetBtn.innerHTML = '⟳';
    resetBtn.title = 'Reset Callsign';
    resetBtn.style.position = 'absolute';
    resetBtn.style.top = '-15px'; // Position above the radar
    resetBtn.style.right = '-15px'; // Position to the right of radar
    resetBtn.style.width = '30px';
    resetBtn.style.height = '30px';
    resetBtn.style.backgroundColor = 'rgba(255, 50, 50, 0.9)';
    resetBtn.style.color = 'white';
    resetBtn.style.border = 'none';
    resetBtn.style.borderRadius = '50%';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.fontSize = '18px';
    resetBtn.style.fontWeight = 'bold';
    resetBtn.style.zIndex = '10000';
    resetBtn.style.display = 'flex';
    resetBtn.style.alignItems = 'center';
    resetBtn.style.justifyContent = 'center';
    resetBtn.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.7)';
    resetBtn.style.transition = 'all 0.3s';

    resetBtn.onmouseover = () => {
        resetBtn.style.backgroundColor = 'rgba(255, 0, 0, 1)';
        resetBtn.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.9)';
        resetBtn.style.transform = 'scale(1.1)';
    };

    resetBtn.onmouseout = () => {
        resetBtn.style.backgroundColor = 'rgba(255, 50, 50, 0.9)';
        resetBtn.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.7)';
        resetBtn.style.transform = 'scale(1)';
    };

    resetBtn.onclick = (e) => {
        e.stopPropagation(); // Prevent triggering drag event
        if (confirm('Reset your callsign? You will need to enter it again.')) {
            localStorage.removeItem('geoFSRadarCallsign');
            playerCallsign = "";
            createCallsignInput();
            radarContainer.style.display = 'none';
        }
    };

    // Add button to radar container parent (so it's outside the radar)
    radarContainer.parentNode.appendChild(resetBtn);
}

// === Make Radar Draggable ===
radarContainer.addEventListener('mousedown', startDrag);
radarContainer.addEventListener('touchstart', startDragTouch);

function startDrag(e) {
    isDragging = true;

    // Get mouse position relative to radar
    const rect = radarContainer.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    // Add event listeners for dragging
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);

    // Change appearance while dragging
    radarContainer.style.border = '2px solid rgba(0, 255, 0, 0.7)';
    radarContainer.style.cursor = 'grabbing';
    radarContainer.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.8)';

    e.preventDefault();
}

function startDragTouch(e) {
    if (e.touches.length === 1) {
        isDragging = true;
        const touch = e.touches[0];
        const rect = radarContainer.getBoundingClientRect();
        dragOffsetX = touch.clientX - rect.left;
        dragOffsetY = touch.clientY - rect.top;

        document.addEventListener('touchmove', onDragTouch);
        document.addEventListener('touchend', stopDrag);

        radarContainer.style.border = '2px solid rgba(0, 255, 0, 0.7)';
        radarContainer.style.cursor = 'grabbing';
        radarContainer.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.8)';

        e.preventDefault();
    }
}

function onDrag(e) {
    if (!isDragging) return;

    // Calculate new position
    const newLeft = e.clientX - dragOffsetX;
    const newTop = e.clientY - dragOffsetY;

    // Apply new position
    radarContainer.style.left = newLeft + 'px';
    radarContainer.style.top = newTop + 'px';

    // Move reset button with radar
    const resetBtn = document.getElementById('radarResetBtn');
    if (resetBtn) {
        resetBtn.style.left = (newLeft + radarSize - 15) + 'px';
        resetBtn.style.top = (newTop - 15) + 'px';
    }
}

function onDragTouch(e) {
    if (!isDragging || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const newLeft = touch.clientX - dragOffsetX;
    const newTop = touch.clientY - dragOffsetY;

    radarContainer.style.left = newLeft + 'px';
    radarContainer.style.top = newTop + 'px';

    // Move reset button with radar
    const resetBtn = document.getElementById('radarResetBtn');
    if (resetBtn) {
        resetBtn.style.left = (newLeft + radarSize - 15) + 'px';
        resetBtn.style.top = (newTop - 15) + 'px';
    }

    e.preventDefault();
}

function stopDrag() {
    isDragging = false;

    // Remove event listeners
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('touchmove', onDragTouch);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchend', stopDrag);

    // Reset appearance
    radarContainer.style.border = '2px solid rgba(255,255,255,0.3)';
    radarContainer.style.cursor = 'move';
    radarContainer.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.5)';

    // Optional: Save position to localStorage
    saveRadarPosition();
}

// === Save and Load Position ===
function saveRadarPosition() {
    const pos = {
        left: radarContainer.style.left,
        top: radarContainer.style.top
    };
    localStorage.setItem('radarPosition', JSON.stringify(pos));
}

function loadRadarPosition() {
    const saved = localStorage.getItem('radarPosition');
    if (saved) {
        const pos = JSON.parse(saved);
        radarContainer.style.left = pos.left;
        radarContainer.style.top = pos.top;

        // Also position reset button if it exists
        const resetBtn = document.getElementById('radarResetBtn');
        if (resetBtn && radarContainer.style.left && radarContainer.style.top) {
            const left = parseInt(radarContainer.style.left) || 0;
            const top = parseInt(radarContainer.style.top) || 0;
            resetBtn.style.left = (left + radarSize - 15) + 'px';
            resetBtn.style.top = (top - 15) + 'px';
        }
    }
}

// Load saved position when script starts
setTimeout(loadRadarPosition, 100);

// === Toggle radar visibility with Alt+Z ===
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyZ') {
        const isHidden = radarContainer.style.display === 'none';
        radarContainer.style.display = isHidden ? 'block' : 'none';

        // Also toggle reset button visibility
        const resetBtn = document.getElementById('radarResetBtn');
        if (resetBtn) {
            resetBtn.style.display = isHidden ? 'flex' : 'none';
        }

        // Save visibility state
        localStorage.setItem('radarVisible', isHidden);
    }
});

// Load visibility state
const wasVisible = localStorage.getItem('radarVisible') !== 'false';
if (!wasVisible) {
    radarContainer.style.display = 'none';
}

// === Initialize callsign system ===
setTimeout(() => {
    const savedCallsign = localStorage.getItem('geoFSRadarCallsign');
    if (savedCallsign) {
        playerCallsign = savedCallsign;
        console.log(`Radar: Using saved callsign: ${playerCallsign}`);
        createResetButton();

        // Hide reset button if radar is hidden
        if (radarContainer.style.display === 'none') {
            const resetBtn = document.getElementById('radarResetBtn');
            if (resetBtn) {
                resetBtn.style.display = 'none';
            }
        }
    } else {
        createCallsignInput();
        radarContainer.style.display = 'none'; // Hide radar until callsign is set
    }
}, 1000);

// === Global variable to store aircraft ===
let aircraftListCache = [];

// === Function to get current player data ===
function updatePlayerData() {
    try {
        // Don't update if game is paused
        if (isGamePaused) return;

        const player = geofs.aircraft?.instance;
        if (player) {
            playerData = player;
            playerLat = player.llaLocation[0];
            playerLon = player.llaLocation[1];
        }
    } catch (e) {
        console.log("Could not get player data yet");
    }
}

// === Fetch aircraft every second and update cache ===
async function updateAircraftCache() {
    // Don't fetch if game is paused
    if (isGamePaused) return;

    try {
        const res = await fetch('https://mps.geo-fs.com/map');
        const data = await res.json();

        // Update player data first
        updatePlayerData();

        // Filter out the current player from the list using the user-input callsign
        if (playerCallsign) {
            aircraftListCache = (data.users || []).filter(ac => {
                // Skip if aircraft doesn't have callsign
                if (!ac.cs) return true;

                // Skip if it matches player callsign (case insensitive)
                if (ac.cs.toUpperCase() === playerCallsign.toUpperCase()) {
                    return false;
                }

                return true;
            });
        } else {
            aircraftListCache = data.users || [];
        }

        // Debug info
        console.log(`Radar: Total: ${data.users?.length || 0}, After filter: ${aircraftListCache.length}, Your callsign: ${playerCallsign || 'Not set'}`);
    } catch (e) {
        console.error('Could not fetch live users:', e);
    }
}

// Start fetching aircraft data
const aircraftFetchInterval = setInterval(updateAircraftCache, 1000);
updateAircraftCache(); // Initial fetch

// Update player data frequently
setInterval(updatePlayerData, 500);

// Check game pause state frequently
setInterval(checkGamePaused, 500);

// === Convert lat/lon to meters relative to player ===
function latLonToMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const x = dLon * R * Math.cos(lat1 * Math.PI / 180);
    const y = dLat * R;
    return [x, y];
}

// === Draw spinning line with trail ===
function drawSpinningLine() {
    // Don't animate if game is paused
    if (isGamePaused) return;

    const centerX = radarSize / 2;
    const centerY = radarSize / 2;
    const lineLength = radarSize / 2 - 10;

    // Update spin angle
    spinAngle += spinSpeed;
    if (spinAngle > Math.PI * 2) spinAngle -= Math.PI * 2;

    // Calculate end point of spinning line
    const endX = centerX + Math.cos(spinAngle) * lineLength;
    const endY = centerY + Math.sin(spinAngle) * lineLength;

    // Add current point to trail
    spinTrail.push({x: endX, y: endY, alpha: 1.0});

    // Limit trail length
    if (spinTrail.length > spinTrailLength) {
        spinTrail.shift();
    }

    // Update trail alpha values (fade out)
    spinTrail.forEach((point, index) => {
        point.alpha = index / spinTrailLength;
    });

    // Draw trail (from oldest to newest)
    for (let i = 0; i < spinTrail.length - 1; i++) {
        const point = spinTrail[i];
        const nextPoint = spinTrail[i + 1] || {x: endX, y: endY};

        // Create gradient for trail
        const gradient = ctx.createLinearGradient(
            point.x, point.y,
            nextPoint.x, nextPoint.y
        );

        gradient.addColorStop(0, `rgba(0, 255, 0, ${point.alpha * 0.3})`);
        gradient.addColorStop(1, `rgba(0, 255, 0, ${point.alpha * 0.1})`);

        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(nextPoint.x, nextPoint.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2 + (point.alpha * 2);
        ctx.stroke();
    }

    // Draw main spinning line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);

    // Create gradient for main line
    const lineGradient = ctx.createLinearGradient(
        centerX, centerY,
        endX, endY
    );
    lineGradient.addColorStop(0, 'rgba(0, 255, 0, 0.8)');
    lineGradient.addColorStop(1, 'rgba(0, 255, 0, 0.3)');

    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw spinning dot at end
    ctx.beginPath();
    ctx.arc(endX, endY, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

// === Draw radar ===
function drawRadar() {
    // Clear canvas
    ctx.clearRect(0, 0, radarSize, radarSize);

    // Draw radar background circle
    ctx.beginPath();
    ctx.arc(radarSize/2, radarSize/2, radarSize/2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 20, 0, 0.7)';
    ctx.fill();

    // Draw radar grid lines
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
    ctx.lineWidth = 1;

    // Center lines
    ctx.beginPath();
    ctx.moveTo(radarSize/2, 0);
    ctx.lineTo(radarSize/2, radarSize);
    ctx.moveTo(0, radarSize/2);
    ctx.lineTo(radarSize, radarSize/2);
    ctx.stroke();

    // Range circles
    for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(radarSize/2, radarSize/2, (radarSize/2) * (i/3), 0, Math.PI * 2);
        ctx.stroke();
    }

    // Draw compass directions
    ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const directions = ['N', 'E', 'S', 'W'];
    const dirPositions = [
        {x: radarSize/2, y: 20},
        {x: radarSize - 20, y: radarSize/2},
        {x: radarSize/2, y: radarSize - 20},
        {x: 20, y: radarSize/2}
    ];

    directions.forEach((dir, i) => {
        ctx.fillText(dir, dirPositions[i].x, dirPositions[i].y);
    });

    // Draw spinning line (only if not paused)
    if (!isGamePaused) {
        drawSpinningLine();
    } else {
        // Draw paused indicator instead of spinning line
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', radarSize/2, radarSize/2);
    }

    const cx = radarSize / 2;
    const cy = radarSize / 2;

    // Get player heading (only if not paused)
    let playerHeading = 0;
    if (!isGamePaused && playerData && playerData.animationValue) {
        playerHeading = playerData.animationValue.heading360 || 0;
    }

    // Draw player triangle (rotated to heading)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((playerHeading * Math.PI) / 180);

    // Draw player aircraft with better graphics
    ctx.fillStyle = isGamePaused ? 'rgba(150, 150, 150, 0.9)' : 'rgba(0, 255, 0, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;

    // Main triangle
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(10, 10);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    ctx.restore();

    // Draw player's own callsign below the player triangle
    if (playerCallsign) {
        // Position for player callsign (below the triangle)
        const playerTextY = cy + 35;

        // Draw background for player callsign
        ctx.fillStyle = isGamePaused ? 'rgba(50, 50, 50, 0.9)' : 'rgba(0, 100, 0, 0.9)';
        ctx.strokeStyle = isGamePaused ? 'rgba(150, 150, 150, 1)' : 'rgba(0, 255, 0, 1)';
        ctx.lineWidth = 2;

        const playerText = playerCallsign.substring(0, 15);
        const playerTextWidth = ctx.measureText(playerText).width;

        // Background rectangle with rounded corners
        const borderRadius = 10;
        const rectX = cx - playerTextWidth/2 - 10;
        const rectY = playerTextY - 15;
        const rectWidth = playerTextWidth + 20;
        const rectHeight = 30;

        // Draw rounded rectangle
        ctx.beginPath();
        ctx.moveTo(rectX + borderRadius, rectY);
        ctx.lineTo(rectX + rectWidth - borderRadius, rectY);
        ctx.quadraticCurveTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + borderRadius);
        ctx.lineTo(rectX + rectWidth, rectY + rectHeight - borderRadius);
        ctx.quadraticCurveTo(rectX + rectWidth, rectY + rectHeight, rectX + rectWidth - borderRadius, rectY + rectHeight);
        ctx.lineTo(rectX + borderRadius, rectY + rectHeight);
        ctx.quadraticCurveTo(rectX, rectY + rectHeight, rectX, rectY + rectHeight - borderRadius);
        ctx.lineTo(rectX, rectY + borderRadius);
        ctx.quadraticCurveTo(rectX, rectY, rectX + borderRadius, rectY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Player callsign text
        ctx.fillStyle = isGamePaused ? 'rgba(200, 200, 200, 1)' : 'rgba(0, 255, 0, 1)';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(playerText, cx, playerTextY);

        // Add "YOU" indicator above the callsign
        ctx.fillStyle = isGamePaused ? 'rgba(200, 200, 0, 1)' : 'rgba(255, 255, 0, 1)';
        ctx.font = 'bold 12px Arial';
        ctx.fillText("YOU", cx, playerTextY - 25);
    }

    // Draw other aircraft (only if not paused)
    let aircraftCount = 0;

    if (!isGamePaused && aircraftListCache.length > 0 && playerLat && playerLon) {
        aircraftListCache.forEach(ac => {
            // Skip aircraft without coordinates
            if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) return;

            const [dx, dy] = latLonToMeters(playerLat, playerLon, ac.co[0], ac.co[1]);
            const distance = Math.sqrt(dx*dx + dy*dy);

            // Skip if too far (outside radar range)
            if (distance > radarRange) return;

            const radarX = cx + (dx / radarRange) * (radarSize / 2);
            const radarY = cy - (dy / radarRange) * (radarSize / 2);

            // Check if within radar circle
            if (Math.hypot(radarX - cx, radarY - cy) <= radarSize / 2) {
                // Draw aircraft dot with glow effect
                ctx.shadowColor = 'rgba(255, 50, 50, 0.8)';
                ctx.shadowBlur = 15;
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.arc(radarX, radarY, 7, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // Draw outline
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Calculate direction indicator (small line showing aircraft heading)
                const acHeading = ac.h || 0;
                const indicatorLength = 12;
                const indicatorX = radarX + Math.cos((acHeading * Math.PI) / 180) * indicatorLength;
                const indicatorY = radarY + Math.sin((acHeading * Math.PI) / 180) * indicatorLength;

                ctx.beginPath();
                ctx.moveTo(radarX, radarY);
                ctx.lineTo(indicatorX, indicatorY);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.lineWidth = 3;
                ctx.stroke();

                // Draw other aircraft name/callsign
                if (ac.cs) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                    ctx.font = 'bold 13px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';

                    // Background for text
                    const text = ac.cs.substring(0, 15);
                    const textWidth = ctx.measureText(text).width;

                    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    ctx.fillRect(
                        radarX - textWidth/2 - 5,
                        radarY + 15,
                        textWidth + 10,
                        20
                    );

                    // Text
                    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                    ctx.fillText(text, radarX, radarY + 17);
                }

                // Draw distance below name
                ctx.fillStyle = 'rgba(0, 255, 255, 1)';
                ctx.font = '12px Arial';
                const distText = `${Math.round(distance)}m`;
                const distWidth = ctx.measureText(distText).width;

                // Background for distance
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.fillRect(
                    radarX - distWidth/2 - 4,
                    radarY + 38,
                    distWidth + 8,
                    18
                );

                // Distance text
                ctx.fillStyle = 'rgba(0, 255, 255, 1)';
                ctx.fillText(distText, radarX, radarY + 40);

                aircraftCount++;
            }
        });
    }

    // Draw radar info box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(5, 5, 160, 80);

    ctx.strokeStyle = isGamePaused ? 'rgba(255, 255, 0, 0.7)' : 'rgba(0, 255, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, 160, 80);

    // Draw radar info text
    ctx.fillStyle = isGamePaused ? 'rgba(255, 255, 0, 1)' : 'rgba(0, 255, 0, 1)';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`RADAR: ${radarRange/1000}km`, 10, 25);

    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.font = '13px Arial';
    ctx.fillText(`Aircraft: ${aircraftCount}`, 10, 45);
    ctx.fillText(`Range: ${radarSize/2}px`, 10, 65);

    if (playerCallsign) {
        ctx.fillText(`You: ${playerCallsign.substring(0, 12)}`, 10, 85);
    } else {
        ctx.fillText(`You: Not set`, 10, 85);
    }

    // Show paused status
    if (isGamePaused) {
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME PAUSED', radarSize/2, radarSize - 30);
    }
}

// === Update radar drawing ===
function updateRadarDrawing() {
    if (!isDragging) {
        drawRadar();
    }
    requestAnimationFrame(updateRadarDrawing);
}

// Start the radar drawing loop
updateRadarDrawing();

// Also update at a fixed interval for data refresh
setInterval(() => {
    if (!isDragging) {
        drawRadar();
    }
}, 100); // Update 10 times per second for smooth animation
