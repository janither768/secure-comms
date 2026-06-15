const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

let db = {};
let activeUsers = {}; 
let roomConstraints = {}; 
const HEARTBEAT_MS = 45000;

// --- CRITICAL FIX: Forces modern phones (Redmi) to scale to 100% ---
const metaViewport = `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`;
const fontImport = `<link href="https://fonts.googleapis.com/css2?family=Michroma&display=swap" rel="stylesheet">`;

// Added input font-size to prevent mobile auto-zoom on text fields
const commonStyle = `
  body { background-color: #0a0c10; font-family: sans-serif; color: #a1b0c0; margin: 0; }
  .btn-tactical { background-color: #5D3FD3; color: white; border: none; padding: 12px 24px; cursor: pointer; font-family: 'Michroma', sans-serif; text-transform: uppercase; font-weight: bold; }
  .status-matrix { color: #5c748c; font-family: monospace; font-size: 0.75em; }
  input { font-size: 16px; } 
`;

// --- PHASE 1: PRE-CHANNEL ---
// Status Matrix locked to top-left. Logo loaded as the background.
const renderLanding = () => `<!DOCTYPE html>
<html><head>${metaViewport}${fontImport}<style>${commonStyle}</style></head>
<body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background: #0a0c10 url('https://raw.githubusercontent.com/janither768/secure-comms/refs/heads/prototype02-purge-upgrade-from-'main'/StratSignal-logo-01.jpg') no-repeat center center; -webkit-background-size: 100% auto; background-size: 100% auto;">  
  <div class="status-matrix" style="position: absolute; top: 15px; left: 15px; text-align: left; margin: 0;">
    <div>SYS_NODE : STRATSIGNAL_PRIME // ONLINE</div>
    <div>RELAY_MODE : HTTP_POLL // NOMINAL</div>
  </div>
  
  <button class="btn-tactical" onclick="window.location.href='/boot'" style="z-index: 10; position: relative; box-shadow: 0px 4px 15px rgba(0,0,0,0.5);">[ ENGAGE CHANNEL ]</button>
</body></html>`;

// --- PHASE 2: LOGIN ---
const renderLogin = () => `<!DOCTYPE html>
<html><head>${metaViewport}<style>${commonStyle}</style></head>
<body style="display:flex; justify-content:center; align-items:center; height:100vh;">
  <form method="POST" action="/login" style="background:#11151c; padding:20px; border:1px solid #2d3748; width:85%; max-width:320px; box-sizing:border-box;">
    <input type="text" name="username" placeholder="Callsign" required style="width:100%; margin-bottom:10px; padding:12px; background:#0a0c10; border:1px solid #2d3748; color:#fff; box-sizing:border-box;">
    <input type="password" name="passcode" placeholder="Channel" required style="width:100%; margin-bottom:10px; padding:12px; background:#0a0c10; border:1px solid #2d3748; color:#fff; box-sizing:border-box;">
    <input type="text" name="target" placeholder="Target Alias (Optional)" style="width:100%; margin-bottom:15px; padding:12px; background:#0a0c10; border:1px solid #2d3748; color:#fff; box-sizing:border-box;">
    <button type="submit" class="btn-tactical" style="width:100%;">INITIALIZE</button>
  </form>
</body></html>`;

// --- PHASE 3: CHAT ---
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

  const chatHtml = db[room].map(m => `
    <div style="text-align:${m.sender===user?'right':'left'}; margin-bottom:10px;">
      <div style="display:inline-block; background:${m.sender===user?'#1c2b36':'#161b22'}; padding:12px; border-radius:8px; border:1px solid ${m.sender===user?'#2c4251':'#2d3748'}; text-align:left; max-width: 85%; word-wrap: break-word;">
        <b style="font-size:0.7em; color:#5c748c;">${m.sender}</b><br><span style="color:#a1b0c0; line-height: 1.4;">${m.text}</span>
      </div>
    </div>`).join('');

  const encodedExport = Buffer.from(db[room].map(m=>`[${m.sender}]: ${m.text}`).join('\n')).toString('base64');

  return `<!DOCTYPE html>
  <html><head>${metaViewport}<style>${commonStyle}</style></head>
  <body style="padding-bottom:150px;">
    <div style="background:#11151c; border-bottom:1px solid #1f2937; padding:15px; display:flex; justify-content:space-between; align-items:center; position:fixed; top:0; width:100%; box-sizing:border-box; z-index:100;">
       <div style="font-size:0.8em; color:#5c748c;">CH: ${room}</div>
       <div style="font-size:0.7em; color:${isSecure?'#39ff14':'#5c748c'}; font-weight:bold; letter-spacing:1px;">${connectionStatusText} ●</div>
    </div>
    <div style="padding:15px; margin-top: 50px;">${chatHtml}</div>
    <div style="position:fixed; bottom:0; width:100%; background:#11151c; border-top:1px solid #2d3748; padding:10px; text-align:center; box-sizing:border-box; z-index:100;">
       <form method="POST" action="/send" style="margin-bottom:10px; display:flex; justify-content:center; align-items:center;">
          <input type="hidden" name="user" value="${user}"><input type="hidden" name="room" value="${room}">
          <input type="text" name="message" required style="width:70%; padding:12px; background:#0a0c10; border:1px solid #2d3748; color:#fff; margin-right:5px; box-sizing:border-box;">
          <button type="submit" style="padding:12px 20px; font-weight:bold; background:#1c2b36; color:#fff; border:1px solid #2d3748;">&gt;</button>
       </form>
       <a href="data:text/plain;base64,${encodedExport}" download="chat.txt" style="color:#5c748c; text-decoration:none; font-size:0.7em;">[ CONVO DOWNLOAD ]</a>
       <span style="color:#2d3748; margin:0 3px;">|</span>
       <a href="/chat?user=${user}&room=${room}" style="color:#5c748c; text-decoration:none; font-size:0.7em;">[ PING ]</a>
       <span style="color:#2d3748; margin:0 3px;">|</span>
       <a href="/purge?room=${room}" style="color:#ff4c4c; text-decoration:none; font-size:0.7em; font-weight:bold;">[ KILL ]</a>
    </div>
  </body></html>`;
};

app.get('/', (req, res) => res.send(renderLanding()));
app.get('/boot', (req, res) => res.send(renderLogin()));

app.post('/login', (req, res) => {
  const { username, passcode, target } = req.body;
  if (target) roomConstraints[passcode] = { target: target, creator: username };
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
  delete db[room]; delete roomConstraints[room];
  res.redirect('/');
});

app.listen(port, () => console.log('StratSignal Active.'));
