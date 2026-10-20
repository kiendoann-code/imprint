-- Anonymized 120-day retention, with 7/30/90-day rolling reports.
CREATE TABLE IF NOT EXISTS behavior_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  visitor_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  engaged_ms INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0,
  max_scroll INTEGER NOT NULL DEFAULT 0,
  interactions INTEGER NOT NULL DEFAULT 0,
  converted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS behavior_sessions_started ON behavior_sessions(started_at);
