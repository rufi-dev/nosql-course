# NoSQL, NewSQL and Distributed Architectures: interactive course site

A browser-first course site for this 90-minute lesson. You explain the model, build a working example in a browser, and defend the trade-offs. The structure follows the *Design of Adaptive Systems* MOOC reference (course home, module page, lecture, book, H5P-style diagram, virtual lab, quiz, assignment, workshop, forum, grades, badges). The pedagogy follows *How to Develop an Interactive Lesson*.

Module 1 is fully built. Modules 2–8 appear on the course map as previews.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve the production build locally
```

The build is a static site: `base: './'` plus hash routing. Upload `dist/` to any static host, such as GitHub Pages, Netlify, an LMS file area or a university web server. No server or database is needed.

The production build registers a small service worker (`public/sw.js`), so after the first visit the course keeps working offline.

## What is in Module 1

| Step | Activity | Where |
|---|---|---|
| Begin | Situation, outcomes table, 3-question diagnostic with tips | `src/pages/Start.jsx` |
| Watch | Two animated, captioned lectures with embedded questions | `src/pages/Lecture.jsx`, `src/data/lectures.js` |
| Read | 8 chapters with a model switcher, architecture path, cost table | `src/pages/Reading.jsx`, `src/pages/reading/` |
| Explore | Hotspot diagram of a sharded cluster, with query tracing | `src/pages/Explore.jsx` |
| Experiment | Lab 1 MongoDB-style shell (insertMany, find, updateOne, explain) | `src/pages/labs/ShellLab.jsx`, `src/engine/` |
| | Lab 2 shard key mapper | `src/pages/labs/ShardLab.jsx` |
| | Lab 3 replica lag and network partitions | `src/pages/labs/ReplicaLab.jsx` |
| | Lab 4 quorums (N, W, R) | `src/pages/labs/QuorumLab.jsx` |
| | Lab 5 two-phase commit vs. a SQL transaction | `src/pages/labs/TxLab.jsx` |
| Check | Quiz: 10 questions drawn from a bank of 20, with explanations | `src/pages/Quiz.jsx`, `src/data/quiz.js` |
| Apply | Assignment with rubric, strong example and auto pre-check | `src/pages/Assignment.jsx`, `src/data/peers.js` |
| Review | Workshop peer review: 3 samples, accuracy vs. instructor | `src/pages/Workshop.jsx` |
| Discuss | Forum with a guided question and TA replies | `src/pages/Discussion.jsx`, `src/data/forum.js` |
| Reflect | Takeaways, self-assessment, feedback form | `src/pages/WrapUp.jsx` |

The site also has a course home, grades (labs 40%, quiz 30%, assignment 20%, peer review 10%), badges, a printable certificate, a free playground, and a **90-minute lesson plan** with a class timer and projector mode for teaching live.

## Step-by-step access (stage gating)

Module 1 runs in five stages. A stage opens only when every activity in the stages before it is finished. Inside a stage, the order is free.

| Stage | Activities | Opens when |
|---|---|---|
| 1 Begin | Start here | Always open |
| 2 Learn | Lectures 1.1 and 1.2, Reading, Cluster diagram | Begin is finished |
| 3 Practise | Labs 1–5 | Begin and Learn are finished |
| 4 Check and apply | Quiz, Assignment, Peer review, Discussion | All labs are finished |
| 5 Reflect | Wrap-up | Everything above is finished |

"Finished" is enforced:
- **Lectures:** at least 90% of the lecture must actually be played. Skipping ahead does not count.
- **Reading:** all 8 chapters opened.
- **Diagram:** all 9 hotspots opened.
- **Labs:** every checkpoint reached.
- **Quiz:** passed at 70%.
- **Assignment:** submitted.
- **Peer review:** 3 reviews saved.

Locked activities show what is still missing.

**Opening a stage early (teacher):** on the **Teach** page (lesson plan), the *Stage access* panel shows each stage's status and class code. Read the code out in class; students enter it on the locked screen to open that stage on their device. *Open on this device* opens it only in the teacher's browser. Once a stage is open it stays open. Change the codes in `src/data/course.js` (`STAGES`) before each run.

Because there is no server, gating guides students but does not secure anything: someone who clears or edits their browser storage can get around it.

## Editing content

- Course facts, outcomes, modules, activity order, lab checkpoints, badges and the 90-minute plan: `src/data/course.js`.
- Quiz bank: `src/data/quiz.js`. Rubric, sample peer submissions and the strong example: `src/data/peers.js`. Forum seed posts: `src/data/forum.js`. Lecture scripts, captions and embedded questions: `src/data/lectures.js`.
- Design tokens (colours, type, motion): `src/styles/tokens.css`. Shared components: `src/styles/components.css`.

## Data and privacy

Everything a learner does is stored in their browser's `localStorage` under the `nosql-course-v1` key (the Playground uses `nosql-playground-v1`). Nothing is sent anywhere. Learners can export or import their progress, or reset it, from **Settings**. Forum posts and peer reviews are therefore local. A shared forum or real peer exchange needs a backend.

The assignment grade is an automatic, provisional check against the rubric. A teacher should confirm it.
