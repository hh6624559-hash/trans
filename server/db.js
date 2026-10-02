// Cơ sở dữ liệu SQLite (node:sqlite có sẵn trong Node >= 22.5, không cần cài thêm gói nào)
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'trs6.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS words(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  data TEXT NOT NULL            -- JSON: câu hỏi, đáp án, giải thích, dịch...
);
CREATE INDEX IF NOT EXISTS idx_questions_word ON questions(word_id, idx);
CREATE TABLE IF NOT EXISTS user_usage(   -- vòng xoay câu hỏi đã dùng của từng người học
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(user_id, word)
);
CREATE TABLE IF NOT EXISTS attempts(     -- lịch sử thi solo
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attempt_answers(
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  is_correct INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS matches(      -- kết quả đấu bạn bè
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_code TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  players INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Nạp 300 từ / 2100 câu hỏi lần đầu chạy
function seed() {
  const n = db.prepare('SELECT COUNT(*) c FROM words').get().c;
  if (n > 0) return;
  const words = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed-words.json'), 'utf8'));
  const iw = db.prepare('INSERT INTO words(word, position) VALUES(?,?)');
  const iq = db.prepare('INSERT INTO questions(word_id, idx, data) VALUES(?,?,?)');
  db.exec('BEGIN');
  words.forEach((w, i) => {
    const { lastInsertRowid } = iw.run(w.w, i);
    w.variants.forEach((v, k) => iq.run(lastInsertRowid, k, JSON.stringify(v)));
  });
  db.exec('COMMIT');
  console.log(`[db] Đã nạp ${words.length} từ vào database`);
}
seed();

// Ghép lại đúng định dạng [{w, variants:[...]}] mà giao diện đang dùng (có cache)
let wordsCache = null;
function getWords() {
  if (wordsCache) return wordsCache;
  const ws = db.prepare('SELECT id, word FROM words ORDER BY position, id').all();
  const qs = db.prepare('SELECT word_id, data FROM questions ORDER BY word_id, idx').all();
  const map = new Map(ws.map(w => [w.id, { id: w.id, w: w.word, variants: [] }]));
  qs.forEach(q => map.get(q.word_id).variants.push(JSON.parse(q.data)));
  wordsCache = ws.map(w => map.get(w.id));
  return wordsCache;
}
const invalidateWords = () => { wordsCache = null; };

module.exports = { db, getWords, invalidateWords };
