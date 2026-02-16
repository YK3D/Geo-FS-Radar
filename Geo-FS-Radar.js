// ==UserScript==
// @name         GeoFS Radar
// @namespace    http://tampermonkey.net/
// @version      4.72
// @description  On screen radar for GeoFS
// @author       Massiv4515 & YK3D
// @match        https://www.geo-fs.com/geofs.php?v=3.9
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

// === Radar Settings ===
let radarRange = 5000; // default start range in meters, adjust to zoom in/out using scroll wheel
const radarSize = 450; // size of radar on screen in px
const updateInterval = 500; // Update rate in ms
const scrollIncrement = 1000; // How much to increment/decrement range per scroll tick (in meters)

// === Range Settings ===
const MIN_RANGE = 500; // 0.5km minimum
const MAX_RANGE = 20000; // 20km maximum

// === Create radar canvas with drag handles ===
let radarCanvas = document.createElement('canvas');
radarCanvas.width = radarSize;
radarCanvas.height = radarSize;
radarCanvas.style.position = 'absolute';
radarCanvas.style.top = '66%';
radarCanvas.style.left = '5px';
radarCanvas.style.background = 'rgba(0,0,0,0.7)';
radarCanvas.style.borderRadius = '50%';
radarCanvas.style.zIndex = 9999;
radarCanvas.style.cursor = 'move'; // Change cursor to indicate draggable
radarCanvas.style.border = '2px solid rgba(255,255,255,0.3)';
radarCanvas.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.5)';
document.body.appendChild(radarCanvas);

let ctx = radarCanvas.getContext('2d');

// === Button references ===
let resetButton = null;
let distanceBox = null;

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

// === Make Radar Draggable ===
radarCanvas.addEventListener('mousedown', startDrag);
radarCanvas.addEventListener('touchstart', startDragTouch);

function startDrag(e) {
    isDragging = true;

    // Get mouse position relative to radar
    const rect = radarCanvas.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    // Add event listeners for dragging
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);

    // Change appearance while dragging
    radarCanvas.style.border = '2px solid rgba(0, 255, 0, 0.7)';
    radarCanvas.style.cursor = 'grabbing';
    radarCanvas.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.8)';

    e.preventDefault();
}

function startDragTouch(e) {
    if (e.touches.length === 1) {
        isDragging = true;
        const touch = e.touches[0];
        const rect = radarCanvas.getBoundingClientRect();
        dragOffsetX = touch.clientX - rect.left;
        dragOffsetY = touch.clientY - rect.top;

        document.addEventListener('touchmove', onDragTouch);
        document.addEventListener('touchend', stopDrag);

        radarCanvas.style.border = '2px solid rgba(0, 255, 0, 0.7)';
        radarCanvas.style.cursor = 'grabbing';
        radarCanvas.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.8)';

        e.preventDefault();
    }
}

function onDrag(e) {
    if (!isDragging) return;

    // Calculate new position
    const newLeft = e.clientX - dragOffsetX;
    const newTop = e.clientY - dragOffsetY;

    // Apply new position
    radarCanvas.style.left = newLeft + 'px';
    radarCanvas.style.top = newTop + 'px';

    // Update button positions
    updateButtonPositions();
}

function onDragTouch(e) {
    if (!isDragging || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const newLeft = touch.clientX - dragOffsetX;
    const newTop = touch.clientY - dragOffsetY;

    radarCanvas.style.left = newLeft + 'px';
    radarCanvas.style.top = newTop + 'px';

    // Update button positions
    updateButtonPositions();

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
    radarCanvas.style.border = '2px solid rgba(255,255,255,0.3)';
    radarCanvas.style.cursor = 'move';
    radarCanvas.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.5)';

    // Optional: Save position to localStorage
    saveRadarPosition();
}

// === Save and Load Position (Optional) ===
function saveRadarPosition() {
    const pos = {
        left: radarCanvas.style.left,
        top: radarCanvas.style.top
    };
    localStorage.setItem('radarPosition', JSON.stringify(pos));
}

function loadRadarPosition() {
    const saved = localStorage.getItem('radarPosition');
    if (saved) {
        const pos = JSON.parse(saved);
        radarCanvas.style.left = pos.left;
        radarCanvas.style.top = pos.top;
    }
    // Update button positions after loading radar position
    setTimeout(updateButtonPositions, 100);
}

// Load saved position when script starts
setTimeout(loadRadarPosition, 100);

// === Create reset button ===
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
        e.stopPropagation();
        if (confirm('Reset your callsign? You will need to enter it again.')) {
            // Clear saved callsign
            localStorage.removeItem('callsign');
            localStorage.removeItem('playerCallsign');

            // Prompt for new callsign
            setTimeout(() => {
                const newCallsign = prompt("Enter your Geo-FS callsign to prevent showing yourself on radar:");
                if (newCallsign && newCallsign.trim()) {
                    const trimmedCallsign = newCallsign.trim().toUpperCase();
                    localStorage.setItem('callsign', trimmedCallsign);
                    localStorage.setItem('playerCallsign', trimmedCallsign);
                    window.playerCallsign = trimmedCallsign;
                    alert(`Callsign set to: ${trimmedCallsign}`);
                }
            }, 100);
        }
    };

    document.body.appendChild(resetBtn);
    resetButton = resetBtn;
    updateButtonPositions();
    return resetBtn;
}

// === Create distance display box (ABOVE radar) ===
function createDistanceDisplay() {
    // Remove existing distance box if any
    const existingDistanceBox = document.getElementById('radarDistanceBox');
    if (existingDistanceBox) {
        existingDistanceBox.remove();
    }

    const distanceBox = document.createElement('div');
    distanceBox.id = 'radarDistanceBox';
    distanceBox.style.position = 'absolute';
    distanceBox.style.width = '120px';
    distanceBox.style.height = '50px';
    distanceBox.style.backgroundColor = 'rgba(0, 50, 0, 0.8)';
    distanceBox.style.border = '2px solid rgba(0, 255, 0, 0.7)';
    distanceBox.style.borderRadius = '15px';
    distanceBox.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.5)';
    distanceBox.style.zIndex = '9998';
    distanceBox.style.display = 'flex';
    distanceBox.style.flexDirection = 'column';
    distanceBox.style.alignItems = 'center';
    distanceBox.style.justifyContent = 'center';
    distanceBox.style.pointerEvents = 'none';

    const distanceText = document.createElement('div');
    distanceText.id = 'radarDistanceText';
    distanceText.textContent = `${(radarRange/1000).toFixed(1)} km`;
    distanceText.style.color = '#0f0';
    distanceText.style.fontFamily = 'Arial, sans-serif';
    distanceText.style.fontSize = '18px';
    distanceText.style.fontWeight = 'bold';
    distanceText.style.textShadow = '0 0 5px rgba(0, 255, 0, 0.7)';

    const labelText = document.createElement('div');
    labelText.textContent = 'RANGE';
    labelText.style.color = '#0f0';
    labelText.style.fontFamily = 'Arial, sans-serif';
    labelText.style.fontSize = '11px';
    labelText.style.opacity = '0.8';
    labelText.style.marginTop = '2px';

    distanceBox.appendChild(distanceText);
    distanceBox.appendChild(labelText);
    document.body.appendChild(distanceBox);

    distanceBox = distanceBox;
    updateButtonPositions();
    return distanceBox;
}

// === Update distance display ===
function updateDistanceDisplay() {
    const distanceText = document.getElementById('radarDistanceText');
    if (distanceText) {
        distanceText.textContent = `${(radarRange/1000).toFixed(1)} km`;
    }
}

// === Update button positions ===
function updateButtonPositions() {
    if (!radarCanvas) return;

    const radarLeft = parseInt(radarCanvas.style.left) || 0;
    const radarTop = parseInt(radarCanvas.style.top) || 0;

    // Update reset button position (top-right of radar)
    if (resetButton) {
        resetButton.style.left = (radarLeft + radarSize - 15) + 'px';
        resetButton.style.top = (radarTop - 15) + 'px';
    }

    // Update distance box position (above radar, centered)
    const distanceBox = document.getElementById('radarDistanceBox');
    if (distanceBox) {
        distanceBox.style.left = (radarLeft + radarSize/2 - 60) + 'px';
        distanceBox.style.top = (radarTop - 70) + 'px';
    }
}

// === Mouse wheel scrolling for range adjustment ===
radarCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Determine if scrolling up or down
    const scrollAmount = e.deltaY > 0 ? scrollIncrement : -scrollIncrement;

    // Update radar range with limits
    radarRange = Math.max(MIN_RANGE, Math.min(MAX_RANGE, radarRange + scrollAmount));

    // Round to nearest 100m
    radarRange = Math.round(radarRange / 100) * 100;

    // Update distance display
    updateDistanceDisplay();

    // Show range in console
    console.log(`Radar range: ${radarRange/1000}km`);
});

// === Create buttons after canvas is created ===
setTimeout(() => {
    createResetButton();
    createDistanceDisplay();

    // Load saved callsign if exists
    const savedCallsign = localStorage.getItem('playerCallsign') || localStorage.getItem('callsign');
    if (savedCallsign) {
        window.playerCallsign = savedCallsign;
    }
}, 500);

// === Toggle radar visibility with Alt+Z (Updated) ===
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyZ') {
        const isHidden = radarCanvas.style.display === 'none';
        radarCanvas.style.display = isHidden ? 'block' : 'none';

        // Also toggle reset button visibility
        if (resetButton) {
            resetButton.style.display = isHidden ? 'flex' : 'none';
        }

        // Toggle distance box visibility
        const distanceBox = document.getElementById('radarDistanceBox');
        if (distanceBox) {
            distanceBox.style.display = isHidden ? 'flex' : 'none';
        }

        // Save visibility state
        localStorage.setItem('radarVisible', isHidden);
    }
});

// Load visibility state
const wasVisible = localStorage.getItem('radarVisible') !== 'false';
if (!wasVisible) {
    radarCanvas.style.display = 'none';
}

// === Global variable to store aircraft ===
let aircraftListCache = [];

// === Fetch aircraft every second and update cache ===
async function updateAircraftCache() {
    try {
        const res = await fetch('https://mps.geo-fs.com/map');
        const data = await res.json();
        aircraftListCache = data.users || [];
    } catch (e) {
        console.error('Could not fetch live users:', e);
    }
}

// Start fetching aircraft data
setInterval(updateAircraftCache, 1000);
updateAircraftCache(); // Initial fetch

// === Convert lat/lon to meters relative to player (rough approximation) ===
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
    // Clear canvas with slight fade effect for trails
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, radarSize, radarSize);

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
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const directions = ['N', 'E', 'S', 'W'];
    const dirPositions = [
        {x: radarSize/2, y: 15},
        {x: radarSize - 15, y: radarSize/2},
        {x: radarSize/2, y: radarSize - 15},
        {x: 15, y: radarSize/2}
    ];

    directions.forEach((dir, i) => {
        ctx.fillText(dir, dirPositions[i].x, dirPositions[i].y);
    });

    // Draw spinning line
    drawSpinningLine();

    const cx = radarSize / 2;
    const cy = radarSize / 2;

    // Get player data
    let playerHeading = 0;
    let player = null;
    let playerCallsign = "YOU";

    try {
        player = geofs.aircraft?.instance;
        if (player) {
            playerHeading = player.animationValue?.heading360 || 0;
            playerCallsign = player.callsign || "YOU";

            // Also set window.playerCallsign if we have a callsign from GeoFS
            if (player.callsign) {
                window.playerCallsign = player.callsign;
            }
        }
    } catch (e) {
        console.log("Could not get player data yet");
    }

    // Draw player triangle (rotated to heading)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((playerHeading * Math.PI) / 180);

    // Draw player aircraft with better graphics
    ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;

    // Main triangle
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(8, 8);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    ctx.restore();

    // Draw player's own callsign below the player triangle
    if (playerCallsign) {
        // Position for player callsign (below the triangle)
        const playerTextY = cy + 25; // Position below the player triangle

        // Draw background for player callsign
        ctx.fillStyle = 'rgba(0, 100, 0, 0.8)';
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)';
        ctx.lineWidth = 1;

        const playerText = playerCallsign.substring(0, 12); // Limit length
        const playerTextWidth = ctx.measureText(playerText).width;

        // Background rectangle
        ctx.fillRect(
            cx - playerTextWidth/2 - 6,
            playerTextY - 10,
            playerTextWidth + 12,
            20
        );

        // Border around background
        ctx.strokeRect(
            cx - playerTextWidth/2 - 6,
            playerTextY - 10,
            playerTextWidth + 12,
            20
        );

        // Player callsign text
        ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(playerText, cx, playerTextY);

        // NEVER show "YOU" text - removed entirely regardless of callsign
    }

    // Draw other aircraft
    if (aircraftListCache.length > 0 && player) {
        const playerLat = player.llaLocation[0];
        const playerLon = player.llaLocation[1];

        let aircraftCount = 0;

        aircraftListCache.forEach(ac => {
            // Skip self - we already show the player separately
            // Use the manually entered callsign if available, otherwise use the one from GeoFS
            const selfCallsign = window.playerCallsign || playerCallsign;
            if (ac.cs === selfCallsign) return;

            // Also skip if the aircraft has no callsign or callsign is "foo" (default GeoFS callsign)
            if (!ac.cs || ac.cs === "" || ac.cs.toUpperCase() === "FOO") return;

            // Skip aircraft without coordinates
            if (!ac.co || !Array.isArray(ac.co) || ac.co.length < 2) return;

            const [dx, dy] = latLonToMeters(playerLat, playerLon, ac.co[0], ac.co[1]);
            const distance = Math.sqrt(dx*dx + dy*dy);

            // Skip if too far (outside radar range) - using radarRange variable
            if (distance > radarRange) return;

            const radarX = cx + (dx / radarRange) * (radarSize / 2);
            const radarY = cy - (dy / radarRange) * (radarSize / 2);

            // Check if within radar circle
            if (Math.hypot(radarX - cx, radarY - cy) <= radarSize / 2) {
                // Draw aircraft dot with glow effect
                ctx.shadowColor = 'rgba(255, 50, 50, 0.8)';
                ctx.shadowBlur = 10;
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.arc(radarX, radarY, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // Draw outline
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Calculate direction indicator (small line showing aircraft heading)
                const acHeading = ac.h || 0;
                const indicatorLength = 8;
                const indicatorX = radarX + Math.cos((acHeading * Math.PI) / 180) * indicatorLength;
                const indicatorY = radarY + Math.sin((acHeading * Math.PI) / 180) * indicatorLength;

                ctx.beginPath();
                ctx.moveTo(radarX, radarY);
                ctx.lineTo(indicatorX, indicatorY);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Draw other aircraft name/callsign
                if (ac.cs) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';

                    // Background for text
                    const text = ac.cs.substring(0, 12); // Limit length
                    const textWidth = ctx.measureText(text).width;

                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.fillRect(
                        radarX - textWidth/2 - 3,
                        radarY + 10,
                        textWidth + 6,
                        16
                    );

                    // Text
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.fillText(text, radarX, radarY + 12);
                }

                // Draw distance below name
                ctx.fillStyle = 'rgba(0, 255, 255, 0.9)';
                ctx.font = '10px Arial';
                const distText = `${Math.round(distance)}m`;
                const distWidth = ctx.measureText(distText).width;

                // Background for distance
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(
                    radarX - distWidth/2 - 2,
                    radarY + 28,
                    distWidth + 4,
                    14
                );

                // Distance text
                ctx.fillStyle = 'rgba(0, 255, 255, 0.9)';
                ctx.fillText(distText, radarX, radarY + 30);

                aircraftCount++;
            }
        });

        // Draw radar info box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(5, 5, 140, 50);

        ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(5, 5, 140, 50);

        // Draw radar info text - using radarRange variable
        ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`RADAR: ${radarRange/1000}km`, 10, 20);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '11px Arial';
        ctx.fillText(`Aircraft: ${aircraftCount}`, 10, 35);
        ctx.fillText(`Range: ${radarSize/2}px = ${radarRange/1000}km`, 10, 50);
        ctx.fillText(`You: ${window.playerCallsign || playerCallsign}`, 10, 65);
    } else {
        // Draw "scanning" message
        ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SCANNING...', cx, cy);
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

// Periodically update button positions (in case of window resize)
setInterval(updateButtonPositions, 1000);
