CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,kdf TEXT NOT NULL,wrapped_key TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE sessions(id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts(key TEXT NOT NULL,attempted_at INTEGER NOT NULL);
CREATE INDEX idx_login_attempts_key_time ON login_attempts(key,attempted_at);
CREATE TABLE entries(user_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN('account','website','note')),version INTEGER NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX idx_entries_user_type ON entries(user_id,type);
