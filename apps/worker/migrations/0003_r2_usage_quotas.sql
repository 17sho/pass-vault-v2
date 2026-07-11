CREATE TABLE IF NOT EXISTS r2_monthly_usage (
  month TEXT PRIMARY KEY CHECK(length(month) = 7),
  class_a INTEGER NOT NULL DEFAULT 0 CHECK(class_a >= 0),
  class_b INTEGER NOT NULL DEFAULT 0 CHECK(class_b >= 0)
);

CREATE TABLE IF NOT EXISTS r2_storage_usage (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes >= 0)
);

INSERT OR IGNORE INTO r2_storage_usage(id, reserved_bytes) VALUES(1, 0);
UPDATE r2_storage_usage
SET reserved_bytes = MAX(reserved_bytes, (SELECT COALESCE(SUM(ciphertext_size), 0) FROM attachments))
WHERE id = 1;
