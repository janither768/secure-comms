const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

let db = {};
let activeUsers = {};
let roomConstraints = {};
const HEARTBEAT_MS = 45000;

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
const renderLanding = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>${commonStyle}</style></head>
<body style="background-color:#0a0c10; margin:0; height:100vh; overflow:hidden;">

  <!-- Status matrix: absolute top-left, highest z-index, always visible -->
  <div class="status-matrix" style="position:absolute; top:15px; left:15px; z-index:10; text-align:left; margin:0;">
    <div>SYS_NODE : STRATSIGNAL_PRIME // ONLINE</div>
    <div>RELAY_MODE : HTTP_POLL // NOMINAL</div>
  </div>

  <!-- Table wrapper for bulletproof vertical centering -->
  <div style="display:table; width:100%; height:100vh; position:relative; z-index:5;">
    <div style="display:table-cell; vertical-align:middle; text-align:center; padding:0;">

      <!-- Logo: edge‑to‑edge horizontally, height auto, no scaling distortion -->
      <img src="https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/prototype02-purge-upgrade-from-'main'/StratSignal-logo-01.jpg"
           alt=""
           style="width:100%; height:auto; display:block; border:none; margin:0;">

      <!-- Engage button directly below logo with tactical margin -->
      <button class="btn-tactical"
              onclick="window.location.href='/boot'"
              style="margin-top:20px; box-shadow:0px 4px 20px rgba(0,0,0,0.8); display:inline-block;">
        [ ENGAGE CHANNEL ]
      </button>

    </div>
  </div>
</body></html>`;

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

  // Build the message list
  const chatHtml = db[room].map(m => `
    <div style="text-align:${m.sender === user ? 'right' : 'left'}; margin-bottom:10px;">
      <div style="display:inline-block; background:${m.sender === user ? '#1c2b36' : '#161b22'}; 
                  padding:12px; border-radius:8px; 
                  border:1px solid ${m.sender === user ? '#2c4251' : '#2d3748'}; 
                  text-align:left; max-width:85%; word-wrap:break-word;">
        <b style="font-size:0.7em; color:#5c748c;">${m.sender}</b><br>
        <span style="color:#a1b0c0; line-height:1.4;">${m.text}</span>
      </div>
    </div>`).join('');

  // Base64 export payload
  const encodedExport = Buffer.from(
    db[room].map(m => `[${m.sender}]: ${m.text}`).join('\n')
  ).toString('base64');

  return `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>
    ${commonStyle}
    /* Additional chat-specific styles – zero flex, zero transforms */
    .chat-wrapper { position:relative; width:100%; height:100vh; overflow:hidden; background:#0a0c10; }
    .chat-header { position:absolute; top:0; left:0; right:0; height:50px; 
                   background:#11151c; border-bottom:1px solid #1f2937; 
                   padding:0 15px; line-height:50px; z-index:100; }
    .chat-header .ch-label { float:left; font-size:0.8em; color:#5c748c; }
    .chat-header .conn-status { float:right; font-size:0.7em; font-weight:bold; letter-spacing:1px; }
    .chat-messages { position:absolute; top:50px; left:0; right:0; bottom:120px; 
                     overflow-y:auto; padding:15px; }
    .chat-input-bar { position:absolute; bottom:0; left:0; right:0; height:120px; 
                      background:#11151c; border-top:1px solid #2d3748; 
                      text-align:center; padding:10px; box-sizing:border-box; z-index:100; }
    .chat-input-bar form { margin-bottom:10px; }
    .chat-input-bar input[type="text"] { width:70%; padding:12px; background:#0a0c10; 
                                         border:1px solid #2d3748; color:#fff; margin-right:5px; 
                                         box-sizing:border-box; font-size:16px; }
    .chat-input-bar button[type="submit"] { padding:12px 20px; font-weight:bold; 
                                            background:#1c2b36; color:#fff; border:1px solid #2d3748; }
    .chat-links { font-size:0.7em; }
    .chat-links a { color:#5c748c; text-decoration:none; }
    .chat-links .kill-link { color:#ff4c4c; font-weight:bold; }
</style></head>
<body>
  <div class="chat-wrapper">
    <!-- Header (absolute top) -->
    <div class="chat-header">
      <span class="ch-label">CH: ${room}</span>
      <span class="conn-status" style="color:${isSecure ? '#39ff14' : '#5c748c'};">${connectionStatusText} ●</span>
    </div>

    <!-- Scrollable message area -->
    <div class="chat-messages">${chatHtml}</div>

    <!-- Bottom command bar (absolute bottom) -->
    <div class="chat-input-bar">
      <form method="POST" action="/send">
        <input type="hidden" name="user" value="${user}">
        <input type="hidden" name="room" value="${room}">
        <input type="text" name="message" required placeholder="Transmit...">
        <button type="submit">&gt;</button>
      </form>
      <div class="chat-links">
        <a href="data:text/plain;base64,${encodedExport}" download="chat.txt">[ CONVO DOWNLOAD ]</a>
        <span style="color:#2d3748; margin:0 3px;">|</span>
        <a href="/chat?user=${encodeURIComponent(user)}&room=${encodeURIComponent(room)}">[ PING ]</a>
        <span style="color:#2d3748; margin:0 3px;">|</span>
        <a href="/purge?room=${encodeURIComponent(room)}" class="kill-link">[ KILL ]</a>
      </div>
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
  db[room].push({ sender: user, text: message });
  res.redirect(`/chat?user=${encodeURIComponent(user)}&room=${encodeURIComponent(room)}`);
});

app.get('/purge', (req, res) => {
  const { room } = req.query;
  delete db[room];
  delete roomConstraints[room];
  res.redirect('/');
});

app.listen(port, () => console.log('StratSignal Active.'));
