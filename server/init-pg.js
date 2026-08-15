import 'dotenv/config';
import pg from 'pg';

const schema = `
CREATE TABLE IF NOT EXISTS applications (
  id                  SERIAL PRIMARY KEY,
  full_name           VARCHAR(200)  NOT NULL,
  year                VARCHAR(20)   NOT NULL CHECK (year IN ('1st Year', '2nd Year')),
  registration_number VARCHAR(20)   NOT NULL UNIQUE,
  branch              VARCHAR(100)  NOT NULL,
  domain              TEXT          NOT NULL,
  learner_email       VARCHAR(200)  NOT NULL UNIQUE,
  phone_number        VARCHAR(10)   NOT NULL UNIQUE,
  why_join            TEXT          NOT NULL,
  github_url          TEXT,
  linkedin_url        TEXT,
  portfolio_url       TEXT,
  other_links         TEXT,
  certifications      TEXT,
  projects            TEXT,
  tier                VARCHAR(20)   NOT NULL CHECK (tier IN ('member', 'workcomm', 'mancomm')),
  payment_status      VARCHAR(20)   NOT NULL DEFAULT 'pending',
  payment_id          VARCHAR(100),
  interview_status    VARCHAR(20)   NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_reg ON applications (registration_number);
CREATE INDEX IF NOT EXISTS idx_applications_email ON applications (learner_email);
CREATE INDEX IF NOT EXISTS idx_applications_phone ON applications (phone_number);
`;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function init() {
  try {
    console.log("Running schema on PostgreSQL...");
    await pool.query(schema);
    console.log("Schema successfully initialized.");
  } catch (err) {
    console.error("Error creating schema:", err);
  } finally {
    await pool.end();
  }
}

init();
