// ==UserScript==
// @name         Geo-FS-Radar
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  A mini-map Radar toggle with Alt+Z, drag to move
// @author       Massiv4515 & YK3D
// @match        https://www.geo-fs.com/geofs.php?v=3.9
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

// === Radar Settings ===
const radarRange = 6000; // meters, adjust to zoom in/out (max distance radar can detect aircrafts)
const radarSize = 450; // px (size on screen)
const updateInterval = 750; // time in ms

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
let playerCallsign = "YOU";
let playerLat = 0;
let playerLon = 0;
let playerData = null;

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
}

function onDragTouch(e) {
    if (!isDragging || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const newLeft = touch.clientX - dragOffsetX;
    const newTop = touch.clientY - dragOffsetY;

    radarCanvas.style.left = newLeft + 'px';
    radarCanvas.style.top = newTop + 'px';

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
}

// Load saved position when script starts
setTimeout(loadRadarPosition, 100);

// === Toggle radar visibility with Alt+Z (Updated) ===
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyZ') {
        const isHidden = radarCanvas.style.display === 'none';
        radarCanvas.style.display = isHidden ? 'block' : 'none';

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

// === Function to get current player data ===
function updatePlayerData() {
    try {
        const player = geofs.aircraft?.instance;
        if (player) {
            playerData = player;
            playerCallsign = player.callsign || "YOU";
            playerLat = player.llaLocation[0];
            playerLon = player.llaLocation[1];
        }
    } catch (e) {
        console.log("Could not get player data yet");
    }
}

// === Fetch aircraft every second and update cache ===
async function updateAircraftCache() {
    try {
        const res = await fetch('https://mps.geo-fs.com/map');
        const data = await res.json();

        // Update player data first
        updatePlayerData();

        // Filter out the current player from the list
        if (playerCallsign && playerCallsign !== "YOU") {
            aircraftListCache = (data.users || []).filter(ac => {
                // Skip if aircraft doesn't have callsign
                if (!ac.cs) return true;

                // Skip if it matches player callsign (case insensitive)
                if (ac.cs.toLowerCase() === playerCallsign.toLowerCase()) {
                    return false;
                }

                // Additional check: if aircraft is very close to player position
                if (playerLat && playerLon && ac.co && ac.co.length >= 2) {
                    const [dx, dy] = latLonToMeters(playerLat, playerLon, ac.co[0], ac.co[1]);
                    const distance = Math.sqrt(dx*dx + dy*dy);
                    // If aircraft is within 10 meters, it's probably the player
                    if (distance < 10) {
                        return false;
                    }
                }

                return true;
            });
        } else {
            aircraftListCache = data.users || [];
        }

        // Debug info
        console.log(`Radar: Total fetched: ${data.users?.length || 0}, Filtered: ${aircraftListCache.length}, Player: ${playerCallsign}`);
    } catch (e) {
        console.error('Could not fetch live users:', e);
    }
}

// Start fetching aircraft data
setInterval(updateAircraftCache, 1000);
updateAircraftCache(); // Initial fetch

// Update player data frequently
setInterval(updatePlayerData, 500);

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

// === Function to check if aircraft is the player ===
function isPlayerAircraft(ac) {
    if (!ac.cs) return false;

    // Check callsign match (case insensitive)
    if (playerCallsign !== "YOU" && ac.cs.toLowerCase() === playerCallsign.toLowerCase()) {
        return true;
    }

    // Check position proximity (if player data is available)
    if (playerLat && playerLon && ac.co && ac.co.length >= 2) {
        const [dx, dy] = latLonToMeters(playerLat, playerLon, ac.co[0], ac.co[1]);
        const distance = Math.sqrt(dx*dx + dy*dy);
        // If within 10 meters, it's probably the player
        if (distance < 10) {
            return true;
        }
    }

    return false;
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

    // Draw spinning line
    drawSpinningLine();

    const cx = radarSize / 2;
    const cy = radarSize / 2;

    // Get player heading
    let playerHeading = 0;
    if (playerData && playerData.animationValue) {
        playerHeading = playerData.animationValue.heading360 || 0;
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
        const playerTextY = cy + 35; // Position below the player triangle

        // Draw background for player callsign
        ctx.fillStyle = 'rgba(0, 100, 0, 0.9)';
        ctx.strokeStyle = 'rgba(0, 255, 0, 1)';
        ctx.lineWidth = 2;

        const playerText = playerCallsign.substring(0, 15); // Limit length
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
        ctx.fillStyle = 'rgba(0, 255, 0, 1)';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(playerText, cx, playerTextY);

        // Add "YOU" indicator above the callsign
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.font = 'bold 12px Arial';
        ctx.fillText("YOU", cx, playerTextY - 25);
    }

    // Draw other aircraft
    let aircraftCount = 0;

    if (aircraftListCache.length > 0 && playerLat && playerLon) {
        aircraftListCache.forEach(ac => {
            // Double-check: skip if this is the player aircraft
            if (isPlayerAircraft(ac)) {
                console.log(`Skipping player aircraft: ${ac.cs}`);
                return;
            }

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
                    const text = ac.cs.substring(0, 15); // Limit length
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
    ctx.fillRect(5, 5, 160, 75);

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, 160, 75);

    // Draw radar info text
    ctx.fillStyle = 'rgba(0, 255, 0, 1)';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`RADAR: ${radarRange/1000}km`, 10, 25);

    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.font = '13px Arial';
    ctx.fillText(`Aircraft: ${aircraftCount}`, 10, 45);
    ctx.fillText(`Range: ${radarSize/2}px`, 10, 65);

    if (playerCallsign && playerCallsign !== "YOU") {
        ctx.fillText(`You: ${playerCallsign.substring(0, 12)}`, 10, 85);
    } else {
        ctx.fillText(`You: ${playerCallsign}`, 10, 85);
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
