const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

let memoryStore = {};

const renderPage = (user, room, error = '') => {
  const history = memoryStore[room] || [];
  
  let chatHtml = history.map(m => {
    const isMe = m.sender === user;
    return `
      <div style="text-align: ${isMe ? 'right' : 'left'}; margin-bottom: 10px; clear: both;">
        <div style="display: inline-block; background-color: ${isMe ? '#1c2b36' : '#161b22'}; padding: 10px; border-radius: 6px; border: 1px solid #2c4251; max-width: 80%; text-align: left;">
          <span style="font-size: 0.7em; color: #5c748c;">${m.sender}</span><br>
          <span style="color: #a1b0c0;">${m.text}</span>
        </div>
      </div>
    `;
  }).join('');

  return `
  <html><body style="background-color: #0a0c10; font-family: sans-serif; color: #a1b0c0; padding: 10px; margin: 0;">
    <div style="background: #11151c; padding: 10px; border-bottom: 1px solid #1f2937; display: flex; justify-content: space-between; align-items: center;">
      <small>CHANNEL: ${room}</small>
      <div>
        <a href="/download?room=${room}" style="color: #5c748c; font-size: 0.8em; margin-right: 15px; text-decoration: none;">SAVE</a>
        <a href="/purge?room=${room}" style="color: #ff4c4c; font-size: 0.8em; font-weight: bold; text-decoration: none;">KIL SWITCH</a>
      </div>
    </div>
    <div style="padding: 10px; padding-bottom: 130px;">${chatHtml}</div>
    <div style="position:fixed; bottom:0; left:0; width:100%; background:#11151c; padding:10px; border-top: 1px solid #1f2937;">
      <form method="POST" action="/send" style="display: flex; gap: 5px;">
        <input type="hidden" name="user" value="${user}"><input type="hidden" name="room" value="${room}">
        <input type="text" name="message" style="flex-grow: 1; padding: 10px; background:#0a0c10; border:1px solid #2d3748; color:#fff;" required>
        <button type="submit" style="padding: 8px 15px; background: #1c2b36; border: 1px solid #2c4251; color: #8b9aab;">TX</button>
      </form>
      <button onclick="window.location.reload()" style="width:100%; margin-top:10px; padding: 8px; background: transparent; border: 1px solid #2d3748; color: #5c748c; cursor: pointer;">PING FEED</button>
    </div>
  </body></html>`;
};

app.post('/login', (req, res) => {
  const { username, passcode } = req.body;
  if (!memoryStore[passcode]) memoryStore[passcode] = [];
  res.redirect(`/chat?user=${username}&room=${passcode}`);
});

app.get('/chat', (req, res) => res.send(renderPage(req.query.user, req.query.room)));

app.post('/send', (req, res) => {
  const { user, room, message } = req.body;
  if (memoryStore[room]) memoryStore[room].push({ sender: user, text: message });
  res.redirect(`/chat?user=${user}&room=${room}`);
});

// Download Log
app.get('/download', (req, res) => {
  const room = req.query.room;
  const data = (memoryStore[room] || []).map(m => `[${m.sender}]: ${m.text}`).join('\n');
  res.setHeader('Content-disposition', 'attachment; filename=comms_log.txt');
  res.setHeader('Content-Type', 'text/plain');
  res.send(data);
});

// Hard KIL SWITCH
app.get('/purge', (req, res) => {
  // Wipes all data for the specified channel immediately
  delete memoryStore[req.query.room];
  // Redirects all clients to the login page
  res.redirect('/');
});

app.listen(port);
