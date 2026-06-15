const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

let db = {};
let activeUsers = {};
let roomConstraints = {};
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

// ==================================================
//  PHASE 1: PRE-CHANNEL (LANDING) – TABLE CENTERING
// ==================================================
const renderLanding = (stats = {}) => {
  const { totalOps = 0, activeChannels = 0, totalMessages = 0, uptimeStr = '--' } = stats;

  return `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
    ${commonStyle}
    html, body { height: 100%; margin: 0; }
</style></head>
<body style="background-color:#0a0c10;">

  <table cellpadding="0" cellspacing="0" border="0" style="width:100%; height:100%; margin:0; border-collapse:collapse;">
    <tr>
      <!-- Status row – top-left tactical HUD -->
      <td style="vertical-align:top; text-align:left; padding:15px 0 0 15px;">
        <!-- Semi-transparent backdrop for readability -->
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
      <!-- Content row – logo + button, vertically centered -->
      <td style="vertical-align:middle; text-align:center; padding:0;">
        <img src="https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/prototype02-purge-upgrade-from-'main'/StratSignal-logo-01.jpg"
             alt=""
             style="width:100%; height:auto; display:block; border:none; margin:0;">
        <button class="btn-tactical"
                onclick="window.location.href='/boot'"
                style="margin-top:20px; box-shadow:0px 4px 20px rgba(0,0,0,0.8); display:inline-block;">
          [ ENGAGE CHANNEL ]
        </button>
      </td>
    </tr>
  </table>
</body></html>`;
};

// ==================================================
//  PHASE 2: LOGIN – TABLE CENTERING, NO FLEX
// ==================================================
const renderLogin = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>${commonStyle}</style></head>
<body style="background-color:#0a0c10; margin:0; height:100vh;">

  <!-- Table centering the login form exactly in the middle -->
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

// ==================================================
//  PHASE 3: IN-CHANNEL (CHAT) – NO FLEX, NO FIXED
// ==================================================

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
    // Format timestamp to HH:MM (UTC)
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
<html><head>${metaViewport}${fontImport}<style>${commonStyle}
    html, body { height: 100%; margin: 0; }
    input { font-size: 16px; }
</style></head>
<body style="padding-bottom:150px; padding-top:60px; background:#0a0c10; margin:0;">

  <!-- Fixed top bar (classic) -->
  <div style="position:fixed; top:0; left:0; right:0; background:#11151c; border-bottom:1px solid #1f2937; 
              padding:15px; display:block; z-index:100; box-sizing:border-box;">
    <span style="float:left; font-size:0.8em; color:#5c748c;">CH: ${room}</span>
    <span style="float:right; font-size:0.7em; color:${isSecure ? '#39ff14' : '#5c748c'}; font-weight:bold; letter-spacing:1px;">${connectionStatusText} ●</span>
    <div style="clear:both;"></div>
  </div>

  <!-- Message area – body scrolls, no inner scroll -->
  <div style="padding:15px;">
    ${chatHtml}
  </div>

  <!-- Fixed bottom command bar (classic) -->
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

// Routes – unchanged
app.get('/', (req, res) => res.send(renderLanding()));
app.get('/boot', (req, res) => res.send(renderLogin()));

app.post('/login', (req, res) => {
  const { username, passcode, target } = req.body;
  if (target) roomConstraints[passcode] = { target, creator: username };
  res.redirect(`/chat?user=${encodeURIComponent(username)}&room=${encodeURIComponent(passcode)}`);
});

app.get('/', (req, res) => {
  // Count active operators and channels
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

  // Total messages in memory
  let totalMessages = 0;
  for (const room of Object.keys(db)) {
    totalMessages += db[room].length;
  }

  // Uptime formatting
  const uptimeMs = now - SERVER_START;
  const days = Math.floor(uptimeMs / 86400000);
  const hours = Math.floor((uptimeMs % 86400000) / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);
  const uptimeStr = `${days}D ${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}M`;

  res.send(renderLanding({ totalOps, activeChannels, totalMessages, uptimeStr }));
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

app.listen(port, () => console.log('StratSignal Active.'));
