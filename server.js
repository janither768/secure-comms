const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

let db = {};
let activeUsers = {};
let roomConstraints = {};
const HEARTBEAT_MS = 45000;
// Briefs storage (in-memory only)
let briefs = {};
let briefCounter = 0; // simple incrementing ID

// Basic HTML escape to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
const SCALE = 100; // 1 grid cell = 100 meters
const dirVectors = {
  N:  { dx: 0,  dy: -1 },
  NE: { dx: 1,  dy: -1 },
  E:  { dx: 1,  dy: 0 },
  SE: { dx: 1,  dy: 1 },
  S:  { dx: 0,  dy: 1 },
  SW: { dx: -1, dy: 1 },
  W:  { dx: -1, dy: 0 },
  NW: { dx: -1, dy: -1 }
};
const SERVER_START = Date.now();

const metaViewport = `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`;
const fontImport = `<link href="https://fonts.googleapis.com/css2?family=Michroma&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">`;
const commonStyle = `
  body { background-color: #060505; font-family: 'Lato', sans-serif; color: #a1b0c0; margin: 0; }
  .btn-tactical { background-color: #5D3FD3; color: white; border: none; padding: 12px 24px; cursor: pointer; font-family: 'Michroma', sans-serif; text-transform: uppercase; font-weight: bold; }
  .status-matrix { color: #5c748c; font-family: monospace; font-size: 0.75em; }
  input { font-size: 16px; }
`;

// ============ PHASE 1: PRE-CHANNEL (LIVE STATUS OVERHAUL) ============
const renderLanding = (stats = {}) => {
  const { totalOps = 0, activeChannels = 0, totalMessages = 0, uptimeStr = '--' } = stats;

  return `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
    ${commonStyle}
    html, body { height: 100%; margin: 0; }
    /* Amber button override for brief */
    .btn-brief { background-color: #B85C00; }
@keyframes scrollUp {
  0%   { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}
</style></head>
<body style="margin:0; background-color:#060505;">
    <!-- Fixed background layer (always stays put) -->
  <div style="position:fixed; top:0; left:0; width:100%; height:100%; z-index:-1; background-image:url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/BG1_NEW_Compressed.png'); background-size:cover; background-position:center; background-repeat:no-repeat;"></div>
  <table cellpadding="0" cellspacing="0" border="0" style="width:100%; height:100%; margin:0; border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top; text-align:left; padding:15px 0 0 15px;">
        <div style="background:rgba(6,5,5,0.5); display:inline-block; padding:8px 12px; border-radius:0px; border:0px solid #1f2937;">
          <div class="status-matrix" style="margin:0;">
  <div>SYS_NODE : STRATSIGNAL_PRIME // ONLINE</div>
  <div>RELAY_MODE : HTTP_POLL // NOMINAL</div>
  <div style="margin-top:8px;">NET_ACTIVE : ${totalOps} OPS // ${activeChannels} CH</div>
  <div>TRAFFIC   : ${totalMessages} MSG</div>
  <div>UPTIME    : ${uptimeStr}</div>
  <div style="margin-top:8px;">ZULU TIME : <span id="zulu">--:--:--</span></div>
</div>

<!-- Live ZULU clock (blinking colon) -->
<script>
(function() {
  var el = document.getElementById('zulu');
  if (!el) return;
  function tick() {
    var d = new Date();
    var h = String(d.getUTCHours()).padStart(2,'0');
    var m = String(d.getUTCMinutes()).padStart(2,'0');
    var s = String(d.getUTCSeconds()).padStart(2,'0');
    // Blinking colon: hide colon on even seconds
    var sep = (d.getUTCSeconds() % 2 === 0) ? ':' : ' ';
    el.textContent = h + sep + m + ':' + s;
  }
  tick();
  setInterval(tick, 1000);
})();
</script>
        </div>
      </td>
    </tr>
    <tr>
      <td style="vertical-align:middle; text-align:center; padding:0; overflow-x:hidden;">
        <img src="https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/New_OFFICIAL_LOGO.png"
     alt=""
     style="width:240px; max-width:80%; height:auto; display:block; border:none; margin:0 auto;">
        <!-- Tactical action buttons -->
                <div style="margin-top:20px; text-align:center;">
          <button class="btn-tactical"
                  onclick="window.location.href='/boot'"
                  style="box-shadow:0px 4px 20px rgba(0,0,0,0); display:inline-block; margin-bottom:10px;">
            [ ENGAGE CHANNEL ]
          </button><br>
          <button class="btn-tactical btn-brief"
                  onclick="window.location.href='/brief'"
                  style="box-shadow:0px 4px 20px rgba(0,0,0,0); display:inline-block;">
            [ MISSION BRIEF ]
          </button>
        </div>

        <!-- Terminal, same width as logo, transparent, no border -->
        <div style="width:240px; max-width:80%; margin:25px auto 0 auto; height:160px; overflow:hidden; background:transparent; border:none; font-family:monospace; font-size:10px; line-height:1.3; color:#39ff14;">
          <div style="animation: scrollUp 25s linear infinite;">
            <pre style="margin:0; padding:6px; white-space:pre-wrap; color:inherit; background:transparent; border:none; font:inherit;">[STRATSIGNAL OPS-TERM v3.2.7]

> INIT COMMS_PIPE --profile TACTICAL_NET
  [OK]  Handshake with NODE: FALCON-ALPHA
  [OK]  Uplink secured via SIGMA-TUNNEL
  [OK]  Crypto suite: AES-256 / Q-LAYER SCRAMBLE
  [OK]  Latency: 12.7 ms / Jitter: 1.3 ms

> LOAD MISSION_PROFILE --id MS-2047-RAZOR
  [OK]  Ruleset: ROE-BLACK
  [OK]  Theater: NORTHERN CORRIDOR / GRID 42-DELTA
  [OK]  Channels: TAC-1 / TAC-3 / GHOST-LINK

> LINK_STATUS --verbose
  [TAC-1]  ONLINE   | ENCRYPTED | 0.02% PACKET LOSS
  [TAC-3]  DEGRADED | ENCRYPTED | 3.41% PACKET LOSS
  [GHOST]  STEALTH  | DARK MODE | BEACON SUPPRESSED

> ROUTE_SCAN --hops 6 --mask 0x7F
  HOP[01]  RELAY-NODE // 10.24.7.3      [CLEAN]
  HOP[02]  FIELD-UNIT // 10.24.9.11     [CLEAN]
  HOP[03]  UNKNOWN    // 172.19.4.200   [FLAGGED]
  HOP[04]  HQ-CORE    // 10.0.0.1       [TRUSTED]
  PATH_INTEGRITY: 96.3%  |  ANOMALIES: 1

> WATCH CHANNEL TAC-1 --filter=PRIORITY
  [00:14:03Z] [PRIO-ALPHA] EAGLE-2: CONTACT EAST, GRID 42D-17
  [00:14:07Z] [PRIO-BRAVO] RAVEN-1: DRONE FEED LIVE, PUSHING TO OPS
  [00:14:12Z] [PRIO-ALPHA] EAGLE-2: REQUESTING FIRE MISSION, TYPE 3

> TELEMETRY --unit=EAGLE-2
  POS: 42D-17-09  |  ALT: 231 m
  VEL: 3.2 m/s    |  HEADING: 087°
  STATUS: GREEN   |  AMMO: 73% | FUEL: 61%

> SIGNAL_ANALYTICS --window=30s
  THROUGHPUT: 4.7 Mbps
  NOISE_FLOOR: -87 dBm
  INTERFERENCE: LOW
  JAMMING: NOT DETECTED
  CONFIDENCE: 98.1%

> OPS_FEED --mode=SCROLL
  [SYS]  New SITREP uploaded: SRP-26-ALPHA
  [SYS]  Map layer updated: ISR-DRONE-DELTA
  [SYS]  STRATSIGNAL RULESET PATCH: v3.2.7b APPLIED
  [SYS]  Auto-archive of low-priority traffic enabled

> EXEC MACRO "BATTLE-COMMS"
  STEP 1: SYNC CLOCKS .......... [OK]
  STEP 2: VERIFY CALLSIGNS ..... [OK]
  STEP 3: PUSH FREQ TABLES ..... [OK]
  STEP 4: ARM FAILOVER LINK .... [OK]
  RESULT: TACTICAL NET READY

> PROMPT
stratsignal:/tac_ops/comms $ █</pre>
            <!-- Duplicate for seamless loop -->
            <pre style="margin:0; padding:6px; white-space:pre-wrap; color:inherit; background:transparent; border:none; font:inherit;">[STRATSIGNAL OPS-TERM v3.2.7]

> INIT COMMS_PIPE --profile TACTICAL_NET
  [OK]  Handshake with NODE: FALCON-ALPHA
  [OK]  Uplink secured via SIGMA-TUNNEL
  [OK]  Crypto suite: AES-256 / Q-LAYER SCRAMBLE
  [OK]  Latency: 12.7 ms / Jitter: 1.3 ms

> LOAD MISSION_PROFILE --id MS-2047-RAZOR
  [OK]  Ruleset: ROE-BLACK
  [OK]  Theater: NORTHERN CORRIDOR / GRID 42-DELTA
  [OK]  Channels: TAC-1 / TAC-3 / GHOST-LINK

> LINK_STATUS --verbose
  [TAC-1]  ONLINE   | ENCRYPTED | 0.02% PACKET LOSS
  [TAC-3]  DEGRADED | ENCRYPTED | 3.41% PACKET LOSS
  [GHOST]  STEALTH  | DARK MODE | BEACON SUPPRESSED

> ROUTE_SCAN --hops 6 --mask 0x7F
  HOP[01]  RELAY-NODE // 10.24.7.3      [CLEAN]
  HOP[02]  FIELD-UNIT // 10.24.9.11     [CLEAN]
  HOP[03]  UNKNOWN    // 172.19.4.200   [FLAGGED]
  HOP[04]  HQ-CORE    // 10.0.0.1       [TRUSTED]
  PATH_INTEGRITY: 96.3%  |  ANOMALIES: 1

> WATCH CHANNEL TAC-1 --filter=PRIORITY
  [00:14:03Z] [PRIO-ALPHA] EAGLE-2: CONTACT EAST, GRID 42D-17
  [00:14:07Z] [PRIO-BRAVO] RAVEN-1: DRONE FEED LIVE, PUSHING TO OPS
  [00:14:12Z] [PRIO-ALPHA] EAGLE-2: REQUESTING FIRE MISSION, TYPE 3

> TELEMETRY --unit=EAGLE-2
  POS: 42D-17-09  |  ALT: 231 m
  VEL: 3.2 m/s    |  HEADING: 087°
  STATUS: GREEN   |  AMMO: 73% | FUEL: 61%

> SIGNAL_ANALYTICS --window=30s
  THROUGHPUT: 4.7 Mbps
  NOISE_FLOOR: -87 dBm
  INTERFERENCE: LOW
  JAMMING: NOT DETECTED
  CONFIDENCE: 98.1%

> OPS_FEED --mode=SCROLL
  [SYS]  New SITREP uploaded: SRP-26-ALPHA
  [SYS]  Map layer updated: ISR-DRONE-DELTA
  [SYS]  STRATSIGNAL RULESET PATCH: v3.2.7b APPLIED
  [SYS]  Auto-archive of low-priority traffic enabled

> EXEC MACRO "BATTLE-COMMS"
  STEP 1: SYNC CLOCKS .......... [OK]
  STEP 2: VERIFY CALLSIGNS ..... [OK]
  STEP 3: PUSH FREQ TABLES ..... [OK]
  STEP 4: ARM FAILOVER LINK .... [OK]
  RESULT: TACTICAL NET READY

> PROMPT
stratsignal:/tac_ops/comms $ █</pre>
                    </div>
        </div>

                <!-- Full-width image backdrop behind field manual -->
        <div style="position:relative; width:100vw; margin-left:calc(-50vw + 50%); margin-top:25px;">
          <img src="https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/The%20scrolling%20BG%20Trasnparent%202.png" 
               style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:0;" alt="">
          
          <!-- Manual text (centered, same width as logo, no background) -->
          <div style="position:relative; z-index:1; width:240px; max-width:80%; margin:0 auto; text-align:left; font-family:'Lato',sans-serif; color:#e0e0e0; font-size:12px; line-height:1.5; padding:25px 15px;">
            <div style="color:#39ff14; font-family:'Michroma',sans-serif; font-size:10px; margin-bottom:8px;">STRATSIGNAL v0.9200 // FIELD MANUAL</div>
            <p style="margin:0 0 8px 0;">Welcome, operator. StratSignal is your tactical web‑based communication node. It runs entirely in your browser – no install, no trace, no storage. You carry the mission; the server only holds your words in memory for as long as you need them.</p>
            <p style="margin:0 0 8px 0;">From the hub, you can <b style="color:#5D3FD3;">ENGAGE CHANNEL</b> to enter encrypted point‑to‑point comms with your team, or compile a <b style="color:#B85C00;">MISSION BRIEF</b> with a visual route map. Every message is timestamped. Every brief is disposable. You control when a channel lives or dies.</p>
            <p style="margin:0 0 8px 0;">This is a mission kit, not a social app. You call in, you execute, you purge. No one is watching, and nothing remains after you leave – unless you choose to keep it.</p>
            <p style="margin:0;">Stay sharp. StratSignal has your six.</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body></html>`;
};
// ============ PHASE 2: LOGIN ============
const renderLogin = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>${commonStyle}</style></head>
<body style="background-color:#060505; background-image:url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/BG1_NEW_Compressed.png'); background-size:cover; background-position:center; background-repeat:no-repeat; background-attachment:fixed; margin:0; height:100vh;">
  <div style="display:table; width:100%; height:100%;">
    <div style="display:table-cell; vertical-align:middle; text-align:center;">
      <form method="POST" action="/login"
            style="background:#11151c; padding:20px; border:0px solid #2d3748; 
                   width:85%; max-width:320px; display:inline-block; text-align:left;
                   box-sizing:border-box;">
        <input type="text" name="username" placeholder="Callsign" required
       style="width:100%; margin-bottom:10px; padding:12px; background:#0a0c10; 
              border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px; 
              font-family: 'Lato', sans-serif;">
        <input type="password" name="passcode" placeholder="Channel" required
       style="width:100%; margin-bottom:10px; padding:12px; background:#0a0c10; 
              border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px; 
              font-family: 'Lato', sans-serif;">
        <input type="text" name="target" placeholder="Target Alias (Optional)"
       style="width:100%; margin-bottom:15px; padding:12px; background:#0a0c10; 
              border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px; 
              font-family: 'Lato', sans-serif;">
        <button type="submit" class="btn-tactical" style="width:100%;">INITIALIZE</button>
      </form>
    </div>
  </div>
</body></html>`;
// ============ PHASE 2: BRIEF ============
const renderBriefForm = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
    ${commonStyle}
    html, body { height: 100%; margin: 0; }
    textarea { font-family: monospace; font-size: 16px; }
</style></head>
<body style="background-color:#060505; background-image:url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/LOGO1_MissionBrief.jpg'); background-size:cover; background-position:center; background-repeat:no-repeat; margin:0; height:100%;">

  <div style="display:table; width:100%; height:100%;">
    <div style="display:table-cell; vertical-align:middle; text-align:center;">

      <form method="POST" action="/brief"
            style="background:#11151c; padding:20px; border:0px solid #2d3748; 
                   width:85%; max-width:400px; display:inline-block; text-align:left;
                   box-sizing:border-box;">
        <div style="color:#5c748c; font-size:0.7em; margin-bottom:5px;">MISSION NAME</div>
        <input type="text" name="missionName" required placeholder="OP NIGHTFALL"
               style="width:100%; margin-bottom:15px; padding:12px; background:#0a0c10; 
                      border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px;">

        <div style="color:#5c748c; font-size:0.7em; margin-bottom:5px;">
          CHECKPOINTS – one per line<br>
          Format: <b>NAME DIRECTION DISTANCE</b><br>
          (Direction: N, NE, E, SE, S, SW, W, NW)<br>
          Scale: 1 cell = ${SCALE}m
        </div>
        <textarea name="checkpoints" rows="6" required
                  placeholder="LZ Alpha NE 300&#10;Ridge Overwatch E 500&#10;Extract Point SE 200"
                  style="width:100%; margin-bottom:15px; padding:12px; background:#0a0c10; 
                         border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px; resize:none;"></textarea>

        <button type="submit" class="btn-tactical" style="width:100%; background:#B85C00;">COMPILE BRIEF</button>
      </form>

    </div>
  </div>
</body></html>`;
// ============ PHASE 3: IN-BRIEF ROUTE PATH ============
const renderBrief = (id) => {
  const brief = briefs[id];
  if (!brief) {
    return `<!DOCTYPE html><html><head>${metaViewport}<style>${commonStyle}</style></head>
<body style="background:#0a0c10; color:#a1b0c0;"><div style="padding:20px;">ERR: BRIEF NOT FOUND</div></body></html>`;
  }

  const points = brief.points;
  if (!points || points.length === 0) {
    return `<!DOCTYPE html><html><head>${metaViewport}<style>${commonStyle}</style></head>
<body style="background:#0a0c10; color:#a1b0c0;"><div style="padding:20px;">ERR: NO CHECKPOINTS</div></body></html>`;
  }

  // Pixels per grid cell (100m)
  const CELL = 20;
  const PADDING = 40;

  // Calculate pixel coordinates
  const coords = points.map(p => ({ ...p, px: p.x * CELL, py: p.y * CELL }));

  // Determine bounding box for viewBox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  coords.forEach(({ px, py }) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  });

  // Expand for labels and compass/scale
  minX -= PADDING;
  minY -= PADDING;
  maxX += PADDING;
  maxY += PADDING;
  const vbWidth = maxX - minX;
  const vbHeight = maxY - minY;

  // Build SVG elements
  let svgLines = '';
  let svgMarkers = '';
  let svgCheckpoints = '';
  let svgLabels = '';

  // Arrowhead marker definition
  svgMarkers = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 Z" fill="#B85C00"/>
    </marker>
  </defs>`;

  // Draw route segments
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i+1];
    svgLines += `<line x1="${a.px}" y1="${a.py}" x2="${b.px}" y2="${b.py}" stroke="#B85C00" stroke-width="2" marker-end="url(#arrow)"/>`;
  }

  // Draw checkpoint circles and labels
  coords.forEach((p, i) => {
    const color = (p.name === 'HQ') ? '#39ff14' : '#B85C00';
    svgCheckpoints += `<circle cx="${p.px}" cy="${p.py}" r="4" fill="${color}" stroke="#1f2937" stroke-width="1"/>`;
    
    // Label text offset to the right (10px)
    const label = p.name === 'HQ' ? 'HQ' : p.name.substring(0, 8);
    const lx = p.px + 8;
    const ly = p.py + 4; // baseline offset
    svgLabels += `<text x="${lx}" y="${ly}" fill="#a1b0c0" font-family="monospace" font-size="10">[${label}]</text>`;
  });

  // Compass Rose – placed at top-right of viewBox
  const compassX = maxX - 30;
  const compassY = minY + 30;
  svgMarkers += `
    <g transform="translate(${compassX},${compassY})">
      <polygon points="0,-12 6,8 -6,8" fill="none" stroke="#39ff14" stroke-width="1"/>
      <text x="0" y="15" fill="#39ff14" font-family="Michroma" font-size="8" text-anchor="middle">N</text>
    </g>`;

  // Scale Bar – placed at bottom-left of viewBox
  const scaleX = minX + 20;
  const scaleY = maxY - 15;
  const barLength = CELL * 3; // 3 cells = 300m
  svgMarkers += `
    <g transform="translate(${scaleX},${scaleY})">
      <line x1="0" y1="0" x2="${barLength}" y2="0" stroke="#5c748c" stroke-width="2"/>
      <line x1="0" y1="-4" x2="0" y2="4" stroke="#5c748c"/>
      <line x1="${barLength}" y1="-4" x2="${barLength}" y2="4" stroke="#5c748c"/>
      <line x1="${barLength/2}" y1="-2" x2="${barLength/2}" y2="2" stroke="#5c748c"/>
      <text x="${barLength/2}" y="12" fill="#5c748c" font-family="monospace" font-size="8" text-anchor="middle">300m</text>
    </g>`;

  // Build the full SVG
  const svg = `<svg viewBox="${minX} ${minY} ${vbWidth} ${vbHeight}" width="100%" style="display:block; background:transparent;">
    ${svgMarkers}
    ${svgLines}
    ${svgCheckpoints}
    ${svgLabels}
  </svg>`;

  // Status and controls (unchanged)
  const statusColor = brief.status === 'ACTIVE' ? '#39ff14' : (brief.status === 'COMPLETE' ? '#5c748c' : '#B85C00');
  let statusControls = '';
  if (brief.status === 'PLANNED') {
    statusControls = ` | <a href="/brief/status/${id}/ACTIVE" style="color:#39ff14; text-decoration:none; font-size:0.7em;">[ ACTIVE ]</a>`;
  } else if (brief.status === 'ACTIVE') {
    statusControls = ` | <a href="/brief/status/${id}/COMPLETE" style="color:#5c748c; text-decoration:none; font-size:0.7em;">[ COMPLETE ]</a>`;
  }

  return `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
    ${commonStyle}
    html, body { height: 100%; margin: 0; }
</style></head>
<body style="background:#0a0c10; padding-bottom:80px; margin:0;">

  <!-- Header -->
  <div style="background:#11151c; border-bottom:1px solid #1f2937; padding:15px; margin:0;">
    <div style="font-size:1em; color:#fff; font-weight:bold;">${escapeHtml(brief.missionName)}</div>
    <div style="font-size:0.7em; color:${statusColor}; margin-top:4px;">STATUS: ${brief.status}</div>
  </div>

  <!-- SVG Mission Map (hardened container) -->
  <div style="overflow-x:auto; width:100%; margin:15px 0; padding:0;">
    <div style="display:inline-block; background:#0a0c10; border:1px solid #2d3748; border-radius:2px; padding:10px; position:relative; min-width:100px;">
      ${svg}
    </div>
  </div>

  <!-- Bottom controls -->
  <div style="position:fixed; bottom:0; left:0; right:0; background:#11151c; border-top:1px solid #2d3748; 
              padding:10px; text-align:center; z-index:100; box-sizing:border-box; font-size:0.7em;">
    <a href="/brief" style="color:#5c748c; text-decoration:none;">[ NEW BRIEF ]</a>${statusControls}
    <span style="color:#2d3748; margin:0 5px;">|</span>
    <a href="/brief/kill/${id}" style="color:#ff4c4c; text-decoration:none; font-weight:bold;">[ KILL ]</a>
  </div>
</body></html>`;
};
// ============ PHASE 3: IN-CHANNEL (CHAT WITH TIMESTAMPS) ============
const renderChat = (user, room) => {
  if (!db[room]) db[room] = [];
  if (!activeUsers[room]) activeUsers[room] = {};

  activeUsers[room][user] = Date.now();
  const now = Date.now();
  let activeCount = 0;

  for (const [op, time] of Object.entries(activeUsers[room])) {
    if (now - time < HEARTBEAT_MS) activeCount++;
    else delete activeUsers[room][op];
  }

  const isSecure = activeCount >= 2;
  const connectionStatusText = `${activeCount} OPERATORS CONNECTED`;

  const chatHtml = db[room].map(m => {
    let timeStr = '';
    if (m.timestamp) {
      const d = new Date(m.timestamp);
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      timeStr = `${hours}:${mins}`;
    }

    return `
    <div style="text-align:${m.sender === user ? 'right' : 'left'}; margin-bottom:10px;">
      <div style="display:inline-block; background:${m.sender === user ? '#1c2b36' : '#161b22'}; 
                  padding:12px; border-radius:2px; 
                  border:1px solid ${m.sender === user ? '#2c4251' : '#2d3748'}; 
                  text-align:left; max-width:85%; word-wrap:break-word;">
              <b style="font-size:0.7em; color:#5c748c;">${m.sender}:</b> <span style="color:#a1b0c0; line-height:1.4;">${m.text}</span>
        ${timeStr ? `<div style="font-size:0.6em; color:#4a5b6b; margin-top:4px; text-align:right;">${timeStr}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  const utcTimeStr = new Date().toISOString().slice(11, 19); // HH:MM:SS for Last Ping

  const encodedExport = Buffer.from(
    db[room].map(m => `[${m.sender}]: ${m.text}`).join('\n')
  ).toString('base64');

  return `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
    ${commonStyle}
    html, body { height: 100%; margin: 0; }
    input { font-size: 16px; }
</style></head>
<body style="padding-bottom:180px; padding-top:60px; background-color:#060505; background-image:url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/LOGO1_MissionBrief.jpg'); background-size:cover; background-position:center; background-repeat:no-repeat; background-attachment:fixed; margin:0;"> 
<div style="position:fixed; top:0; left:0; right:0; background:#11151c; border-bottom:1px solid #1f2937; 
              padding:15px; z-index:100; box-sizing:border-box;">
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
      <tr>
        <td style="text-align:left; font-size:0.8em; color:#5c748c;">CH: ${room}</td>
        <td style="text-align:center; font-size:0.7em; color:#5c748c;">LAST PING: ${utcTimeStr}</td>
        <td style="text-align:right; font-size:0.7em; color:${isSecure ? '#39ff14' : '#5c748c'}; font-weight:bold; letter-spacing:1px;">${connectionStatusText} <span id="conn-dot" style="color:inherit;">●</span></td>
      </tr>
    </table>
  </div>

  <div style="padding:15px;">
    ${chatHtml}
    <!-- Spacer to clear the fixed bottom dock -->
    <div style="height: 120px;"></div>
  </div>

  <div style="position:fixed; bottom:0; left:0; right:0; background:#11151c; border-top:1px solid #2d3748; 
              padding:10px; text-align:center; z-index:100; box-sizing:border-box;">
    <form method="POST" action="/send" style="margin-bottom:10px; display:block; text-align:center;">
      <input type="hidden" name="user" value="${user}">
      <input type="hidden" name="room" value="${room}">
      <input type="text" name="message" required placeholder="Enter Transmition" 
             style="width:70%; padding:12px; background:#0a0c10; border:1px solid #2d3748; color:#fff; font-family: lato; margin-right:5px; box-sizing:border-box; font-size:16px;">
      <button type="submit" style="padding:12px 20px; font-weight:bold; background:#1c2b36; color:#fff; border:1px solid #2d3748;">&gt;</button>
    </form>
    <div style="font-size:0.7em; line-height:1.8;">
      <a href="data:text/plain;base64,${encodedExport}" download="chat.txt" 
         style="color:#5c748c; text-decoration:none; background:rgba(92,116,140,0.15); padding:2px 6px; border-radius:3px;">[ CONVO DOWNLOAD ]</a>
      <span style="color:#2d3748; margin:0 3px;">|</span>
      <a href="/chat?user=${encodeURIComponent(user)}&room=${encodeURIComponent(room)}" 
         style="color:#5c748c; text-decoration:none; background:rgba(92,116,140,0.15); padding:2px 6px; border-radius:3px;">[ PING ]</a>
      <span style="color:#2d3748; margin:0 3px;">|</span>
      <a href="/purge?room=${encodeURIComponent(room)}" 
         style="color:#ff4c4c; text-decoration:none; font-weight:bold; background:rgba(255,76,76,0.15); padding:2px 6px; border-radius:3px;">[ KILL ]</a>
      <span style="color:#2d3748; margin:0 3px;">|</span>
      <a href="/boot" 
         style="color:#83EC2D; text-decoration:none; background:rgba(131,236,45,0.15); padding:2px 6px; border-radius:3px;">[ SWAP ]</a>
    </div>
  </div>
<!-- Blinking green dot -->
<script>
(function() {
  var dot = document.getElementById('conn-dot');
  if (!dot) return;
  var visible = true;
  setInterval(function() {
    visible = !visible;
    dot.style.opacity = visible ? '1' : '0.15';
  }, 500);
})();
</script>

<!-- Auto-ping after 1 min idle -->
<script>
(function() {
  var input = document.querySelector('input[name="message"]');
  var timer;
  function reset() {
    clearTimeout(timer);
    timer = setTimeout(function() {
      location.reload();
    }, 60000);
  }
  if (input) {
    input.addEventListener('keydown', reset);
    reset(); // start the countdown
  }
})();
</script>
</body></html>`;
};

// ============ ROUTES ============
app.get('/', (req, res) => {
  let totalOps = 0;
  const now = Date.now();
  for (const room of Object.keys(activeUsers)) {
    let roomActive = 0;
    for (const [op, time] of Object.entries(activeUsers[room])) {
      if (now - time < HEARTBEAT_MS) roomActive++;
      else delete activeUsers[room][op];
    }
    if (roomActive > 0) totalOps += roomActive;
  }
  const activeChannels = Object.keys(db).length;
  let totalMessages = 0;
  for (const room of Object.keys(db)) {
    totalMessages += db[room].length;
  }
  const uptimeMs = now - SERVER_START;
  const days = Math.floor(uptimeMs / 86400000);
  const hours = Math.floor((uptimeMs % 86400000) / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);
  const uptimeStr = `${days}D ${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}M`;

  res.send(renderLanding({ totalOps, activeChannels, totalMessages, uptimeStr }));
});

app.get('/boot', (req, res) => res.send(renderLogin()));

app.post('/login', (req, res) => {
  const { username, passcode, target } = req.body;
  if (target) roomConstraints[passcode] = { target, creator: username };
  res.redirect(`/chat?user=${encodeURIComponent(username)}&room=${encodeURIComponent(passcode)}`);
});

app.get('/chat', (req, res) => {
  const { user, room } = req.query;
  const constraints = roomConstraints[room];
  if (constraints && user !== constraints.target && user !== constraints.creator) {
    return res.send("<body style='background:#0a0c10; color:#fff;'><div style='padding:20px;'>ERR: UNAUTHORIZED VECTOR</div></body>");
  }
  res.send(renderChat(user, room));
});

app.post('/send', (req, res) => {
  const { user, room, message } = req.body;
  if (!db[room]) db[room] = [];
  db[room].push({ sender: user, text: message, timestamp: Date.now() });
  res.redirect(`/chat?user=${encodeURIComponent(user)}&room=${encodeURIComponent(room)}`);
});

app.get('/purge', (req, res) => {
  const { room } = req.query;
  delete db[room];
  delete roomConstraints[room];
  res.redirect('/');
});

// --- Mission Brief Routes ---

// Show brief creation form
app.get('/brief', (req, res) => {
  res.send(renderBriefForm());
});

// Handle form submission – create a new brief
app.post('/brief', (req, res) => {
  const { missionName, checkpoints } = req.body;
  if (!missionName || !checkpoints) return res.redirect('/brief');

  const lines = checkpoints.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return res.redirect('/brief');

  const points = [{ name: 'HQ', x: 0, y: 0 }];
  let prevX = 0, prevY = 0;

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 3) continue; // skip invalid lines
    const name = parts[0];
    const dir = parts[1].toUpperCase();
    const dist = parseInt(parts[2], 10);

    if (!dirVectors[dir] || isNaN(dist) || dist <= 0) continue;

    const steps = Math.round(dist / SCALE);
    if (steps < 1) continue;

    const vec = dirVectors[dir];
    const newX = prevX + vec.dx * steps;
    const newY = prevY + vec.dy * steps;

    points.push({ name: i === lines.length - 1 ? name : name, x: newX, y: newY });
    prevX = newX;
    prevY = newY;
  }

  if (points.length <= 1) return res.redirect('/brief'); // at least one checkpoint needed

  const id = ++briefCounter;
  briefs[id] = {
    missionName: missionName.trim(),
    points: points,          // array of { name, x, y }
    status: 'PLANNED',
    created: Date.now()
  };

  res.redirect(`/brief/${id}`);
});

// View a specific brief
app.get('/brief/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  res.send(renderBrief(id));
});

// Update brief status
app.get('/brief/status/:id/:status', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const newStatus = req.params.status;
  if (!briefs[id]) return res.redirect('/');

  // Only allow valid transitions
  if (briefs[id].status === 'PLANNED' && newStatus === 'ACTIVE') {
    briefs[id].status = 'ACTIVE';
  } else if (briefs[id].status === 'ACTIVE' && newStatus === 'COMPLETE') {
    briefs[id].status = 'COMPLETE';
  }
  res.redirect(`/brief/${id}`);
});

// Kill (delete) a brief
app.get('/brief/kill/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  delete briefs[id];
  res.redirect('/');
});

app.listen(port, () => console.log('StratSignal Active.'));
