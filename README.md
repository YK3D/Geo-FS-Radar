# Geo-FS-Radar
Drag and drop radar for Geo-FS
Original code made by: @Massiv4515 https://github.com/Massiv4515/GeoFS-MiniRadar

Changes: 
  1. Drag and drop
       -lock with ALT+Z
  3. Radar / Animations / VFX
       -Rotating green line that spins around the radar center
       -Leaves a fading green trail behind it (shadow effect)
       -Green dot at the end of the spinning line
       -Smooth gradient from bright green to transparent
       -Trail length and speed can be adjusted in settings
       -Glow effect on aircraft dots
       -Radar info box showing range and aircraft count
       -North East Sout West directions
       -Direction indicators showing aircraft heading
       -Compass directions (N, E, S, W) around radar edge
       -Improved grid lines and range circles
       -Distance displayed below aircraft names (in meters)
     
  5. Shows callsign/username below each aircraft dot
       -Limited to 12 characters to prevent overflow
       -Black background behind text for better readability
       -Names positioned beneath the aircraft indicator

How to use:
  You must download Tampermonkey
  Create a new script and paste https://github.com/YK3D/Geo-FS-Radar/blob/main/Geo-FS-Radar.js into it after deleting all previous text
