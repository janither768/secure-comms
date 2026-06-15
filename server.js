const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

let db = {};
let activeUsers = {};
let roomConstraints = {}; // { "RoomName": "TargetAlias" }
const HEARTBEAT_MS = 45000;

// --- CSS LAYER: CINEMATIC CRT OVERLAY ---
const cssOverlay = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Michroma&display=swap');
    body::before {
      content: " ";
      display: block;
      position: fixed;
      top: 0; left: 0; bottom: 0; right: 0;
      background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), 
                  linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
      z-index: 9999;
      background-size: 100% 2px, 3px 100%;
      pointer-events: none;
    }
    .status-matrix { position: absolute; top: 10px; left: 10px; font-family: monospace; font-size: 0.7em; }
    .matrix-lime { color: #39ff14; }
    .matrix-purple { color: #bf00ff; }
    .matrix-blue { color: #00f2ff; }
    .uplink-btn { 
      background: linear-gradient(to right, #00f2ff, #bf00ff);
      border: none; color: white; padding: 15px 30px; font-family: 'Michroma', sans-serif;
      text-transform: uppercase; cursor: pointer;
    }
  </style>
`;

// --- PHASE 1: LANDING ---
const renderLanding = () => `<!DOCTYPE html>
<html><head>${cssOverlay}</head>
<body style="background:#0a0c10; color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0;">
  <div class="status-matrix">
    <div class="matrix-purple">SYS_NODE : STRATSIGNAL_PRIME</div>
    <div class="matrix-blue">UPTIME : ${Math.floor(process.uptime())}s</div>
    <div class="matrix-lime">STATUS : ONLINE // VOLATILE</div>
  </div>
  <h1 style="font-family:'Michroma', sans-serif; color:#fff; letter-spacing:5px;">STRATSIGNAL</h1>
  <button class="uplink-btn" onclick="window.location.href='/boot'">[ ENGAGE UPLINK ]</button>
</body></html>`;

// --- PHASE 2: LOGIN ---
const renderLogin = () => `<!DOCTYPE html>
<html><head>${cssOverlay}</head>
<body style="background:#0a0c10; padding:20px; font-family: sans-serif; display:flex; justify-content:center; align-items:center; height:100vh;">
  <form method="POST" action="/login" style="background:#11151c; padding:25px; border:1px solid #2d3748; width:90%; max-width:300px;">
    <h3 style="color:#00f2ff; font-family:'Michroma'; margin-top:0;">ACCESS DECK</h3>
    <input type="text" name="username" placeholder="Callsign" required style="width:100%; margin-bottom:10px; padding:10px; background:#0a0c10; border:1px solid #2d3748; color:#fff;">
    <input type="password" name="passcode" placeholder="Channel" required style="width:100%; margin-bottom:10px; padding:10px; background:#0a0c10; border:1px solid #2d3748; color:#fff;">
    <input type="text" name="target" placeholder="Target Alias (Optional)" style="width:100%; margin-bottom:15px; padding:10px; background:#0a0c10; border:1px solid #2d3748; color:#fff;">
    <button type="submit" style="width:100%; padding:10px; background:#1c2b36; color:#00f2ff; border:1px solid #00f2ff;">INITIALIZE</button>
  </form>
</body></html>`;

// --- PHASE 3: CHAT ---
const renderChat = (user, room) => {
  if (!db[room]) db[room] = [];
  if (!activeUsers[room]) activeUsers[room] = {};
  
  // Binary Lock Check
  if (roomConstraints[room] && user !== roomConstraints[room] && user !== 'Creator') { 
    // Logic: In a real app, track the "Creator". For now, we allow the person who sets it and the target.
    // Simplified: If target is set, block everyone else.
  }
  
  activeUsers[room][user] = Date.now();
  const now = Date.now();
  let activeCount = 0;
  for (const [op, time] of Object.entries(activeUsers[room])) {
    if (now - time < HEARTBEAT_MS) activeCount++;
    else delete activeUsers[room][op];
  }
  const isSecure = activeCount >= 2;

  const chatHtml = db[room].map(m => `
    <div style="text-align:${m.sender===user?'right':'left'}; margin-bottom:10px;">
      <div style="display:inline-block; background:${m.sender===user?'#1c2b36':'#161b22'}; padding:8px; border-radius:5px; border:1px solid #2c4251;">
        <b style="font-size:0.7em; color:#5c748c;">${m.sender}</b><br><span style="color:#a1b0c0;">${m.text}</span>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html>
  <html><head>${cssOverlay}</head>
  <body style="background:#0a0c10; color:#a1b0c0; padding:10px; padding-bottom:150px;">
    <div style="text-align:right; font-size:0.8em; color:${isSecure?'#39ff14':'#5c748c'};">${isSecure?'LINK SECURE':'AWAITING'} ●</div>
    <div style="padding-top:20px;">${chatHtml}</div>
    <div style="position:fixed; bottom:0; left:0; width:100%; background:#11151c; padding:10px; text-align:center;">
       <form method="POST" action="/send">
          <input type="hidden" name="user" value="${user}"><input type="hidden" name="room" value="${room}">
          <input type="text" name="message" required style="width:60%; padding:10px; background:#0a0c10; border:1px solid #2d3748; color:#fff;">
          <button type="submit" style="padding:10px;">TX</button>
       </form>
       <a href="/purge?room=${room}" style="color:#ff4c4c; font-size:0.7em;">[ PURGE ]</a>
    </div>
  </body></html>`;
};

app.get('/', (req, res) => res.send(renderLanding()));
app.get('/boot', (req, res) => res.send(renderLogin()));
app.post('/login', (req, res) => {
  const { username, passcode, target } = req.body;
  if (target) roomConstraints[passcode] = target;
  res.redirect(`/chat?user=${encodeURIComponent(username)}&room=${encodeURIComponent(passcode)}`);
});
app.get('/chat', (req, res) => {
  const { user, room } = req.query;
  // Binary Lock Enforcement
  if (roomConstraints[room] && user !== roomConstraints[room] && !db[room].some(m=>m.sender===user)) {
     return res.send("ERR: UNAUTHORIZED VECTOR");
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
