ALTER TABLE events ADD COLUMN category TEXT NOT NULL DEFAULT 'other' CHECK(category IN ('survey','rainfall','disaster','engineering','other'));
ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN updated_at TEXT;
