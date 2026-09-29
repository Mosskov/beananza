-- Comments on decisions (tools/share/worker/comments.ts). Plain text; no emails or IP addresses.
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX comments_by_decision ON comments (decision, id);
