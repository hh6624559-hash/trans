// Backend TRS6 – chỉ dùng module có sẵn của Node (http, crypto, zlib, node:sqlite). Chạy: npm start
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { db, getWords, invalidateWords } = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

/* ---------- Xác thực: mật khẩu băm scrypt + token ký HMAC ---------- */
const SECRET = process.env.JWT_SECRET || (() => {
  const f = path.join(DATA_DIR, '.secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
})();
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeToken(user) {
  const body = b64({ uid: user.id, exp: Date.now() + 30 * 24 * 3600 * 1000 });
  return body + '.' + sign(body);
}
function readToken(t) {
  if (!t || !t.includes('.')) return null;
  const [body, sig] = t.split('.');
  const ok = sig && sign(body).length === sig.length && crypto.timingSafeEqual(Buffer.from(sign(body)), Buffer.from(sig));
  if (!ok) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const publicUser = u => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role });

function authUser(req, url) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  const p = readToken(t);
  return p ? db.prepare('SELECT * FROM users WHERE id=?').get(p.uid) : null;
}

/* ---------- Phòng đấu bạn bè (realtime bằng Server-Sent Events) ---------- */
const rooms = new Map(); // code -> {presences:{clientId:{...}}, streams:Map(clientId,res), lastActive}
const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
function broadcastState(room) {
  room.streams.forEach(res => sse(res, 'state', room.presences));
}
setInterval(() => { // dọn phòng trống quá 10 phút
  for (const [code, r] of rooms) if (!r.streams.size && Date.now() - r.lastActive > 600000) rooms.delete(code);
}, 60000);

/* ---------- Tiện ích HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function send(req, res, code, body, type = 'application/json; charset=utf-8') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const h = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (buf.length > 1024 && /gzip/.test(req.headers['accept-encoding'] || '')) {
    h['Content-Encoding'] = 'gzip';
    res.writeHead(code, h); return res.end(zlib.gzipSync(buf));
  }
  res.writeHead(code, h); res.end(buf);
}
const readBody = req => new Promise((ok, fail) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > 2e6) { req.destroy(); fail(new Error('too large')); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { fail(e); } });
});
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const need = (c, code, msg) => { if (!c) throw new HttpError(code, msg); };

/* ---------- Các API ---------- */
async function api(req, res, url) {
  const m = req.method, p = url.pathname;
  const body = (m === 'POST' || m === 'PUT') ? await readBody(req) : {};
  const json = (data, code = 200) => send(req, res, code, data);

  // --- Đăng ký / đăng nhập ---
  if (m === 'POST' && p === '/api/auth/register') {
    const username = String(body.username || '').trim(), pw = String(body.password || '');
    const display = String(body.displayName || username).trim().slice(0, 30);
    need(/^[a-zA-Z0-9_.]{3,24}$/.test(username), 400, 'Tên đăng nhập 3–24 ký tự (chữ, số, _ .)');
    need(pw.length >= 6, 400, 'Mật khẩu tối thiểu 6 ký tự');
    need(!db.prepare('SELECT 1 FROM users WHERE username=?').get(username), 409, 'Tên đăng nhập đã tồn tại');
    const salt = crypto.randomBytes(16).toString('hex');
    const isFirst = db.prepare('SELECT COUNT(*) c FROM users').get().c === 0; // người đầu tiên = admin
    const r = db.prepare('INSERT INTO users(username,display_name,pass_hash,salt,role) VALUES(?,?,?,?,?)')
      .run(username, display || username, hashPw(pw, salt), salt, isFirst ? 'admin' : 'user');
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
    return json({ token: makeToken(u), user: publicUser(u) }, 201);
  }
  if (m === 'POST' && p === '/api/auth/login') {
    const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(body.username || '').trim());
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(String(body.password || ''), u.salt)), Buffer.from(u.pass_hash));
    need(ok, 401, 'Sai tên đăng nhập hoặc mật khẩu');
    return json({ token: makeToken(u), user: publicUser(u) });
  }

  // Từ đây trở xuống cần đăng nhập
  const user = authUser(req, url);
  need(user, 401, 'Chưa đăng nhập');

  if (m === 'GET' && p === '/api/me') return json({ user: publicUser(user) });

  // --- Từ vựng ---
  if (m === 'GET' && p === '/api/words') return json(getWords());
  if (p.startsWith('/api/words')) { // quản trị
    need(user.role === 'admin', 403, 'Chỉ admin được sửa từ vựng');
    const id = Number(p.split('/')[3]);
    if (m === 'POST' && p === '/api/words') {
      need(body.w && Array.isArray(body.variants) && body.variants.length, 400, 'Cần {w, variants[]}');
      const pos = db.prepare('SELECT COALESCE(MAX(position),-1)+1 n FROM words').get().n;
      const r = db.prepare('INSERT INTO words(word,position) VALUES(?,?)').run(body.w, pos);
      body.variants.forEach((v, k) => db.prepare('INSERT INTO questions(word_id,idx,data) VALUES(?,?,?)').run(r.lastInsertRowid, k, JSON.stringify(v)));
      invalidateWords(); return json({ id: Number(r.lastInsertRowid) }, 201);
    }
    if (m === 'PUT' && id) {
      need(Array.isArray(body.variants), 400, 'Cần variants[]');
      db.exec('BEGIN');
      if (body.w) db.prepare('UPDATE words SET word=? WHERE id=?').run(body.w, id);
      db.prepare('DELETE FROM questions WHERE word_id=?').run(id);
      body.variants.forEach((v, k) => db.prepare('INSERT INTO questions(word_id,idx,data) VALUES(?,?,?)').run(id, k, JSON.stringify(v)));
      db.exec('COMMIT'); invalidateWords(); return json({ ok: true });
    }
    if (m === 'DELETE' && id) { db.prepare('DELETE FROM words WHERE id=?').run(id); invalidateWords(); return json({ ok: true }); }
  }

  // --- Vòng xoay câu hỏi của từng người học ---
  if (m === 'GET' && p === '/api/usage') {
    const out = {};
    db.prepare('SELECT word,data FROM user_usage WHERE user_id=?').all(user.id).forEach(r => { out[r.word] = JSON.parse(r.data); });
    return json(out);
  }
  if (m === 'PUT' && p === '/api/usage') {
    const up = db.prepare('INSERT INTO user_usage(user_id,word,data) VALUES(?,?,?) ON CONFLICT(user_id,word) DO UPDATE SET data=excluded.data');
    db.exec('BEGIN');
    Object.entries(body).forEach(([w, d]) => up.run(user.id, w, JSON.stringify(d)));
    db.exec('COMMIT'); return json({ ok: true });
  }

  // --- Kết quả thi solo + đấu bạn bè ---
  if (m === 'POST' && p === '/api/attempts') {
    const total = Number(body.total), correct = Number(body.correct);
    need(total > 0 && correct >= 0 && correct <= total, 400, 'Dữ liệu không hợp lệ');
    db.exec('BEGIN');
    const r = db.prepare('INSERT INTO attempts(user_id,total,correct) VALUES(?,?,?)').run(user.id, total, correct);
    const ia = db.prepare('INSERT INTO attempt_answers(attempt_id,word,is_correct) VALUES(?,?,?)');
    (body.words || []).slice(0, 300).forEach(x => ia.run(r.lastInsertRowid, String(x.w), x.ok ? 1 : 0));
    db.exec('COMMIT'); return json({ id: Number(r.lastInsertRowid) }, 201);
  }
  if (m === 'POST' && p === '/api/matches') {
    db.prepare('INSERT INTO matches(user_id,room_code,rounds,players,total_score) VALUES(?,?,?,?,?)')
      .run(user.id, String(body.roomCode || '').slice(0, 12), Number(body.rounds) || 1, Number(body.players) || 1, Number(body.totalScore) || 0);
    return json({ ok: true }, 201);
  }

  // --- Thống kê & bảng xếp hạng ---
  if (m === 'GET' && p === '/api/stats') {
    const history = db.prepare('SELECT id,total,correct,created_at FROM attempts WHERE user_id=? ORDER BY id DESC LIMIT 20').all(user.id);
    const sum = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(total),0) t, COALESCE(SUM(correct),0) c FROM attempts WHERE user_id=?').get(user.id);
    const weak = db.prepare(`SELECT word, COUNT(*) wrong FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id
      WHERE a.user_id=? AND aa.is_correct=0 GROUP BY word ORDER BY wrong DESC LIMIT 10`).all(user.id);
    const matches = db.prepare('SELECT room_code,rounds,players,total_score,created_at FROM matches WHERE user_id=? ORDER BY id DESC LIMIT 10').all(user.id);
    return json({ summary: sum, history, weak, matches });
  }
  if (m === 'GET' && p === '/api/leaderboard') {
    const rows = db.prepare(`SELECT u.display_name name, COUNT(a.id) tests, SUM(a.total) total, SUM(a.correct) correct,
      ROUND(100.0*SUM(a.correct)/SUM(a.total)) pct FROM attempts a JOIN users u ON u.id=a.user_id
      GROUP BY u.id HAVING SUM(a.total)>=20 ORDER BY correct DESC, pct DESC LIMIT 20`).all();
    return json(rows);
  }

  // --- Phòng đấu bạn bè ---
  const rm = p.match(/^\/api\/rooms\/([A-Za-z0-9]{3,12})(?:\/(stream|presence|chat))?$/);
  if (rm) {
    const code = rm[1].toUpperCase(), sub = rm[2];
    if (!sub && m === 'POST') {
      need(!rooms.has(code), 409, 'Mã phòng đã tồn tại');
      rooms.set(code, { presences: {}, streams: new Map(), lastActive: Date.now() });
      return json({ code }, 201);
    }
    const room = rooms.get(code);
    need(room, 404, 'Không tìm thấy phòng');
    room.lastActive = Date.now();
    if (!sub && m === 'GET') return json({ code, players: room.streams.size });
    const cid = String(body.clientId || url.searchParams.get('clientId') || '').slice(0, 40);
    need(cid, 400, 'Thiếu clientId');
    if (sub === 'stream' && m === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      room.streams.set(cid, res);
      sse(res, 'ready', { clientId: cid });
      sse(res, 'state', room.presences);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => {
        clearInterval(ping); room.streams.delete(cid); delete room.presences[cid];
        room.lastActive = Date.now(); broadcastState(room);
      });
      return; // giữ kết nối mở
    }
    if (sub === 'presence' && m === 'POST') {
      room.presences[cid] = body.data || {}; broadcastState(room); return json({ ok: true });
    }
    if (sub === 'chat' && m === 'POST') {
      room.streams.forEach((r, id) => { if (id !== cid) sse(r, 'chat', body.data); });
      return json({ ok: true });
    }
  }
  throw new HttpError(404, 'Không tìm thấy API');
}

/* ---------- Phục vụ giao diện tĩnh ---------- */
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(req, res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  send(req, res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (res.headersSent) return res.end();
    const code = e instanceof HttpError ? e.code : 500;
    if (code === 500) console.error(e);
    send(req, res, code, { error: code === 500 ? 'Lỗi máy chủ' : e.message });
  }
}).listen(PORT, () => console.log(`TRS6 chạy tại http://localhost:${PORT}`));
