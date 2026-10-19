CREATE TABLE IF NOT EXISTS design_library_items (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 category TEXT NOT NULL,
 media_id TEXT NOT NULL,
 alt TEXT NOT NULL DEFAULT '',
 position INTEGER NOT NULL DEFAULT 0,
 enabled INTEGER NOT NULL DEFAULT 1,
 archived INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS design_library_category_active ON design_library_items(category, archived, enabled, position);