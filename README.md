# Geo-FS-Radar
Drag and drop radar for Geo-FS
Original code made by: @Massiv4515 https://github.com/Massiv4515/GeoFS-MiniRadar

How to use:

  You must download Tampermonkey
  Create a new script and paste https://github.com/YK3D/Geo-FS-Radar/blob/main/Geo-FS-Radar.js into it after deleting all previous text

Instructions:
  1. On first use you will be prompted to enter your callsign YOU MUST ENTER THIS EXACTLY AS IN YOUR ACCOUNT
  2. To change size, distance and speed of updates go to 'Radar Settings' section in the code (line 12)
  3. If you have changed your callsign, to re-enter it, click on the red button on the top left of the radar
  4. if the red button isnt visible, simply drag the radar a bit and it should auto move towards the radar
Geo-FS Radar - Complete Feature List
Core Radar Features
  Real-time aircraft detection - Fetches and displays other players from Geo-FS multiplayer server
  300px circular radar display - Clean, semi-transparent green-themed radar screen
  Player position tracking - Automatically detects your aircraft's position and heading

  Live aircraft updates - Fetches new data every second from https://mps.geo-fs.com/map

  Automatic self-filtering - Hides your own aircraft using saved callsign to avoid false detection

  Distance calculation - Shows exact meter distance to each detected aircraft

  Aircraft heading indicators - Small directional lines showing which way other planes are flying

  Callsign labels - Displays other players' callsigns above their aircraft dots

  Red enemy dots - Other aircraft appear as red dots with glow effects

  Distance-based visibility - Only shows aircraft within current radar range

User Interface
  Draggable radar - Click and drag anywhere on the radar to reposition

  Touch support - Works with touchscreen devices

  Position saving - Radar position is saved to localStorage and restored on next visit

  Alt+Z toggle - Quick keyboard shortcut to show/hide the entire radar

  Visibility state saving - Remembers if radar was hidden/shown between sessions

  "SCANNING..." indicator - Shows when no aircraft data is available

  Compass directions - N, E, S, W marked on radar edges

  Grid lines - Center crosshair and 3 range rings for distance reference

  Radar info box - Displays current range, aircraft count, and your callsign

  Spinning radar line - Animated sweep line with trail effect for authentic radar feel

  Range & Zoom Control
  Mouse wheel zoom - Scroll up to zoom in (decrease range), scroll down to zoom out (increase range)

  Adjustable range - 1,000m to 20,000m (1km to 20km)

  100m stepping - Range adjusts in 100m increments

  Distance display box - Shows current range in kilometers above the radar

  Visual range feedback - Radar info box updates with current km setting

  Range rings - 3 concentric circles representing 33%, 66%, and 100% of current range

Callsign Management
  Callsign detection - Automatically reads your aircraft's callsign from GeoFS

  LocalStorage saving - Your callsign is saved between sessions

  Reset button - Red circular button (top-right of radar) to clear saved callsign

  Confirmation dialog - Asks for confirmation before resetting

  "YOU" indicator - Yellow text above your callsign showing you're the player

  Callsign display - Your callsign appears below your aircraft triangle

  Player triangle - Green triangle rotated to match your actual heading

Aircraft Visualization
  Distance-based sizing - Closer aircraft appear slightly larger

  Distance-based brightness - Closer aircraft have brighter red color
  
  White outlines - Each aircraft dot has a white border for visibility

  Heading lines - White directional lines showing aircraft orientation

  Callsign backgrounds - Semi-transparent black boxes behind text for readability

  Distance text - Cyan-colored distance displayed below each aircraft

  Glow effects - Red glow around aircraft dots for emphasis

Performance & Stability
  RequestAnimationFrame rendering - Smooth 60fps animation

  Dragging optimization - Skips radar redraw while dragging for performance
  
  Error handling - Gracefully handles missing GeoFS objects

  Fallback values - Defaults to "YOU" if callsign can't be read

  Coordinate validation - Skips aircraft with invalid position data

  Console logging - Non-intrusive debug information for troubleshooting

  Compatibility
  GeoFS v3.9 - Specifically matched to current GeoFS version

  Tampermonkey/Greasemonkey - Works with all major userscript managers

  Cross-browser - Compatible with Chrome, Firefox, Edge, Safari

  Touchscreen support - Full drag functionality on mobile devices

  Persistent storage - Uses localStorage for settings retention

Visual Styling
  Military green theme - Classic radar aesthetic with green on black

  Semi-transparent background - Doesn't completely block game view

  Green glow effect - Subtle green outer glow for visibility

  White border accents - Clean, modern look with white highlights

  Rounded corners - Fully circular radar display

  Shadow effects - Depth and emphasis on interactive elements

  Smooth transitions - Hover effects on buttons

Reset Button Specifics
  Position - Top-right corner of radar, partially overlapping

  Color - Red with glow effect

  Icon - Circular arrow (⟳) symbol

  Hover effect - Brighter red, larger glow, scale up

  Function - Clears both 'callsign' and 'playerCallsign' from localStorage

  Visibility - Hides/shows with radar using Alt+Z

Distance Box Specifics
  Position - Centered above the radar

  Size - 120px × 50px

  Style - Green border, black background

  Content - Shows range in km (e.g., "5.0 km") with "RANGE" label
  
  Updates - Changes in real-time when scrolling

Visibility - Toggles with radar using Alt+Z

Mouse Wheel Controls
Zoom in - Scroll up (negative delta) = -1000m range

Zoom out - Scroll down (positive delta) = +1000m range

Bounds - Cannot go below 500m or above 20000m

Rounding - Automatically rounds to nearest 100m

Feedback - Console log shows new range setting

Visual update - Distance box and radar info update immediately

