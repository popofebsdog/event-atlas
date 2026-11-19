CREATE TABLE project_features (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 description TEXT NOT NULL,
 geometry TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX project_features_created ON project_features(project_id,created_at,id);
