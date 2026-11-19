CREATE TABLE photos (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 mime TEXT NOT NULL,
 data BLOB NOT NULL
);
CREATE INDEX photos_event ON photos(event_id);
