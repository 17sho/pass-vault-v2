CREATE TABLE attachments (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  metadata_iv TEXT NOT NULL,
  metadata_ciphertext TEXT NOT NULL,
  object_key TEXT NOT NULL,
  ciphertext_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_attachments_user_updated ON attachments(user_id, updated_at DESC);
