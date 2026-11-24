-- Initial schema for the NoSQL course platform.

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  name            text NOT NULL,
  password_hash   text NOT NULL,
  role            text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  current_class_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE classes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  teacher_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  join_code       text NOT NULL UNIQUE,
  stage_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classes_teacher_idx ON classes (teacher_id);

ALTER TABLE users
  ADD CONSTRAINT users_current_class_fk FOREIGN KEY (current_class_id) REFERENCES classes (id) ON DELETE SET NULL;

CREATE TABLE enrollments (
  class_id   uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, user_id)
);
CREATE INDEX enrollments_user_idx ON enrollments (user_id);

-- One canonical learner state per student per class (see src/lib/progressRules.js).
CREATE TABLE progress (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, class_id)
);

-- Quiz attempts are drawn and graded on the server; answers never reach the browser early.
CREATE TABLE quiz_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  questions     jsonb NOT NULL,          -- [{ id, start? }]
  answers       jsonb NOT NULL DEFAULT '{}'::jsonb,
  score         int,
  total         int,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX quiz_attempts_user_idx ON quiz_attempts (user_id, class_id);

CREATE TABLE submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id          uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  fields            jsonb NOT NULL,
  checks            jsonb NOT NULL,
  auto_score        int NOT NULL,
  teacher_scores    jsonb,
  teacher_score     int,
  teacher_feedback  text,
  status            text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'withdrawn')),
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  graded_at         timestamptz,
  UNIQUE (class_id, user_id)
);

-- Peer review: each reviewer gets three targets, real classmates first, samples to fill.
CREATE TABLE review_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id       uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  reviewer_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  submission_id  uuid REFERENCES submissions (id) ON DELETE CASCADE,
  sample_id      text,
  position       int NOT NULL,
  scores         jsonb,
  comment        text,
  accuracy       int,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((submission_id IS NULL) <> (sample_id IS NULL)),
  UNIQUE (class_id, reviewer_id, position)
);
CREATE INDEX review_assignments_submission_idx ON review_assignments (submission_id);

CREATE TABLE posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES posts (id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_class_idx ON posts (class_id, created_at);

CREATE TABLE post_likes (
  post_id  uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);
