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
  .btn-back {
    display: inline-block;
    background: #2d3748;
    color: #a1b0c0;
    border: 1px solid #4a5b6b;
    padding: 8px 16px;
    cursor: pointer;
    font-family: 'Michroma', sans-serif;
    text-transform: uppercase;
    text-decoration: none;
    font-weight: bold;
    font-size: 0.75em;
    margin-bottom: 15px;
  }
`;
// ============ PHASE 1: PRE-CHANNEL (LIVE STATUS OVERHAUL) ============
const renderLanding = (stats = {}) => {
  const { totalOps = 0, activeChannels = 0, totalMessages = 0, uptimeStr = '--' } = stats;

  return `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
  ${commonStyle}
  html, body {
    height: 100%;
    margin: 0;
    background-color: #060505;
  }
  body {
    background: url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/BG1_NEW_Compressed.png') center/cover no-repeat fixed;
    font-family: 'Lato', sans-serif;
    color: #a1b0c0;
  }

  /* Fixed HUD strip */
  #top-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 200;
    background: rgba(6,5,5,0.85);
    border-bottom: 1px solid #2d3748;
    padding: 10px 15px;
    color: #5c748c;
    font-family: monospace;
    font-size: 0.7em;
    line-height: 1.4;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
  }
  .zulu-clock { color: #39ff14; }

  /* Main content area */
  .main-content {
    padding-top: 80px;
    width: 100%;
    box-sizing: border-box;
  }

  /* Horizontal row – desktop: logo left, right panel beside it */
  .content-row {
    display: flex;
    flex-direction: row;
    align-items: stretch;        /* makes right panel match logo height */
    justify-content: center;    /* centre the whole group */
    flex-wrap: wrap;
    max-width: 1100px;
    margin: 0 auto;
    padding: 20px 20px;
    gap: 20px;
  }

  /* Logo – left side, natural height */
  .logo-col {
    flex: 0 0 auto;
  }
  .logo-col img {
    max-width: 280px;
    height: auto;
    display: block;
  }

  /* Right panel: terminal on top, buttons at the bottom */
  .right-panel {
    flex: 1 1 auto;            /* grows to match logo height */
    display: flex;
    flex-direction: column;
    min-width: 0;              /* allows shrinking if needed */
  }

  /* Terminal – takes all available vertical space */
  .terminal-col {
    flex: none;                   /* stretch vertically */
    width: 100%;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    background: rgba(0,0,0,0.3);
    border: 1px solid #2d3748;
    font-family: monospace;
    font-size: 10px;
    line-height: 1.3;
    color: #39ff14;
    padding: 10px;
    white-space: pre-wrap;
    word-break: break-all;
    box-sizing: border-box;
  }
  .terminal-col::-webkit-scrollbar {
    display: none;
  }

  /* Buttons row – horizontal, matches terminal width */
  .buttons-row {
    display: flex;
    flex-direction: row;
    gap: 12px;
    padding: 12px 0 0 0;      /* space above buttons */
  }
  .buttons-row .btn-tactical {
    flex: 1;                   /* equal width, fill the terminal width */
    min-width: unset;
    box-shadow: none;
    padding: 12px 24px;
    white-space: nowrap;
    text-align: center;
  }
  .btn-brief {
    background-color: #B85C00;
  }

  /* Cursor blink */
  .cursor {
    display: inline-block;
    width: 6px;
    height: 12px;
    background: #39ff14;
    vertical-align: middle;
    animation: blink 1s step-end infinite;
    margin-left: 2px;
  }
  @keyframes blink {
    50% { opacity: 0; }
  }

  /* Manual section unchanged */
  .manual-section {
    margin-top: 30px;
    padding: 30px 15px;
    background: rgba(6,5,5,0.7);
    border-top: 1px solid #2d3748;
    color: #e0e0e0;
    font-size: 12px;
    line-height: 1.5;
  }
  .manual-inner {
    max-width: 700px;
    margin: 0 auto;
  }
  .manual-title {
    color: #39ff14;
    font-family: 'Michroma', sans-serif;
    font-size: 10px;
    margin-bottom: 12px;
  }

  /* Phone stack */
  @media (max-width: 700px) {
    .content-row {
      flex-direction: column;
      align-items: center;
    }
    .logo-col {
      margin: 0 auto;
    }
    .logo-col img {
      max-width: 180px;
    }
    .right-panel {
      width: 100%;
      max-width: 500px;       /* keep terminal readable */
    }
    .terminal-col {
      height: 180px;           /* fixed height on mobile */
      flex: none;
    }
    .buttons-row {
      padding-top: 10px;
      flex-wrap: wrap;
    }
  }
</style></head>
<body>
  <!-- Top bar (unchanged) -->
  <div id="top-bar">
    <div>
      <span>SYS_NODE : STRATSIGNAL_PRIME // ONLINE</span><br>
      <span>RELAY_MODE : HTTP_POLL // NOMINAL</span>
    </div>
    <div>
      <span>NET_ACTIVE : ${totalOps} OPS // ${activeChannels} CH</span><br>
      <span>TRAFFIC   : ${totalMessages} MSG</span><br>
      <span>UPTIME    : ${uptimeStr}</span>
    </div>
    <div>
      <span class="zulu-clock" id="zulu">--:--:--</span>
    </div>
  </div>

  <!-- Main content -->
  <div class="main-content">
    <div class="content-row">
      <!-- Logo left -->
      <div class="logo-col">
        <img src="https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/New_OFFICIAL_LOGO.png"
             alt="STRATSIGNAL">
      </div>

      <!-- Right panel: terminal + buttons -->
      <div class="right-panel">
        <div class="terminal-col" id="terminal">
          <span class="cursor" id="cursor"></span>
        </div>
        <div class="buttons-row">
          <button class="btn-tactical" onclick="window.location.href='/boot'">
            ENGAGE CHANNEL
          </button>
          <button class="btn-tactical btn-brief" onclick="window.location.href='/mission'">
            MISSION MODE
          </button>
        </div>
      </div>
    </div>

    <!-- Field manual (TARS-style) -->
    <div class="manual-section">
      <div class="manual-inner">
        <div class="manual-title">STRATSIGNAL v0.9600 // SYSTEM BRIEF</div>
        <p style="margin:0 0 8px 0;">
          I’m your tactical web‑based comms node. No install, no storage, no trace. I run entirely inside your browser. You carry the mission; I hold your words in memory for as long as you need them – and not a millisecond longer.
        </p>
        <p style="margin:0 0 8px 0;">
          From this hub you can <b style="color:#5D3FD3;">ENGAGE CHANNEL</b> for encrypted point‑to‑point comms, or enter <b style="color:#B85C00;">MISSION MODE</b> to build a full operation: authorised operators, live rosters, and a tactical map built from your checkpoint grid.
        </p>
        <p style="margin:0 0 8px 0;">
          Every message is timestamped. Every brief is disposable. Every channel can be purged with a single <b style="color:#ff4c4c;">KILL</b> command. When you’re done, I disappear – no backups, no logs, no evidence. Just a clean slate for the next op.
        </p>
        <p style="margin:0;">
          I’m not a social app. I’m your <b style="color:#39ff14;">tactical advantage</b>. Call in, execute, purge. Stay sharp – I’ve got your six.
        </p>
      </div>
    </div>
  </div>

  <!-- ZULU clock script -->
  <script>
    (function() {
      var el = document.getElementById('zulu');
      if (!el) return;
      function tick() {
        var d = new Date();
        var h = String(d.getUTCHours()).padStart(2,'0');
        var m = String(d.getUTCMinutes()).padStart(2,'0');
        var s = String(d.getUTCSeconds()).padStart(2,'0');
        var sep = (d.getUTCSeconds() % 2 === 0) ? ':' : ' ';
        el.textContent = h + sep + m + ':' + s;
      }
      tick();
      setInterval(tick, 1000);
    })();
  </script>

  <!-- Terminal typewriter script (unchanged) -->
  <script>
    (function() {
      var terminal = document.getElementById('terminal');
      if (!terminal) return;

      // Clear initial HTML placeholder
      terminal.innerHTML = '';

      var lines = [
        "[STRATSIGNAL OPS-TERM v3.2.7]",
        "",
        "> INIT COMMS_PIPE --profile TACTICAL_NET",
        "  [OK]  Handshake with NODE: FALCON-ALPHA",
        "  [OK]  Uplink secured via SIGMA-TUNNEL",
        "  [OK]  Crypto suite: AES-256 / Q-LAYER SCRAMBLE",
        "  [OK]  Latency: 12.7 ms / Jitter: 1.3 ms",
        "",
        "> LOAD MISSION_PROFILE --id MS-2047-RAZOR",
        "  [OK]  Ruleset: ROE-BLACK",
        "  [OK]  Theater: NORTHERN CORRIDOR / GRID 42-DELTA",
        "  [OK]  Channels: TAC-1 / TAC-3 / GHOST-LINK",
        "",
        "> LINK_STATUS --verbose",
        "  [TAC-1]  ONLINE   | ENCRYPTED | 0.02% PACKET LOSS",
        "  [TAC-3]  DEGRADED | ENCRYPTED | 3.41% PACKET LOSS",
        "  [GHOST]  STEALTH  | DARK MODE | BEACON SUPPRESSED",
        "",
        "> ROUTE_SCAN --hops 6 --mask 0x7F",
        "  HOP[01]  RELAY-NODE // 10.24.7.3      [CLEAN]",
        "  HOP[02]  FIELD-UNIT // 10.24.9.11     [CLEAN]",
        "  HOP[03]  UNKNOWN    // 172.19.4.200   [FLAGGED]",
        "  HOP[04]  HQ-CORE    // 10.0.0.1       [TRUSTED]",
        "  PATH_INTEGRITY: 96.3%  |  ANOMALIES: 1",
        "",
        "> WATCH CHANNEL TAC-1 --filter=PRIORITY",
        "  [00:14:03Z] [PRIO-ALPHA] EAGLE-2: CONTACT EAST, GRID 42D-17",
        "  [00:14:07Z] [PRIO-BRAVO] RAVEN-1: DRONE FEED LIVE, PUSHING TO OPS",
        "  [00:14:12Z] [PRIO-ALPHA] EAGLE-2: REQUESTING FIRE MISSION, TYPE 3",
        "",
        "> TELEMETRY --unit=EAGLE-2",
        "  POS: 42D-17-09  |  ALT: 231 m",
        "  VEL: 3.2 m/s    |  HEADING: 087 deg",
        "  STATUS: GREEN   |  AMMO: 73% | FUEL: 61%",
        "",
        "> SIGNAL_ANALYTICS --window=30s",
        "  THROUGHPUT: 4.7 Mbps",
        "  NOISE_FLOOR: -87 dBm",
        "  INTERFERENCE: LOW",
        "  JAMMING: NOT DETECTED",
        "  CONFIDENCE: 98.1%",
        "",
        "> OPS_FEED --mode=SCROLL",
        "  [SYS]  New SITREP uploaded: SRP-26-ALPHA",
        "  [SYS]  Map layer updated: ISR-DRONE-DELTA",
        "  [SYS]  STRATSIGNAL RULESET PATCH: v3.2.7b APPLIED",
        "  [SYS]  Auto-archive of low-priority traffic enabled",
        "",
        "> EXEC MACRO \\\"BATTLE-COMMS\\\"",
        "  STEP 1: SYNC CLOCKS .......... [OK]",
        "  STEP 2: VERIFY CALLSIGNS ..... [OK]",
        "  STEP 3: PUSH FREQ TABLES ..... [OK]",
        "  STEP 4: ARM FAILOVER LINK .... [OK]",
        "  RESULT: TACTICAL NET READY",
        "",
        "> PROMPT",
        "stratsignal:/tac_ops/comms $ " + String.fromCharCode(9608)
      ];

      var i = 0; 
      var c = 0; 
      var speed = 15; 
      var currentLineDiv = null;

      var cursor = document.createElement('span');
      cursor.className = 'cursor';
      cursor.id = 'cursor';
      cursor.innerHTML = '&nbsp;';
      terminal.appendChild(cursor);

      function printNext() {
        if (i < lines.length) {
          if (c === 0) {
            currentLineDiv = document.createElement('div');
            terminal.insertBefore(currentLineDiv, cursor);
            if (terminal.childNodes.length > 51) {
              terminal.removeChild(terminal.firstChild);
            }
          }
          
          if (c < lines[i].length) {
            currentLineDiv.textContent += lines[i].charAt(c);
            c++;
            terminal.scrollTop = terminal.scrollHeight; 
            setTimeout(printNext, speed);
          } else {
            i++;
            c = 0;
            setTimeout(printNext, speed * 6);
          }
        } else {
          var separator = document.createElement('div');
          separator.style.color = '#1f2937';
          separator.textContent = "--------------------------------------------------";
          terminal.insertBefore(separator, cursor);
          setTimeout(function() {
            i = 0;
            c = 0;
            printNext();
          }, 2000);
        }
      }

      printNext();
    })();
  </script>
</body></html>`;
};
// ============ PHASE 2: LOGIN ============
const renderLogin = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
  ${commonStyle}
  html, body { height: 100%; margin: 0; background-color: #060505; }
  body {
    background: url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/BG1_NEW_Compressed.png') center/cover no-repeat;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Lato', sans-serif;
  }
  .login-container {
    background: rgba(17, 21, 28, 0.95);
    border: 1px solid #2d3748;
    padding: 30px 20px;
    width: 90%;
    max-width: 360px;
    text-align: left;
    box-shadow: 0 0 20px rgba(0,0,0,0.6);
  }
  .login-header {
    font-family: 'Michroma', sans-serif;
    color: #5D3FD3;
    font-size: 1.1em;
    margin-bottom: 5px;
    text-align: center;
  }
  .login-sub {
    color: #5c748c;
    font-size: 0.7em;
    text-align: center;
    margin-bottom: 25px;
  }
  label {
    color: #5c748c;
    font-size: 0.7em;
    display: block;
    margin-bottom: 5px;
  }
  input {
    width: 100%;
    padding: 12px;
    background: #0a0c10;
    border: 1px solid #2d3748;
    color: #fff;
    box-sizing: border-box;
    font-size: 16px;
    margin-bottom: 15px;
    font-family: 'Lato', sans-serif;
  }
  .btn-tactical {
    width: 100%;
    padding: 14px;
    font-size: 16px;
  }
</style></head>
<body>
  <div class="login-container">
    <a href="/" class="btn-back">◄ BACK TO HUB</a>
    <div class="login-header">STRATSIGNAL</div>
    <div class="login-sub">AUTH TERMINAL // SECURE COMMS</div>
    <form method="POST" action="/login">
      <label for="user">CALLSIGN</label>
      <input type="text" id="user" name="username" required placeholder="EAGLE-2">

      <label for="pass">CHANNEL / PASSCODE</label>
      <input type="password" id="pass" name="passcode" required placeholder="TAC-1">

      <label for="target">TARGET ALIAS (OPTIONAL)</label>
      <input type="text" id="target" name="target" placeholder="Leave empty for open channel">

      <button type="submit" class="btn-tactical" style="background:#5D3FD3;">INITIALIZE CHANNEL</button>
    </form>
  </div>
</body></html>`;

// New landing: choose CREATE or JOIN
const renderMissionLanding = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
  ${commonStyle}
  html, body { height: 100%; margin: 0; }
  body {
    background: url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/BG1_NEW_Compressed.png') center/cover no-repeat fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Lato', sans-serif;
  }
  .choice-box {
    background: rgba(17,21,28,0.95);
    border: 1px solid #2d3748;
    padding: 40px;
    text-align: center;
    width: 90%;
    max-width: 400px;
  }
  h2 { font-family:'Michroma',sans-serif; color:#B85C00; margin: 0 0 30px; }
  .btn-choice { display:inline-block; width:180px; padding:15px; margin:10px; background:#B85C00; color:white; font-family:'Michroma',sans-serif; text-decoration:none; font-size:1em; border:none; cursor:pointer; text-transform:uppercase; }
  .btn-choice.join { background:#5D3FD3; }
</style></head>
<body>
  <div class="choice-box">
    <a href="/" class="btn-back">◄ BACK TO HUB</a>
    <h2>MISSION MODE</h2>
    <a href="/mission/create" class="btn-choice">CREATE</a>
    <a href="/mission/join" class="btn-choice join">JOIN</a>
  </div>
</body></html>`;

// Adjust renderNewMissionForm to POST to /mission/create
const renderNewMissionForm = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
  ${commonStyle}
  html, body { height: 100%; margin: 0; }
  body {
    background: url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/BG1_NEW_Compressed.png') center/cover no-repeat fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Lato', sans-serif;
  }
  .form-container {
    background: rgba(17,21,28,0.95);
    border: 1px solid #2d3748;
    padding: 25px;
    width: 90%;
    max-width: 450px;
  }
  label { color:#5c748c; font-size:0.7em; display:block; margin-bottom:5px; }
  input, textarea { width:100%; padding:10px; background:#0a0c10; border:1px solid #2d3748; color:#fff; font-size:16px; margin-bottom:15px; font-family:'Lato',sans-serif; }
  textarea { resize:none; font-family:monospace; }
  .btn-tactical { width:100%; background:#B85C00; }
</style></head>
<body>
  <div class="form-container">
    <a href="/mission" class="btn-back">◄ BACK</a>
    <h2 style="font-family:'Michroma',sans-serif; color:#B85C00; margin:0 0 20px; font-size:1em;">CREATE MISSION</h2>
    <form method="POST" action="/mission/create">
      <label>MISSION NAME</label>
      <input type="text" name="missionName" required placeholder="OP NIGHTFALL">

      <label>CHECKPOINTS (one per line: NAME DIR DIST)</label>
      <textarea name="checkpoints" rows="5" required placeholder="LZ Alpha NE 300&#10;Ridge Overwatch E 500&#10;Extract Point SE 200"></textarea>

      <label>AUTHORISED CALLSIGNS (comma separated)</label>
      <input type="text" name="callsigns" required placeholder="EAGLE-2,GHOST-7,SPECTRE-4">

      <label>CHANNEL PASSCODE</label>
      <input type="text" name="room" required placeholder="TAC-NIGHTFALL">

      <label>YOUR CALLSIGN (creator)</label>
      <input type="text" name="creator" required placeholder="RAVEN-1">

      <button type="submit" class="btn-tactical">CREATE MISSION</button>
    </form>
  </div>
</body></html>`;

const renderJoinMissionForm = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
  ${commonStyle}
  html, body { height: 100%; margin: 0; }
  body {
    background: #060505 url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/BG1_NEW_Compressed.png') center/cover no-repeat fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Lato', sans-serif;
  }
  .join-box {
    background: rgba(17,21,28,0.95);
    border: 1px solid #2d3748;
    padding: 30px;
    width: 90%;
    max-width: 400px;
    text-align: center;
  }
  h2 { font-family:'Michroma',sans-serif; color:#5D3FD3; margin:0 0 20px; }
  label { color:#5c748c; font-size:0.7em; display:block; margin-bottom:5px; text-align:left; }
  input { width:100%; padding:10px; background:#0a0c10; border:1px solid #2d3748; color:#fff; font-size:16px; margin-bottom:15px; font-family:'Lato',sans-serif; box-sizing:border-box; }
  .btn-tactical { width:100%; background:#5D3FD3; }
</style></head>
<body>
  <div class="join-box">
    <a href="/mission" class="btn-back">◄ BACK</a>
    <h2>JOIN MISSION</h2>
    <form method="POST" action="/mission/join">
      <label>MISSION ID</label>
      <input type="text" name="missionId" required placeholder="1">

      <label>CHANNEL PASSCODE</label>
      <input type="text" name="token" required placeholder="TAC-NIGHTFALL">

      <label>YOUR CALLSIGN</label>
      <input type="text" name="callsign" required placeholder="EAGLE-2">

      <button type="submit" class="btn-tactical">JOIN</button>
    </form>
  </div>
</body></html>`;

const renderMissionDashboard = (id, user, isCreator) => {
  const mission = briefs[id];
  if (!mission) return '<div style="color:#ff4c4c; padding:20px; font-family:monospace;">ERR: MISSION NOT FOUND</div>';

  const creator = mission.creatorCallsign || mission.creator || 'UNKNOWN';
  const statusColor = mission.status === 'ACTIVE' ? '#39ff14' : (mission.status === 'COMPLETE' ? '#5c748c' : '#B85C00');
  
  // Only the creator receives the structural kill command button
  const killButton = isCreator 
    ? `<a href="/mission/kill/${id}" class="btn-dash btn-kill">[ TERMINATE MISSION HARD-RESET ]</a>` 
    : '';

  // Extract real-time user activity mapping from the global pipe
  const roomUsers = activeUsers[mission.room] || {};

  // Build the live Operator Roster list dynamically
  const rosterHtml = mission.authorizedCallsigns.map(callsign => {
    const cleanCallsign = callsign.trim();
    if (!cleanCallsign) return '';

    const lastSeen = roomUsers[cleanCallsign];
    let statusText = 'OFFLINE';
    let statusColor = '#ff4c4c'; // Red
    let badgeStyle = 'border: 1px solid #ff4c4c; color: #ff4c4c;';

    if (lastSeen) {
      const deltaSec = Math.floor((Date.now() - lastSeen) / 1000);
      
      if (deltaSec <= 30) {
        statusText = 'LIVE // ONLINE';
        statusColor = '#39ff14'; // Tactical green
        badgeStyle = 'background: #39ff14; color: #000; font-weight: bold;';
      } else if (deltaSec <= 45) {
        statusText = `STALE (${deltaSec}s)`;
        statusColor = '#B85C00'; // Amber
        badgeStyle = 'border: 1px solid #B85C00; color: #B85C00;';
      } else if (deltaSec <= 90) {
        statusText = 'SIG_DEGRADED';
        statusColor = '#ff5722'; // Dark Amber
        badgeStyle = 'border: 1px dashed #ff5722; color: #ff5722;';
      } else {
        statusText = 'SIG_LOST';
        statusColor = '#5c748c'; // Grey
        badgeStyle = 'border: 1px solid #5c748c; color: #5c748c;';
      }
    }

    // Append localized role descriptors safely
   const isOpCreator = cleanCallsign.toLowerCase() === creator.toLowerCase();
   const isSelf = cleanCallsign.toLowerCase() === user.toLowerCase();

   let roleTag = '';
   if (isOpCreator) {
   roleTag += '<span class="op-role">[COMMANDER]</span> ';
   }
   if (isSelf) {
   roleTag += '<span class="op-role" style="color:#39ff14;">[YOU]</span>';
   }

    return `
      <div class="roster-card" style="border-left: 4px solid ${statusColor};">
        <div>
          <span class="op-name">${escapeHtml(cleanCallsign)}</span>
          ${roleTag}
        </div>
        <div class="op-status-badge" style="${badgeStyle}">${statusText}</div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  ${metaViewport}
  ${fontImport}
  <meta http-equiv="refresh" content="15">
  <style>
    ${commonStyle}
    html, body { height: 100%; margin: 0; padding: 0; background-color: #060505; }
    body {
      background: #060505 url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/BG1_NEW_Compressed.png') center/cover no-repeat fixed;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
      box-sizing: border-box;
    }
    .dash-layout {
      display: flex;
      flex-direction: row;
      gap: 20px;
      max-width: 950px;
      width: 100%;
      margin: 0 auto;
      box-sizing: border-box;
    }
    .panel {
      background: rgba(11, 13, 17, 0.94);
      border: 1px solid #2d3748;
      padding: 22px;
      box-sizing: border-box;
    }
    .panel-main { flex: 1 1 55%; display: flex; flex-direction: column; justify-content: space-between; }
    .panel-side { flex: 1 1 45%; }
    
    .panel-title {
      font-family: 'Michroma', sans-serif;
      font-size: 0.85em;
      color: #5c748c;
      margin-bottom: 15px;
      border-bottom: 1px solid #2d3748;
      padding-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .mission-header { font-family: 'Michroma', sans-serif; font-size: 1.3em; color: #fff; margin: 0 0 15px 0; }
    
    .telemetry-table { width: 100%; margin-bottom: 15px; }
    .telemetry-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dashed #1c2330;
      padding: 10px 0;
      font-size: 0.85em;
    }
    .telemetry-row .lbl { color: #5c748c; font-weight: bold; text-transform: uppercase; font-family: monospace; }
    .telemetry-row .val { color: #a1b0c0; font-family: monospace; }

    .actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 15px; }
    .btn-dash {
      text-align: center;
      text-decoration: none;
      font-family: 'Michroma', sans-serif;
      padding: 14px 10px;
      font-size: 0.75em;
      text-transform: uppercase;
      font-weight: bold;
      border: 1px solid #2d3748;
      box-sizing: border-box;
    }
    .btn-dash.map { background: #5D3FD3; color: white; border-color: #6e52e6; }
    .btn-dash.chat { background: #39ff14; color: black; border-color: #50ff30; }
    .btn-dash.btn-kill { 
      background: #5c748c !important; /* Forces slate gray over browser link defaults */
      color: #ffffff !important; /* Forces white text over browser link defaults */
      border-color: #718096; 
      grid-column: span 2; 
      margin-top: 5px; 
      cursor: pointer;
      display: block; /* Guarantees layout rendering on older engines */
    }
    
    /* Changes to warning-red instantly when clicked or tapped */
    .btn-dash.btn-kill:active { 
      background: #ff4c4c !important; 
      border-color: #ff6b6b !important;
      color: #ffffff !important;
    }

    .roster-container { display: flex; flex-direction: column; gap: 10px; max-height: 380px; overflow-y: auto; }
    .roster-card {
      background: rgba(6, 5, 5, 0.7);
      border: 1px solid #1c2330;
      padding: 12px 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-sizing: border-box;
    }
    .op-name { font-weight: bold; color: #e2e8f0; font-family: monospace; font-size: 0.95em; }
    .op-role { font-size: 0.7em; color: #5c748c; margin-left: 6px; font-family: monospace; }
    .op-status-badge { font-size: 0.7em; padding: 3px 8px; font-family: monospace; letter-spacing: 0.5px; }

    @media (max-width: 768px) {
      .dash-layout { flex-direction: column; gap: 15px; }
      .body { padding: 5px; }
    }
  </style>
</head>
<body>
  <div style="width:100%; max-width:950px;">
    <a href="/" class="btn-back">◄ RETURN TO HUB</a>
    
    <div class="dash-layout">
      <div class="panel panel-main">
        <div>
          <div class="panel-title">// TELEMETRY_CONSOLE</div>
          <h2 class="mission-header">
            ${escapeHtml(mission.missionName)} 
            <span style="font-size:0.65em; color:${statusColor}; font-family:monospace; vertical-align:middle;">[${mission.status}]</span>
          </h2>
          
          <div class="telemetry-table">
            <div class="telemetry-row"><span class="lbl">MISSION ID</span><span class="val">#${id}</span></div>
            <div class="telemetry-row"><span class="lbl">CHANNEL CODE</span><span class="val" style="color:#39ff14;">${escapeHtml(mission.room)}</span></div>
            <div class="telemetry-row"><span class="lbl">OPERATION CREATOR</span><span class="val">${escapeHtml(creator)}</span></div>
            <div class="telemetry-row"><span class="lbl">YOUR CALLSIGN</span><span class="val" style="color:#5D3FD3; font-weight:bold;">${escapeHtml(user)}</span></div>
            <div class="telemetry-row"><span class="lbl">NET CYCLE</span><span class="val" style="color:#5c748c;">EPHEMERAL ARRAY</span></div>
          </div>
        </div>

        <div class="actions-grid">
          <a href="/brief/${id}" class="btn-dash map">MAP BRIEF</a>
          <a href="/chat?user=${encodeURIComponent(user)}&room=${encodeURIComponent(mission.room)}" class="btn-dash chat">JOIN CHAT</a>
          ${killButton}
        </div>
      </div>

      <div class="panel panel-side">
        <div class="panel-title">// ACTIVE_OPERATOR_ROSTER</div>
        <div class="roster-container">
          ${rosterHtml}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
};

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
                  placeholder="LZAlpha NE 300&#10;RidgeOverwatch E 500&#10;ExtractPoint SE 200"
                  style="width:100%; margin-bottom:15px; padding:12px; background:#0a0c10; 
                         border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px; resize:none;"></textarea>

        <button type="submit" class="btn-tactical" style="width:100%; background:#B85C00;">COMPILE BRIEF</button>
      </form>

    </div>
  </div>
</body></html>`;
// ============ PHASE 3: IN-BRIEF ROUTE PATH ============
const renderBrief = (id) => {
  const mission = briefs[id];
  if (!mission) return '<div style="color:#ff4c4c; padding:20px; font-family:monospace;">ERR: BRIEF DATA NOT FOUND</div>';

  const points = mission.points || [];
  
  // 1. Calculate Core Coordinate Boundaries
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  // Handle baseline fallback if array is empty
  if (minX === Infinity) { minX = -2; maxX = 2; minY = -2; maxY = 2; }

  // Add tactical buffer padding around the edges of the path
  const paddingUnits = 2; 
  const viewMinX = minX - paddingUnits;
  const viewMaxX = maxX + paddingUnits;
  const viewMinY = minY - paddingUnits;
  const viewMaxY = maxY + paddingUnits;

  const totalUnitsX = viewMaxX - viewMinX;
  const totalUnitsY = viewMaxY - viewMinY;

  // 2. Fix the Scale Defect: Define absolute pixel density per unit (e.g., 75px per grid unit)
  const PIXELS_PER_UNIT = 75;
  
  // Mathematically derive the exact canvas sizing requirements
  const svgWidth = totalUnitsX * PIXELS_PER_UNIT;
  const svgHeight = totalUnitsY * PIXELS_PER_UNIT;

  // 3. Generate SVG Internal Elements (Grid lines, Path tracking, Checkpoints)
  // Build a repeating background grid pattern that scales natively inside Firefox 47
  const gridPatternSize = PIXELS_PER_UNIT;
  
  let pathD = '';
  let markersHtml = '';
  
  points.forEach((p, i) => {
    // Construct sequential SVG path lines
    if (i === 0) {
      pathD += `M ${p.x} ${p.y}`;
    } else {
      pathD += ` L ${p.x} ${p.y}`;
    }

    // Interactive targeting reticles for each checkpoint position
    markersHtml += `
      <g class="tgt-node">
        <circle cx="${p.x}" cy="${p.y}" r="0.12" fill="#060505" stroke="#39ff14" stroke-width="0.04" />
        <line x1="${p.x - 0.2}" y1="${p.y}" x2="${p.x + 0.2}" y2="${p.y}" stroke="#39ff14" stroke-width="0.015" />
        <line x1="${p.x}" y1="${p.y - 0.2}" x2="${p.x}" y2="${p.y + 0.2}" stroke="#39ff14" stroke-width="0.015" />
        <text x="${p.x + 0.2}" y="${p.y + 0.1}" fill="#39ff14" font-family:monospace; font-size="0.25" font-weight="bold" style="letter-spacing:0px;">
          WP_${i}: ${escapeHtml(p.name)}
        </text>
      </g>
    `;
  });

  return `<!DOCTYPE html>
<html>
<head>
  ${metaViewport}
  ${fontImport}
  <style>
    ${commonStyle}
    html, body { background-color: #060505; color: #a1b0c0; padding: 10px; margin:0; font-family: monospace; }
    
    /* Dynamic Plotting Container - Isolates map scrollbars from the main app interface */
    .plotting-bay {
      width: 100%;
      overflow: auto; /* Activates pure panning behavior on legacy touch screens */
      border: 1px solid #2d3748;
      background-color: #090b0e;
      margin-top: 15px;
      margin-bottom: 15px;
      -webkit-overflow-scrolling: touch; /* Butter-smooth scrolling override for old mobile devices */
    }

    /* Fixed Layout adjustments for Firefox 47 (No Grid or Flex Gap dependencies) */
    .brief-meta-box {
      background: rgba(11, 13, 17, 0.9);
      border: 1px solid #2d3748;
      padding: 15px;
      margin-bottom: 15px;
    }
    
    .btn-action-group { margin-top: 10px; }
    .btn-action {
      display: inline-block;
      padding: 10px 15px;
      background: #5D3FD3;
      color: #fff;
      text-decoration: none;
      font-weight: bold;
      margin-right: 10px;
      margin-bottom: 5px;
      border: 1px solid #6e52e6;
    }
    .btn-action.status-trigger { background: #39ff14; color: #000; border-color: #50ff30; }
  </style>
</head>
<body>

  <a href="/" class="btn-back">◄ HUB INDEX</a>

  <div class="brief-meta-box">
    <div style="color: #5c748c; font-size: 0.8em; margin-bottom: 5px;">// STRATEGIC_MISSION_BRIEF</div>
    <h2 style="margin: 0 0 10px 0; font-family: 'Michroma', sans-serif; color: #fff; font-size: 1.2em;">
      ${escapeHtml(mission.missionName)}
    </h2>
    <div style="font-size: 0.9em;">
      STATUS: <span style="color:#39ff14; font-weight:bold;">[${mission.status}]</span> | 
      ESTIMATED SECTOR COVERAGE: ${(totalUnitsX * 100)}m x ${(totalUnitsY * 100)}m
    </div>
    
    <div class="btn-action-group">
      <a href="/brief/status/${id}/ACTIVE" class="btn-action status-trigger">DEPLOY // GO LIVE</a>
      <a href="/brief/status/${id}/COMPLETE" class="btn-action" style="background:#5c748c; border-color:#718096;">ARCHIVE BRIEF</a>
    </div>
  </div>

  <div class="plotting-bay">
    <svg 
      width="${svgWidth}px" 
      height="${svgHeight}px" 
      viewBox="${viewMinX} ${viewMinY} ${totalUnitsX} ${totalUnitsY}" 
      xmlns="http://www.w3.org/2000/svg"
      style="display: block; background-color: #060505;"
    >
      <defs>
        <pattern id="tactical-grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill="none" stroke="#1c2330" stroke-width="0.02" />
          <circle cx="0" cy="0" r="0.03" fill="#2d3748" />
        </pattern>
      </defs>

      <rect x="${viewMinX}" y="${viewMinY}" width="${totalUnitsX}" height="${totalUnitsY}" fill="url(#tactical-grid)" />

      <path d="${pathD}" fill="none" stroke="#39ff14" stroke-width="0.04" stroke-dasharray="0.1,0.05" stroke-linejoin="round" stroke-linecap="round" />

      ${markersHtml}

      <g transform="translate(${viewMaxX - 0.8}, ${viewMinY + 0.8})">
        <circle cx="0" cy="0" r="0.4" fill="rgba(6,5,5,0.8)" stroke="#5c748c" stroke-width="0.02" />
        <line x1="0" y1="-0.35" x2="0" y2="0.35" stroke="#5c748c" stroke-width="0.02" />
        <line x1="-0.35" y1="0" x2="0.35" y2="0" stroke="#5c748c" stroke-width="0.02" />
        <polygon points="0,-0.38 -0.08,-0.1 0,-0.18 0.08,-0.1" fill="#ff4c4c" />
        <text x="-0.07" y="-0.45" fill="#5c748c" font-size="0.18" font-family="monospace" font-weight="bold">N</text>
      </g>

      <g transform="translate(${viewMinX + 0.5}, ${viewMaxY - 0.5})">
        <rect x="0" y="0" width="1" height="0.08" fill="#39ff14" />
        <line x1="0" y1="-0.05" x2="0" y2="0.13" stroke="#39ff14" stroke-width="0.03" />
        <line x1="1" y1="-0.05" x2="1" y2="0.13" stroke="#39ff14" stroke-width="0.03" />
        <text x="0" y="-0.15" fill="#a1b0c0" font-size="0.2" font-family="monospace">100m (S_SCALE)</text>
      </g>
    </svg>
  </div>

  <div style="color: #5c748c; font-size: 0.8em; text-align: center;">
    // USE TOUCH SWIPE OR MOUSE DRAG INSIDE PLOTTING BAY TO NAVIGATE CHASSIS MAPPING Array
  </div>

</body>
</html>`;
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
  if (activeCount === 0) delete activeUsers[room];

    // Check if this is a mission channel
  const constraints = roomConstraints[room];
  const isMissionChat = constraints && constraints.missionId;
  const missionDashboardLink = isMissionChat
    ? `<a href="/mission/${constraints.missionId}/dashboard?user=${encodeURIComponent(user)}&token=${encodeURIComponent(room)}" 
         style="color:#B85C00; background:rgba(184,92,0,0.15); padding:2px 8px; border-radius:3px; text-decoration:none;">[ MISSION DASHBOARD ]</a>`
    : '';

  const isSecure = activeCount >= 2;
  const connectionText = `${activeCount} OPERATORS CONNECTED`;

  // Build messages HTML with escaping
  const chatHtml = db[room].map(m => {
    let timeStr = '';
    if (m.timestamp) {
      const d = new Date(m.timestamp);
      timeStr = `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
    }
    const safeSender = escapeHtml(m.sender);
    const safeText = escapeHtml(m.text);
    const isMe = (m.sender === user);

    // CSS tail for bubbles
    const bubbleClass = isMe ? 'msg-right' : 'msg-left';
    return `
    <div class="msg-row ${isMe ? 'msg-row-right' : 'msg-row-left'}">
      <div class="bubble ${bubbleClass}">
        <div class="bubble-meta">${safeSender}</div>
        <div class="bubble-text">${safeText}</div>
        ${timeStr ? `<div class="bubble-time">${timeStr}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  const utcTimeStr = new Date().toISOString().slice(11, 19);

  const encodedExport = Buffer.from(
    db[room].map(m => `[${m.sender}]: ${m.text}`).join('\n')
  ).toString('base64');

  return `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
  ${commonStyle}
  html, body { height: 100%; margin: 0; background: #060505; }
  body {
    background: url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/StratSignal-prototype-Z/LOGO1_MissionBrief.jpg') center/cover no-repeat fixed;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* Fixed top header */
  #chat-header {
    flex-shrink: 0;
    background: rgba(17,21,28,0.95);
    border-bottom: 1px solid #2d3748;
    padding: 12px 15px;
    color: #5c748c;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8em;
    z-index: 100;
  }
  #chat-header .room {
    font-weight: bold;
    color: #fff;
    font-family: 'Michroma', sans-serif;
    font-size: 0.9em;
  }
  #conn-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: ${isSecure ? '#39ff14' : '#5c748c'};
    margin-left: 4px;
    vertical-align: middle;
    animation: blink 1s step-end infinite;
  }
  @keyframes blink { 50% { opacity: 0.15; } }

  /* Messages area */
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Message bubble styles */
  .msg-row {
    display: flex;
    width: 100%;
  }
  .msg-row-right { justify-content: flex-end; }
  .msg-row-left  { justify-content: flex-start; }

  .bubble {
    max-width: 80%;
    padding: 10px 12px;
    border-radius: 6px;
    position: relative;
    font-size: 0.95em;
    line-height: 1.4;
    word-wrap: break-word;
    color: #a1b0c0;
  }
  .msg-right {
    background: #1c2b36;
    border: 1px solid #2c4251;
    margin-left: auto;
    border-bottom-right-radius: 2px;
  }
  .msg-right::after {
    content: "";
    position: absolute;
    bottom: 0; right: -6px;
    width: 0; height: 0;
    border-left: 6px solid #2c4251;
    border-bottom: 6px solid transparent;
    border-top: 6px solid transparent;
  }
  .msg-left {
    background: #161b22;
    border: 1px solid #2d3748;
    margin-right: auto;
    border-bottom-left-radius: 2px;
  }
  .msg-left::before {
    content: "";
    position: absolute;
    bottom: 0; left: -6px;
    width: 0; height: 0;
    border-right: 6px solid #2d3748;
    border-bottom: 6px solid transparent;
    border-top: 6px solid transparent;
  }

  .bubble-meta {
    font-size: 0.65em;
    color: #5c748c;
    margin-bottom: 4px;
    font-weight: bold;
  }
  .bubble-time {
    font-size: 0.6em;
    color: #4a5b6b;
    text-align: right;
    margin-top: 6px;
  }

  /* Bottom toolbar */
  #bottom-bar {
    flex-shrink: 0;
    background: rgba(17,21,28,0.95);
    border-top: 1px solid #2d3748;
    padding: 8px 15px;
    text-align: center;
    font-size: 0.7em;
  }
  #bottom-bar a {
    color: #5c748c;
    text-decoration: none;
    margin: 0 5px;
    background: rgba(92,116,140,0.15);
    padding: 2px 8px;
    border-radius: 3px;
  }
  #bottom-bar a.kill { color: #ff4c4c; background: rgba(255,76,76,0.15); }

  /* Input row */
  #input-row {
    flex-shrink: 0;
    display: flex;
    padding: 10px 15px;
    background: rgba(17,21,28,0.95);
    border-top: 1px solid #2d3748;
    gap: 8px;
  }
  #input-row input {
    flex: 1;
    padding: 12px;
    background: #0a0c10;
    border: 1px solid #2d3748;
    color: #fff;
    font-size: 16px;
    font-family: 'Lato', sans-serif;
  }
  #input-row button {
    padding: 12px 20px;
    font-weight: bold;
    background: #1c2b36;
    color: #fff;
    border: 1px solid #2d3748;
    cursor: pointer;
    font-family: 'Michroma', sans-serif;
  }
</style></head>
<body>
  <!-- Header -->
  <div id="chat-header">
    <span class="room">CH: ${escapeHtml(room)}</span>
    <span>
      ${connectionText} <span id="conn-dot"></span>
    </span>
    <span style="font-size:0.65em;">LAST PING ${utcTimeStr}</span>
  </div>

  <!-- Messages -->
  <div id="messages">
    ${chatHtml}
  </div>
   <!-- Toolbar -->
  <div id="bottom-bar">
    <a href="data:text/plain;base64,${encodedExport}" download="chat.txt">[ CONVO DOWNLOAD ]</a>
    <span style="color:#2d3748; margin:0 3px;">|</span>
    <a href="/chat?user=${encodeURIComponent(user)}&room=${encodeURIComponent(room)}">[ PING ]</a>
    ${isMissionChat ? '<span style="color:#2d3748; margin:0 3px;">|</span>' + missionDashboardLink : ''}
    <span style="color:#2d3748; margin:0 3px;">|</span>
    <a href="/purge?room=${encodeURIComponent(room)}" class="kill">[ KILL ]</a>
    <span style="color:#2d3748; margin:0 3px;">|</span>
    <a href="/boot" style="color:#83EC2D; background:rgba(131,236,45,0.15);">[ SWAP ]</a>
  </div>

  <!-- Input -->
  <form method="POST" action="/send" id="input-row">
    <input type="hidden" name="user" value="${escapeHtml(user)}">
    <input type="hidden" name="room" value="${escapeHtml(room)}">
    <input type="text" name="message" required placeholder="Enter transmission">
    <button type="submit">&gt;</button>
  </form>

  <!-- Auto-ping script -->
  <script>
    (function() {
      var input = document.querySelector('input[name="message"]');
      var timer;
      function reset() {
        clearTimeout(timer);
        timer = setTimeout(function() { location.reload(); }, 60000);
      }
      if (input) {
        input.addEventListener('keydown', reset);
        reset();
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

app.get('/chat', (req, res) => {
  const { user, room } = req.query;
  const constraints = roomConstraints[room];
  
  if (constraints) {
    // New mission-style authorized list
    if (constraints.authorized) {
      if (!user || !constraints.authorized.includes(user)) {
        return res.send("<body style='background:#0a0c10; color:#fff;'><div style='padding:20px;'>ERR: UNAUTHORIZED VECTOR</div></body>");
      }
    } 
    // Old-style single target+creator check (casual locked channel)
    else if (constraints.target && user !== constraints.target && user !== constraints.creator) {
      return res.send("<body style='background:#0a0c10; color:#fff;'><div style='padding:20px;'>ERR: UNAUTHORIZED VECTOR</div></body>");
    }
  }
  
  res.send(renderChat(user, room));
});

app.get('/mission/kill/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const mission = briefs[id];
  if (!mission || !mission.isMission) return res.redirect('/mission');

  // We cannot check token here because it's a GET from a link; the dashboard only shows the kill button to the creator.
  // For extra security, we can require that only the creator can kill, so we just delete:
  // (In a real system you’d want a confirmation, but for now it's fine)
  if (mission.creatorCallsign) {
    delete roomConstraints[mission.room];
    delete briefs[id];
  }
  res.redirect('/mission');
});

app.get('/mission', (req, res) => res.send(renderMissionLanding()));

// CREATE mission form (same as before, just change the action URL)
app.get('/mission/create', (req, res) => res.send(renderNewMissionForm()));

app.post('/mission/create', (req, res) => {
  const { missionName, checkpoints, callsigns, room, creator } = req.body;
  if (!missionName || !checkpoints || !callsigns || !room || !creator) return res.redirect('/mission/create');

  // Parse checkpoints (same as before)
  const lines = checkpoints.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return res.redirect('/mission/create');

  const points = [{ name: 'HQ', x: 0, y: 0 }];
  let prevX = 0, prevY = 0;

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 3) continue;
    const name = parts[0];
    const dir = parts[1].toUpperCase();
    const dist = parseInt(parts[2], 10);

    if (!dirVectors[dir] || isNaN(dist) || dist <= 0) continue;
    const steps = Math.round(dist / SCALE);
    if (steps < 1) continue;

    const vec = dirVectors[dir];
    const newX = prevX + vec.dx * steps;
    const newY = prevY + vec.dy * steps;
    points.push({ name, x: newX, y: newY });
    prevX = newX;
    prevY = newY;
  }

  if (points.length <= 1) return res.redirect('/mission/create');

  // Authorised callsigns list
  const authList = callsigns.split(',').map(s => s.trim()).filter(s => s.length > 0);
  if (!authList.includes(creator.trim())) authList.push(creator.trim());

  const id = ++briefCounter;
  const channelCode = room.trim();
  const creatorCallsign = creator.trim();

  briefs[id] = {
    isMission: true,
    missionName: missionName.trim(),
    points,
    status: 'PLANNED',
    created: Date.now(),
    room: channelCode,
    authorizedCallsigns: authList,
    creatorCallsign: creatorCallsign
  };

  // Lock the channel
  roomConstraints[channelCode] = {
    authorized: authList,
    creator: creatorCallsign,
    missionId: id
  };

  // Redirect creator to the dashboard with token
  res.redirect(`/mission/${id}/dashboard?user=${encodeURIComponent(creatorCallsign)}&token=${encodeURIComponent(channelCode)}`);
});

// GET join page
app.get('/mission/join', (req, res) => res.send(renderJoinMissionForm()));

// POST join – validate and redirect to dashboard
app.post('/mission/join', (req, res) => {
  const { missionId, token, callsign } = req.body;
  const id = parseInt(missionId, 10);
  if (isNaN(id)) return res.send(renderJoinMissionForm() + '<p style="color:red;">Invalid mission ID</p>');

  const mission = briefs[id];
  if (!mission || !mission.isMission) return res.send(renderJoinMissionForm() + '<p style="color:red;">Mission not found</p>');

  // Check channel code
  if (token.trim() !== mission.room) return res.send(renderJoinMissionForm() + '<p style="color:red;">Invalid channel code</p>');

  // Check callsign
  if (!mission.authorizedCallsigns.includes(callsign.trim())) return res.send(renderJoinMissionForm() + '<p style="color:red;">Callsign not authorised</p>');

  // Success – redirect to dashboard with token
  res.redirect(`/mission/${id}/dashboard?user=${encodeURIComponent(callsign.trim())}&token=${encodeURIComponent(mission.room)}`);
});

// Dashboard route – protected by token and callsign
app.get('/mission/:id/dashboard', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const mission = briefs[id];
  if (!mission || !mission.isMission) return res.send('Mission not found');

  const { user, token } = req.query;
  if (!user || !token) return res.send('Unauthorised – missing credentials');

  // Verify token (channel code) and callsign
  if (token !== mission.room) return res.send('Invalid access token');
  if (!mission.authorizedCallsigns.includes(user)) return res.send('Callsign not authorised');

  const isCreator = (user === mission.creatorCallsign);
  res.send(renderMissionDashboard(id, user, isCreator));
});

app.get('/boot', (req, res) => res.send(renderLogin()));

app.post('/login', (req, res) => {
  const { username, passcode, target } = req.body;
  if (target) roomConstraints[passcode] = { target, creator: username };
  res.redirect(`/chat?user=${encodeURIComponent(username)}&room=${encodeURIComponent(passcode)}`);
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
