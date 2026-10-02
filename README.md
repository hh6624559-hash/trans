# 🎮 TRS6 · Đấu trường từ vựng (bản web full-stack)

## Chạy
Cần **Node.js ≥ 22.5** (không cần `npm install`, không có thư viện ngoài).

```bash
cd trs6-web
npm start            # hoặc: node --no-warnings server/server.js
# mở http://localhost:3000   (đổi cổng: PORT=8080 npm start)
```
Lần chạy đầu sẽ tự tạo `data/trs6.db` và nạp 300 từ / 2100 câu hỏi. **Tài khoản đăng ký đầu tiên là admin.**

## Cấu trúc
| Thành phần | File | Vai trò |
|---|---|---|
| Database | `server/db.js` → `data/trs6.db` (SQLite) | users, words, questions, user_usage, attempts, attempt_answers, matches |
| Back end | `server/server.js` | REST API, đăng ký/đăng nhập (scrypt + token HMAC), phòng đấu realtime (SSE), phục vụ file tĩnh |
| Front end | `public/index.html`, `css/style.css`, `js/app.js`, `js/api.js`, `js/room-ws.js` | Giao diện học / thi solo / đấu bạn bè |

## API chính (cần header `Authorization: Bearer <token>`)
`POST /api/auth/register|login` · `GET /api/me` · `GET /api/words` · `GET|PUT /api/usage` ·
`POST /api/attempts` · `POST /api/matches` · `GET /api/stats` · `GET /api/leaderboard` ·
Admin: `POST /api/words`, `PUT|DELETE /api/words/:id` ·
Phòng đấu: `POST|GET /api/rooms/:code`, `GET /api/rooms/:code/stream` (SSE), `POST .../presence`, `POST .../chat`

## Triển khai thật
Chạy sau reverse proxy HTTPS (Nginx/Caddy), đặt `JWT_SECRET` và `DATA_DIR` (thư mục lưu DB) bằng biến môi trường, nhớ backup file `.db`.
