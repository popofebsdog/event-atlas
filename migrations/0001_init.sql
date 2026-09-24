CREATE TABLE projects (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90),
 lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180), created_at TEXT NOT NULL
);
CREATE TABLE events (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL, description TEXT NOT NULL, occurred_at TEXT NOT NULL,
 url TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX events_project_time ON events(project_id, occurred_at, id);
CREATE INDEX projects_created ON projects(created_at, id);
