-- IECSE Recruitment — Applications schema
-- Works with both PostgreSQL and SQLite (the seed script handles dialect).

CREATE TABLE IF NOT EXISTS applications (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name           TEXT    NOT NULL,
  year                TEXT    NOT NULL CHECK (year IN ('1st Year', '2nd Year')),
  registration_number TEXT    NOT NULL UNIQUE,
  branch              TEXT    NOT NULL,
  domain              TEXT    NOT NULL,
  learner_email       TEXT    NOT NULL UNIQUE,
  phone_number        TEXT    NOT NULL UNIQUE,
  why_join            TEXT    NOT NULL,
  github_url          TEXT,
  linkedin_url        TEXT,
  portfolio_url       TEXT,
  other_links         TEXT,
  certifications      TEXT,
  projects            TEXT,
  tier                TEXT    NOT NULL CHECK (tier IN ('member', 'workcomm', 'mancomm')),
  payment_status      TEXT    NOT NULL DEFAULT 'pending',
  payment_id          TEXT,
  interview_status    TEXT    NOT NULL DEFAULT 'pending',
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- PostgreSQL equivalent (use this for production):
-- CREATE TABLE IF NOT EXISTS applications (
--   id                  SERIAL PRIMARY KEY,
--   full_name           VARCHAR(200)  NOT NULL,
--   year                VARCHAR(20)   NOT NULL CHECK (year IN ('1st Year', '2nd Year')),
--   registration_number VARCHAR(20)   NOT NULL UNIQUE,
--   branch              VARCHAR(100)  NOT NULL,
--   domain              TEXT          NOT NULL,
--   learner_email       VARCHAR(200)  NOT NULL UNIQUE,
--   phone_number        VARCHAR(10)   NOT NULL UNIQUE,
--   why_join            TEXT          NOT NULL,
--   github_url          TEXT,
--   linkedin_url        TEXT,
--   portfolio_url       TEXT,
--   other_links         TEXT,
--   certifications      TEXT,
--   projects            TEXT,
--   tier                VARCHAR(20)   NOT NULL CHECK (tier IN ('member', 'workcomm', 'mancomm')),
--   payment_status      VARCHAR(20)   NOT NULL DEFAULT 'pending',
--   payment_id          VARCHAR(100),
--   interview_status    VARCHAR(20)   NOT NULL DEFAULT 'pending',
--   created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
-- );
--
-- CREATE INDEX idx_applications_reg ON applications (registration_number);
-- CREATE INDEX idx_applications_email ON applications (learner_email);
-- CREATE INDEX idx_applications_phone ON applications (phone_number);
