import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import http from 'http';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET to a random secret of at least 32 characters in server/.env');
  process.exit(1);
}
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const db = new Database(process.env.DB_FILE || './pixelstar.sqlite');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'direct',
  title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS participants (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
`);

const app = express();
app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: '32kb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin, methods: ['GET', 'POST'] } });

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    if (!token) throw new Error('missing token');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again.' });
  }
}
function publicUser(row) {
  return { id: row.id, username: row.username };
}
function isMember(conversationId, userId) {
  return !!db.prepare('SELECT 1 FROM participants WHERE conversation_id=? AND user_id=?').get(conversationId, userId);
}
function conversationSummary(id, me) {
  const members = db.prepare(`
    SELECT u.id, u.username FROM users u
    JOIN participants p ON p.user_id=u.id
    WHERE p.conversation_id=? ORDER BY u.username
  `).all(id);
  const last = db.prepare(`
    SELECT m.id,m.body,m.created_at,u.username AS sender
    FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE m.conversation_id=? ORDER BY m.id DESC LIMIT 1
  `).get(id);
  const other = members.find(x => x.id !== me);
  return {
    id, kind: 'direct',
    title: other?.username || 'Conversation',
    members: members.map(publicUser),
    lastMessage: last || null
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'PixelStar API' }));

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: 'Username must be 3–20 letters, numbers or underscores.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8 || password.length > 72)
    return res.status(400).json({ error: 'Password must be 8–72 characters.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users(username,email,password_hash) VALUES(?,?,?)')
      .run(username, email, hash);
    const user = { id: Number(result.lastInsertRowid), username };
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Username or email is already registered.' });
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const login = String(req.body.login || '').trim();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(login, login.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Incorrect username/email or password.' });
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/users/search', auth, (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 30);
  if (q.length < 2) return res.json([]);
  const rows = db.prepare('SELECT id,username FROM users WHERE username LIKE ? AND id<>? LIMIT 10')
    .all(`%${q}%`, req.user.id);
  res.json(rows.map(publicUser));
});

app.get('/api/conversations', auth, (req, res) => {
  const ids = db.prepare('SELECT conversation_id FROM participants WHERE user_id=?').all(req.user.id);
  res.json(ids.map(x => conversationSummary(x.conversation_id, req.user.id)));
});

app.post('/api/conversations/direct', auth, (req, res) => {
  const username = String(req.body.username || '').trim();
  const target = db.prepare('SELECT id,username FROM users WHERE username=?').get(username);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot start a conversation with yourself.' });
  const existing = db.prepare(`
    SELECT p1.conversation_id AS id FROM participants p1
    JOIN participants p2 ON p1.conversation_id=p2.conversation_id
    JOIN conversations c ON c.id=p1.conversation_id
    WHERE p1.user_id=? AND p2.user_id=? AND c.kind='direct' LIMIT 1
  `).get(req.user.id, target.id);
  let id = existing?.id;
  if (!id) {
    const create = db.transaction(() => {
      const result = db.prepare('INSERT INTO conversations(kind) VALUES(?)').run('direct');
      const cid = Number(result.lastInsertRowid);
      const add = db.prepare('INSERT INTO participants(conversation_id,user_id) VALUES(?,?)');
      add.run(cid, req.user.id); add.run(cid, target.id);
      return cid;
    });
    id = create();
  }
  res.status(201).json(conversationSummary(id, req.user.id));
});

app.get('/api/conversations/:id/messages', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !isMember(id, req.user.id)) return res.status(404).json({ error: 'Conversation not found.' });
  const rows = db.prepare(`
    SELECT m.id,m.body,m.created_at,u.id AS sender_id,u.username AS sender
    FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE m.conversation_id=? ORDER BY m.id DESC LIMIT 100
  `).all(id).reverse();
  res.json(rows);
});

function createMessage(user, conversationId, body) {
  if (!Number.isInteger(conversationId) || !isMember(conversationId, user.id)) throw new Error('NOT_MEMBER');
  const clean = String(body || '').trim();
  if (!clean || clean.length > 2000) throw new Error('INVALID_BODY');
  const result = db.prepare('INSERT INTO messages(conversation_id,sender_id,body) VALUES(?,?,?)')
    .run(conversationId, user.id, clean);
  return db.prepare(`
    SELECT m.id,m.conversation_id,m.body,m.created_at,u.id AS sender_id,u.username AS sender
    FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?
  `).get(result.lastInsertRowid);
}
app.post('/api/conversations/:id/messages', auth, (req, res) => {
  try {
    const msg = createMessage(req.user, Number(req.params.id), req.body.body);
    io.to(`conversation:${msg.conversation_id}`).emit('message:new', msg);
    res.status(201).json(msg);
  } catch (e) {
    res.status(e.message === 'NOT_MEMBER' ? 404 : 400).json({ error: e.message === 'NOT_MEMBER' ? 'Conversation not found.' : 'Message must contain 1–2000 characters.' });
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { next(new Error('Unauthorized')); }
});
io.on('connection', socket => {
  socket.on('conversation:join', id => {
    const cid = Number(id);
    if (Number.isInteger(cid) && isMember(cid, socket.user.id)) socket.join(`conversation:${cid}`);
  });
  socket.on('message:send', ({ conversationId, body } = {}, callback = () => {}) => {
    try {
      const msg = createMessage(socket.user, Number(conversationId), body);
      io.to(`conversation:${msg.conversation_id}`).emit('message:new', msg);
      callback({ ok: true, message: msg });
    } catch {
      callback({ ok: false, error: 'Could not send message.' });
    }
  });
});

server.listen(PORT, () => console.log(`PixelStar API listening on http://localhost:${PORT}`));
