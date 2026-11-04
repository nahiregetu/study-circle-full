# Study Circle

**A study-accountability platform for Ethiopian high school students.**
Study with a squad, keep your streak alive, and share exam-prep material with students from schools across the country.

- **Live demo:** https://study-circle-full.onrender.com
  *(Hosted on a free plan, so the first load can take 30-60 seconds to wake up.)*
- **Video presentation (5 min):** PASTE_YOUR_VIDEO_LINK_HERE

---

## Purpose

Many students prepare for national exams alone. It is easy to lose motivation, and good practice material is hard to find. Study Circle solves both problems:

1. **Accountability:** small squads of up to 10 friends check in daily. When most of the squad checks in, the squad's streak grows, so nobody wants to be the one who breaks it.
2. **Shared resources:** students upload and download past exams, model exams and worksheets, organised by grade and subject.

## Main features

| Feature | What it does |
|---|---|
| **Accounts** | Sign up and log in. Passwords are hashed (bcrypt) and sessions use JWT tokens. |
| **Squads** | Create a squad, invite friends with a 6-character code, join or leave. |
| **Daily check-in and streak** | A squad's streak grows on days when at least 80% of members check in. Best streak is tracked. |
| **Nudges** | Remind a squad mate who has not checked in yet. |
| **Planner** | Personal daily goals with a progress bar. |
| **Study room** | Focus timer (25/45/60 min) that awards points, plus a private video-call room for each squad. |
| **Community Q&A** | Ask questions by subject and answer other students. |
| **Exam library** | Upload PDF/JPG/PNG files (max 10 MB), filter by grade, subject and type, and download. |
| **Points and leaderboard** | Points for check-ins, goals, study sessions, helping others and sharing resources. Squads are ranked by total points. |

## Technology

- **Frontend:** HTML, CSS and vanilla JavaScript (single page, works on phones, light and dark mode)
- **Backend:** Node.js and Express (REST API)
- **Database:** PostgreSQL
- **Hosting:** Render (web service) and Neon (database)

## Project structure

```
backend/
  server.js        API and file uploads
  schema.sql       database tables (created automatically on start)
  public/index.html   the whole frontend
docker-compose.yml   run everything locally with one command
```

## Run it locally

With Docker:

```
docker compose up --build
```

Then open http://localhost:3000.

Without Docker (needs Node.js and PostgreSQL):

```
cd backend
npm install
# set DATABASE_URL, UPLOAD_DIR and JWT_SECRET, then:
node server.js
```

Environment variables: `DATABASE_URL` (PostgreSQL connection string), `JWT_SECRET` (long random text), `UPLOAD_DIR` (folder for uploaded files), `PORT` (optional).

## Team

| Full name | CTC ID | Role |
|---|---|---|
| Nahire Getu Regassa | CTC-3016-26 | Idea, design, frontend, backend, database, deployment |

## Known limitations and future work
Uploaded files on the free hosting plan are cleared when the server restarts. A production version would store them in cloud storage.
Planned next: push notifications for nudges, a mobile app, and more subjects and grades.

- Uploaded files on the free hosting plan are cleared when the server restarts. A production version would store them in cloud storage.
- Planned next: push notifications for nudges, a mobile app, and more subjects and grades.
