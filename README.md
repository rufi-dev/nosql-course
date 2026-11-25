# NoSQL, NewSQL and Distributed Architectures: interactive course platform

A full-stack course site for the 90-minute lesson *NoSQL, NewSQL and Distributed Architectures*. Students explain the model, build a working example in a browser, and defend the trade-offs. Teachers run classes, open stages, grade work and follow progress.

- **Frontend:** React 19 + Vite, with motion animations and a custom design system.
- **Backend:** Node.js (Express 5) JSON API.
- **Database:** PostgreSQL. Migrations run automatically on start.
- **Hosting:** Vercel (the app on Vercel's CDN, the API as one function) with a Neon PostgreSQL database. Render also works (`render.yaml`).

The structure follows the *Design of Adaptive Systems* MOOC reference (course home, module page, lecture, book, H5P-style diagram, virtual labs, quiz, assignment, workshop, forum, grades, badges). The pedagogy follows *How to Develop an Interactive Lesson*.

## What it does

### Students
- Sign up with the class code from their teacher. They can join more classes later, and progress is kept per class.
- Work through Module 1 in five stages, each opening when the previous one is finished:

  | Stage | Activities |
  |---|---|
  | Begin | Start here |
  | Learn | Two lectures, reading, cluster diagram |
  | Practise | Five browser labs |
  | Check and apply | Quiz, assignment, peer review, discussion |
  | Reflect | Wrap-up |

- Progress saves automatically and follows them to any device. Offline changes retry when the connection returns.
- The quiz is drawn and graded by the server, so answers never reach the browser before they are answered.
- They submit the assignment, review three classmates (sample submissions fill in when the class is small), discuss in the class forum, and see their grades, badges and a printable certificate.

### Teachers
- Create their own account: choose **Teacher** on the sign-up page (or open `/signup?as=teacher`). Each teacher sees only their own classes.
- Create classes, each with a private join code that can be regenerated at any time.
- See the class list: every student's progress per stage, current activity, quiz, submission and grade. A chart shows where students stop.
- Open a stage for the whole class at once (dashboard or lesson plan page). Students' screens update within a minute.
- Grade assignments with the rubric, which overrides the automatic pre-check. Read peer reviews and reflections.
- Export grades as CSV, reset a student's password, remove a student from a class.
- Preview the whole course with everything unlocked. Nothing is saved in preview.

### Admin
The account that signs up with `ADMIN_EMAIL` becomes the admin teacher. The admin can change anyone's role on **Users and roles**.

Teacher sign-up is open by default, so testers can each create a teacher account, make a class and register students with its code. To stop new teacher accounts (for example once real students use the site), set `TEACHER_SIGNUP=closed`; the admin then makes teachers on **Users and roles**.

## Security model
- **Passwords:** hashed with scrypt.
- **Sessions:** random tokens in httpOnly, SameSite=Lax, Secure (in production) cookies. Only a SHA-256 of each token is stored.
- **Cross-site protection:** every state-changing request must be JSON, which blocks cross-site form posts.
- **Rate limits:** login, sign-up and password routes are rate-limited.
- **Content-Security-Policy:** set by Helmet. `unsafe-eval` is allowed only because the in-browser MongoDB shell evaluates learner code.
- **Server-side locks:** stage locks and completion rules are enforced by the server (`src/lib/progressRules.js`). A student cannot save work in a stage their class has not reached, or tick an activity without the evidence (90% of a lecture watched, all chapters opened, all lab checkpoints, a passed quiz, and so on).
- **Join codes:** live only in the database. Teachers see them; students never receive them.

Limitations:
- The labs run in the student's browser, so a determined student could forge lab checkpoints through the API. Quiz grading, submissions, reviews and forum posts are server-side.
- On Vercel, rate limits are counted per function instance rather than across the whole site.

## Run locally

Requirements: Node.js 22.12 or newer (24 recommended; Render uses 24). You do **not** need to install PostgreSQL: `npm run dev:db` downloads and runs an embedded one (data in `.local-pg/`).

```bash
npm install
cp .env.example .env     # set ADMIN_EMAIL to the email you will sign up with
npm run dev              # PostgreSQL :5433 + API :3001 + Vite :5173
```

Open http://localhost:5173, sign up with your `ADMIN_EMAIL`, then:
1. Create a class on the dashboard.
2. In a private window, sign up a student using the class join code.

Other scripts:

| Script | What it does |
|---|---|
| `npm test` | API integration tests against the local test database. Needs `npm run dev:db` running. |
| `npm run build` then `npm start` | Production mode: Express serves the API and the built app on one port. |
| `npm run lint` | oxlint over `src`, `server` and `api`. |

## Deploy on Vercel (recommended)

The pages load instantly from Vercel's CDN. The API runs as one function (`api/index.js`), and the database is Neon PostgreSQL. Both have free plans, and nothing needs to stay running.

1. Push this repository to GitHub.
2. On vercel.com: **Add New → Project**, import the repository. Vercel reads `vercel.json` (Vite build, `/api` function, security headers).
3. Under **Environment Variables** add `ADMIN_EMAIL`, then **Deploy**. Until a database is connected, the pages load but sign-in shows an error.
4. In the project: **Storage → Create Database → Neon**. Pick the free plan and a region near the functions (Vercel's default is Washington, D.C., so AWS US East 1), and connect it to all environments with the default variable names. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
5. **Deployments → Redeploy**. The first API request creates the tables.
6. Open the site and sign up with your `ADMIN_EMAIL`. You are the admin teacher.

Free plan notes:
- Neon pauses the database after 5 minutes without queries and wakes it in about a second. The free plan includes 100 compute hours a month per project and 1 GB of storage, and it does not expire.
- Vercel's free Hobby plan is for personal, non-commercial use.

## Deploy on Render (alternative)

1. In Render, choose **New → Blueprint** and pick the repository. Render reads `render.yaml` and creates a PostgreSQL database `nosql-course-db` and a web service `nosql-course`, with `DATABASE_URL` linked automatically.
2. When asked, set **`ADMIN_EMAIL`**, then sign up with that email after the first deploy.

Free tier limits: the web service sleeps after 15 minutes without traffic (the next visit waits about a minute), and free databases expire 30 days after creation.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Set by the Neon integration on Vercel, or by the Render Blueprint. |
| `DATABASE_URL_UNPOOLED` | no | Direct connection used for migrations. Set by the Neon integration. |
| `ADMIN_EMAIL` | yes | This account becomes the admin teacher on sign-up. |
| `TEACHER_SIGNUP` | no | `open` (default): anyone can create a teacher account. `closed`: only the admin can make teachers. |
| `DATABASE_SSL` | no | Set to `true` only for a TLS URL without `sslmode` in it. Neon URLs need nothing extra. |
| `PORT` | no | Set by Render. |

## Project layout

```
api/index.js          Vercel function: runs the Express API, applies migrations on cold start
vercel.json           Vercel build, routing and security headers
server/
  index.js            Express app: security headers, rate limits, /api, static app
  db.js, migrations/  PostgreSQL pool and SQL migrations (applied on start)
  auth.js             passwords, sessions, access control
  learner.js          loads evidence, builds canonical progress
  routes/             auth, classes, progress + quiz, work (assignment, workshop, forum), teacher + admin
  data/quiz.js        the quiz bank (server-only, never bundled)
src/
  lib/progressRules.js  shared stage gating and completion rules (server enforces)
  lib/session.js, sync.js, api.js   accounts and automatic progress sync
  pages/              learner pages, auth pages, teacher dashboard (pages/teacher)
  data/course.js      course facts, outcomes, activities, stages, labs, badges, 90-minute plan
render.yaml           Render Blueprint (alternative host)
tests/api.test.mjs    API integration tests
```

## Editing content
- **Course structure:** activities, stages, outcomes, lab checkpoints, badges and the lesson plan are in `src/data/course.js`.
- **Quiz bank:** `server/data/quiz.js`.
- **Rubric, sample submissions and strong example:** `src/data/peers.js`.
- **Lecture scripts and captions:** `src/data/lectures.js`.
- **Forum examples:** `src/data/forum.js`.
- **Design tokens:** `src/styles/tokens.css`.
