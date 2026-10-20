-- Anonymous add-to-cart events: one UUID per successful cart addition.
CREATE TABLE IF NOT EXISTS behavior_cart_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS behavior_cart_events_created ON behavior_cart_events(created_at);
-- Daily aggregates imported by an authenticated admin from verified Cloudflare CSV.
-- These values are distinct from first-party visitor/session counters.
CREATE TABLE IF NOT EXISTS behavior_external_daily (
  day TEXT PRIMARY KEY NOT NULL,
  visitors INTEGER,
  page_views INTEGER,
  source TEXT NOT NULL
);
