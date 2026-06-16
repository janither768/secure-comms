const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

let db = {};
let activeUsers = {};
let roomConstraints = {};

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

const HEARTBEAT_MS = 45000;
const SERVER_START = Date.now();

const metaViewport = `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`;
const fontImport = `<link href="https://fonts.googleapis.com/css2?family=Michroma&display=swap" rel="stylesheet">`;

const commonStyle = `
  body { background-color: #0a0c10; font-family: sans-serif; color: #a1b0c0; margin: 0; }
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
</style></head>
<body style="background-color:#0a0c10;">

  <table cellpadding="0" cellspacing="0" border="0" style="width:100%; height:100%; margin:0; border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top; text-align:left; padding:15px 0 0 15px;">
        <div style="background:rgba(10,12,16,0.75); display:inline-block; padding:8px 12px; border-radius:4px; border:1px solid #1f2937;">
          <div class="status-matrix" style="margin:0;">
            <div>SYS_NODE : STRATSIGNAL_PRIME // ONLINE</div>
            <div>RELAY_MODE : HTTP_POLL // NOMINAL</div>
            <div style="margin-top:8px;">NET_ACTIVE : ${totalOps} OPS // ${activeChannels} CH</div>
            <div>TRAFFIC   : ${totalMessages} MSG</div>
            <div>UPTIME    : ${uptimeStr}</div>
          </div>
        </div>
      </td>
    </tr>
    <tr>
      <td style="vertical-align:middle; text-align:center; padding:0;">
        <img src="https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/prototype02-purge-upgrade-from-'main'/StratSignal-logo-01.jpg"
             alt=""
             style="width:100%; height:auto; display:block; border:none; margin:0;">
        <!-- Tactical action buttons -->
        <div style="margin-top:20px; text-align:center;">
          <button class="btn-tactical"
                  onclick="window.location.href='/boot'"
                  style="box-shadow:0px 4px 20px rgba(0,0,0,0.8); display:inline-block; margin-bottom:10px;">
            [ ENGAGE CHANNEL ]
          </button><br>
          <button class="btn-tactical btn-brief"
                  onclick="window.location.href='/brief'"
                  style="box-shadow:0px 4px 20px rgba(0,0,0,0.8); display:inline-block;">
            [ MISSION BRIEF ]
          </button>
        </div>
      </td>
    </tr>
  </table>
</body></html>`;
};
// ============ PHASE 2: LOGIN ============
const renderLogin = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>${commonStyle}</style></head>
<body style="background-color:#0a0c10; margin:0; height:100vh;">
  <div style="display:table; width:100%; height:100%;">
    <div style="display:table-cell; vertical-align:middle; text-align:center;">
      <form method="POST" action="/login"
            style="background:#11151c; padding:20px; border:1px solid #2d3748; 
                   width:85%; max-width:320px; display:inline-block; text-align:left;
                   box-sizing:border-box;">
        <input type="text" name="username" placeholder="Callsign" required
               style="width:100%; margin-bottom:10px; padding:12px; background:#0a0c10; 
                      border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px;">
        <input type="password" name="passcode" placeholder="Channel" required
               style="width:100%; margin-bottom:10px; padding:12px; background:#0a0c10; 
                      border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px;">
        <input type="text" name="target" placeholder="Target Alias (Optional)"
               style="width:100%; margin-bottom:15px; padding:12px; background:#0a0c10; 
                      border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px;">
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
<body style="background-color:#0a0c10; margin:0; height:100%;">

  <div style="display:table; width:100%; height:100%;">
    <div style="display:table-cell; vertical-align:middle; text-align:center;">

      <form method="POST" action="/brief"
            style="background:#11151c; padding:20px; border:1px solid #2d3748; 
                   width:85%; max-width:400px; display:inline-block; text-align:left;
                   box-sizing:border-box;">
        <div style="color:#5c748c; font-size:0.7em; margin-bottom:5px;">MISSION NAME</div>
        <input type="text" name="missionName" required placeholder="OP NIGHTFALL"
               style="width:100%; margin-bottom:15px; padding:12px; background:#0a0c10; 
                      border:1px solid #2d3748; color:#fff; box-sizing:border-box; font-size:16px;">

        <div style="color:#5c748c; font-size:0.7em; margin-bottom:5px;">CHECKPOINTS (one per line)</div>
        <textarea name="checkpoints" rows="6" required placeholder="LZ Alpha - secure&#10;Ridge Overwatch&#10;Extract Point"
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

  // Build the path HTML
  const checkpointsHtml = brief.checkpoints.map(cp => {
    // cp is already an object { text: "checkpoint - optional note" }
    return `
    <div style="position:relative; padding-left:24px; margin-bottom:20px; min-height:20px;">
      <!-- The dot -->
      <div style="position:absolute; left:-4px; top:4px; width:8px; height:8px; 
                  background:#B85C00; border-radius:50%; border:1px solid #1f2937;"></div>
      <!-- Checkpoint text -->
      <div style="color:#a1b0c0; font-size:0.9em; line-height:1.4; word-wrap:break-word;">
        ${escapeHtml(cp.text)}
      </div>
    </div>`;
  }).join('');

  // Status line and control links
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

  <!-- Path container -->
  <div style="margin:20px 15px; padding-left:10px; border-left:2px solid #2d3748; position:relative;">
    ${checkpointsHtml}
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
                  padding:12px; border-radius:8px; 
                  border:1px solid ${m.sender === user ? '#2c4251' : '#2d3748'}; 
                  text-align:left; max-width:85%; word-wrap:break-word;">
        <b style="font-size:0.7em; color:#5c748c;">${m.sender}</b><br>
        <span style="color:#a1b0c0; line-height:1.4;">${m.text}</span>
        ${timeStr ? `<div style="font-size:0.6em; color:#4a5b6b; margin-top:4px; text-align:right;">${timeStr}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  const encodedExport = Buffer.from(
    db[room].map(m => `[${m.sender}]: ${m.text}`).join('\n')
  ).toString('base64');

  return `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
    ${commonStyle}
    html, body { height: 100%; margin: 0; }
    input { font-size: 16px; }
</style></head>
<body style="padding-bottom:150px; padding-top:60px; background:#0a0c10; margin:0;">

  <div style="position:fixed; top:0; left:0; right:0; background:#11151c; border-bottom:1px solid #1f2937; 
              padding:15px; display:block; z-index:100; box-sizing:border-box;">
    <span style="float:left; font-size:0.8em; color:#5c748c;">CH: ${room}</span>
    <span style="float:right; font-size:0.7em; color:${isSecure ? '#39ff14' : '#5c748c'}; font-weight:bold; letter-spacing:1px;">${connectionStatusText} ●</span>
    <div style="clear:both;"></div>
  </div>

  <div style="padding:15px;">
    ${chatHtml}
  </div>

  <div style="position:fixed; bottom:0; left:0; right:0; background:#11151c; border-top:1px solid #2d3748; 
              padding:10px; text-align:center; z-index:100; box-sizing:border-box;">
    <form method="POST" action="/send" style="margin-bottom:10px; display:block; text-align:center;">
      <input type="hidden" name="user" value="${user}">
      <input type="hidden" name="room" value="${room}">
      <input type="text" name="message" required placeholder="Transmit..." 
             style="width:70%; padding:12px; background:#0a0c10; border:1px solid #2d3748; color:#fff; margin-right:5px; box-sizing:border-box; font-size:16px;">
      <button type="submit" style="padding:12px 20px; font-weight:bold; background:#1c2b36; color:#fff; border:1px solid #2d3748;">&gt;</button>
    </form>
    <div style="font-size:0.7em;">
      <a href="data:text/plain;base64,${encodedExport}" download="chat.txt" style="color:#5c748c; text-decoration:none;">[ CONVO DOWNLOAD ]</a>
      <span style="color:#2d3748; margin:0 3px;">|</span>
      <a href="/chat?user=${encodeURIComponent(user)}&room=${encodeURIComponent(room)}" style="color:#5c748c; text-decoration:none;">[ PING ]</a>
      <span style="color:#2d3748; margin:0 3px;">|</span>
      <a href="/purge?room=${encodeURIComponent(room)}" style="color:#ff4c4c; text-decoration:none; font-weight:bold;">[ KILL ]</a>
    </div>
  </div>
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
  if (!missionName || !checkpoints) {
    return res.redirect('/brief');
  }

  // Split checkpoints by newline, trim, and filter empty lines
  const points = checkpoints
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(text => ({ text })); // store as simple object for future expansion

  if (points.length === 0) {
    return res.redirect('/brief');
  }

  const id = ++briefCounter;
  briefs[id] = {
    missionName: missionName.trim(),
    checkpoints: points,
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
