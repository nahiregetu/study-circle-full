# Study Circle (full app)

Frontend (the Study Circle design) + Node.js/Express API + PostgreSQL, all in one `docker compose`.

## Run it
```
docker compose up --build
```
Open http://localhost:3000, create an account, create a squad, and share the invite code with friends.

## What works (all real, saved in the database)
- Sign up / log in (JWT, bcrypt-hashed passwords)
- Squads: create, join by invite code (max 10), leave, daily check-in, nudge a squad mate
- Streak: grows on days when at least 80% of the squad checks in; best streak tracked
- Planner: personal daily goals (+5 pts when done)
- Study room: focus timer (+15 pts on completion) and a private Jitsi video room per squad
- Community Q&A: ask and answer (+10 pts per reply)
- Exam library: upload PDF/JPG/PNG (max 10 MB), filter by grade/subject/type, download counter
- Leaderboard: squads ranked by total member points

## Before going live
1. Change `JWT_SECRET` in `docker-compose.yml` to a long random string.
2. Change the Postgres password (in both `db` and `DATABASE_URL`).
3. Put it behind HTTPS (e.g. Caddy or Nginx) on a VPS; data lives in the `pgdata` and `uploads` Docker volumes, so back them up.

## Project layout
- `backend/server.js` API, `backend/schema.sql` tables (created automatically on start)
- `backend/public/index.html` the whole frontend (served by the API, so no CORS setup)
