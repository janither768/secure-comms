const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// In-memory database: { "RoomKey": [{sender, text}, ...] }
let db = {};

const renderPage = (user = '', room = '', error = '') => {
  let chatHtml = '';
  let exportData = '';

  if (user && room) {
    if (!db[room]) db[room] = [];
    
    // Build bubbles and raw export string simultaneously
    chatHtml = db[room].map(m => {
      const isMe = m.sender === user;
      exportData += `[${m.sender}]: ${m.text}\n`; // Prep for download
      return `
        <div style="text-align: ${isMe ? 'right' : 'left'}; margin-bottom: 10px; clear: both;">
          <div style="display: inline-block; background: ${isMe ? '#1c2b36' : '#161b22'}; padding: 10px; border-radius: 8px; max-width: 80%; text-align: left; border: 1px solid ${isMe ? '#2c4251' : '#2d3748'};">
            <b style="font-size: 0.7em; color: #5c748c;">${m.sender}</b><br>
            <span style="color: #a1b0c0;">${m.text}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Base64 encode the export data for a direct browser download link
  const encodedExport = Buffer.from(exportData).toString('base64');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Secure Net</title>
  </head>
  <body style="background-color: #0a0c10; font-family: sans-serif; color: #a1b0c0; margin: 0; padding-bottom: 150px;">
    
    <div style="background: #11151c; border-bottom: 1px solid #1f2937; padding: 15px; text-align: center; position: sticky; top: 0;">
      CHANNEL: ${room || 'OFFLINE'}
    </div>
    
    ${!user ? `
      <div style="padding: 20px; text-align: center;">
        <form method="POST" action="/login" style="background: #11151c; padding: 20px; border: 1px solid #2d3748; display: inline-block; width: 80%;">
          <input type="text" name="username" placeholder="Operator Callsign" required style="width: 90%; margin-bottom: 10px; padding: 10px; background: #0a0c10; border: 1px solid #2d3748; color: #fff;"><br>
          <input type="password" name="passcode" placeholder="Access Channel" required style="width: 90%; margin-bottom: 10px; padding: 10px; background: #0a0c10; border: 1px solid #2d3748; color: #fff;"><br>
          <button type="submit" style="width: 100%; padding: 10px; background: #1c2b36; color: #fff; border: none;">INITIALIZE</button>
        </form>
      </div>
    ` : `
      <div style="padding: 15px;">${chatHtml}</div>
      
      <div style="position: fixed; bottom: 0; width: 100%; background: #11151c; border-top: 1px solid #2d3748; padding: 10px; text-align: center;">
        <form method="POST" action="/send" style="margin-bottom: 10px;">
          <input type="hidden" name="user" value="${user}">
          <input type="hidden" name="room" value="${room}">
          <input type="text" name="message" style="width: 60%; padding: 10px; background: #0a0c10; border: 1px solid #2d3748; color: #fff;" required>
          <button type="submit" style="padding: 10px;">TX</button>
        </form>
        
        <a href="data:text/plain;base64,${encodedExport}" download="chat_log_${room}.txt" style="color: #5c748c; text-decoration: none; font-size: 0.8em;">[ DOWNLOAD ARCHIVE ]</a>
        <span style="margin: 0 10px; color: #2d3748;">|</span>
        <a href="/chat?user=${encodeURIComponent(user)}&room=${encodeURIComponent(room)}" style="color: #5c748c; text-decoration: none; font-size: 0.8em;">[ PING FEED ]</a>
        <span style="margin: 0 10px; color: #2d3748;">|</span>
        <a href="/purge?room=${encodeURIComponent(room)}" style="color: #ff4c4c; text-decoration: none; font-size: 0.8em; font-weight: bold;">[ PURGE CHANNEL ]</a>
      </div>
    `}
  </body>
  </html>
  `;
};

app.get('/', (req, res) => res.send(renderPage()));

// URL Encoding added to prevent ERR_INVALID_CHAR crash on login
app.post('/login', (req, res) => {
  const safeUser = encodeURIComponent(req.body.username || '');
  const safeRoom = encodeURIComponent(req.body.passcode || '');
  res.redirect(`/chat?user=${safeUser}&room=${safeRoom}`);
});

app.get('/chat', (req, res) => res.send(renderPage(req.query.user, req.query.room)));

// URL Encoding and safety checks added to the TX route
app.post('/send', (req, res) => {
  const u = req.body.user;
  const r = req.body.room;
  const m = req.body.message;
  
  if (u && r && m) {
    if (!db[r]) db[r] = [];
    db[r].push({ sender: u, text: m });
  }
  
  res.redirect(`/chat?user=${encodeURIComponent(u || '')}&room=${encodeURIComponent(r || '')}`);
});

// Tactical Purge Route
app.get('/purge', (req, res) => {
  const targetRoom = req.query.room;
  if (targetRoom && db[targetRoom]) {
    delete db[targetRoom];
  }
  res.redirect('/');
});

app.listen(port, () => console.log('Tactical Net Active.'));
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Secure Net</title>
  </head>
  <body style="background-color: #0a0c10; font-family: sans-serif; color: #a1b0c0; margin: 0; padding-bottom: 150px;">
    
    <div style="background: #11151c; border-bottom: 1px solid #1f2937; padding: 15px; text-align: center; position: sticky; top: 0;">
      CHANNEL: ${room || 'OFFLINE'}
    </div>
    
    ${!user ? `
      <div style="padding: 20px; text-align: center;">
        <form method="POST" action="/login" style="background: #11151c; padding: 20px; border: 1px solid #2d3748; display: inline-block; width: 80%;">
          <input type="text" name="username" placeholder="Operator Callsign" required style="width: 90%; margin-bottom: 10px; padding: 10px; background: #0a0c10; border: 1px solid #2d3748; color: #fff;"><br>
          <input type="password" name="passcode" placeholder="Access Channel" required style="width: 90%; margin-bottom: 10px; padding: 10px; background: #0a0c10; border: 1px solid #2d3748; color: #fff;"><br>
          <button type="submit" style="width: 100%; padding: 10px; background: #1c2b36; color: #fff; border: none;">INITIALIZE</button>
        </form>
      </div>
    ` : `
      <div style="padding: 15px;">${chatHtml}</div>
      
      <div style="position: fixed; bottom: 0; width: 100%; background: #11151c; border-top: 1px solid #2d3748; padding: 10px; text-align: center;">
        <form method="POST" action="/send" style="margin-bottom: 10px;">
          <input type="hidden" name="user" value="${user}">
          <input type="hidden" name="room" value="${room}">
          <input type="text" name="message" style="width: 60%; padding: 10px; background: #0a0c10; border: 1px solid #2d3748; color: #fff;" required>
          <button type="submit" style="padding: 10px;">TX</button>
        </form>
        
        <a href="data:text/plain;base64,${encodedExport}" download="chat_log_${room}.txt" style="color: #5c748c; text-decoration: none; font-size: 0.8em;">[ DOWNLOAD ARCHIVE ]</a>
        <span style="margin: 0 10px; color: #2d3748;">|</span>
        <a href="/chat?user=${user}&room=${room}" style="color: #5c748c; text-decoration: none; font-size: 0.8em;">[ PING FEED ]</a>
        <span style="margin: 0 10px; color: #2d3748;">|</span>
        <a href="/purge?room=${room}" style="color: #ff4c4c; text-decoration: none; font-size: 0.8em; font-weight: bold;">[ PURGE CHANNEL ]</a>
      </div>
    `}
  </body>
  </html>
  `;
};

app.get('/', (req, res) => res.send(renderPage()));
app.post('/login', (req, res) => res.redirect(`/chat?user=${req.body.username}&room=${req.body.passcode}`));
app.get('/chat', (req, res) => res.send(renderPage(req.query.user, req.query.room)));

app.post('/send', (req, res) => {
  if (!db[req.body.room]) db[req.body.room] = [];
  db[req.body.room].push({ sender: req.body.user, text: req.body.message });
  res.redirect(`/chat?user=${req.body.user}&room=${req.body.room}`);
});

// New Tactical Purge Route
app.get('/purge', (req, res) => {
  const targetRoom = req.query.room;
  if (targetRoom && db[targetRoom]) {
    delete db[targetRoom]; // Hard delete array from memory
  }
  res.redirect('/'); // Terminate layout and drop to root login
});

app.listen(port, () => console.log('Tactical Net Active.'));
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Secure Net</title>
  </head>
  <body style="background-color: #0a0c10; font-family: sans-serif; color: #a1b0c0; margin: 0; padding-bottom: 150px;">
    
    <div style="background: #11151c; border-bottom: 1px solid #1f2937; padding: 15px; text-align: center; position: sticky; top: 0;">
      CHANNEL: ${room || 'OFFLINE'}
    </div>
    
    ${!user ? `
      <div style="padding: 20px; text-align: center;">
        <form method="POST" action="/login" style="background: #11151c; padding: 20px; border: 1px solid #2d3748; display: inline-block; width: 80%;">
          <input type="text" name="username" placeholder="Operator Callsign" required style="width: 90%; margin-bottom: 10px; padding: 10px; background: #0a0c10; border: 1px solid #2d3748; color: #fff;"><br>
          <input type="password" name="passcode" placeholder="Access Channel" required style="width: 90%; margin-bottom: 10px; padding: 10px; background: #0a0c10; border: 1px solid #2d3748; color: #fff;"><br>
          <button type="submit" style="width: 100%; padding: 10px; background: #1c2b36; color: #fff; border: none;">INITIALIZE</button>
        </form>
      </div>
    ` : `
      <div style="padding: 15px;">${chatHtml}</div>
      
      <div style="position: fixed; bottom: 0; width: 100%; background: #11151c; border-top: 1px solid #2d3748; padding: 10px; text-align: center;">
        <form method="POST" action="/send" style="margin-bottom: 10px;">
          <input type="hidden" name="user" value="${user}">
          <input type="hidden" name="room" value="${room}">
          <input type="text" name="message" style="width: 60%; padding: 10px; background: #0a0c10; border: 1px solid #2d3748; color: #fff;" required>
          <button type="submit" style="padding: 10px;">TX</button>
        </form>
        
        <a href="data:text/plain;base64,${encodedExport}" download="chat_log_${room}.txt" style="color: #5c748c; text-decoration: none; font-size: 0.8em;">[ DOWNLOAD ARCHIVE ]</a>
        <span style="margin: 0 10px; color: #2d3748;">|</span>
        <a href="/chat?user=${user}&room=${room}" style="color: #5c748c; text-decoration: none; font-size: 0.8em;">[ PING FEED ]</a>
      </div>
    `}
  </body>
  </html>
  `;
};

app.get('/', (req, res) => res.send(renderPage()));
app.post('/login', (req, res) => res.redirect(`/chat?user=${req.body.username}&room=${req.body.passcode}`));
app.get('/chat', (req, res) => res.send(renderPage(req.query.user, req.query.room)));
app.post('/send', (req, res) => {
  if (!db[req.body.room]) db[req.body.room] = [];
  db[req.body.room].push({ sender: req.body.user, text: req.body.message });
  res.redirect(`/chat?user=${req.body.user}&room=${req.body.room}`);
});

app.listen(port, () => console.log('Tactical Net Active.'));
