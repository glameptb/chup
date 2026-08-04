const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

function createStateStore({ dataDir, legacyStateFile }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const databaseFile = path.join(dataDir, "glame.sqlite");
  const database = new DatabaseSync(databaseFile);
  database.exec("PRAGMA journal_mode=WAL");
  database.exec("PRAGMA synchronous=FULL");
  database.exec("PRAGMA busy_timeout=5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      event_type TEXT NOT NULL,
      session_id TEXT,
      payload TEXT
    );
    CREATE INDEX IF NOT EXISTS event_log_session_idx ON event_log(session_id, created_at);
  `);

  const selectState = database.prepare("SELECT json, revision, updated_at FROM app_state WHERE id = 1");
  const insertState = database.prepare("INSERT INTO app_state (id, json, revision, updated_at) VALUES (1, ?, 1, ?)");
  const updateState = database.prepare("UPDATE app_state SET json = ?, revision = revision + 1, updated_at = ? WHERE id = 1");
  const insertEvent = database.prepare("INSERT INTO event_log (created_at, event_type, session_id, payload) VALUES (?, ?, ?, ?)");

  function normalize(state) {
    const normalized = state && typeof state === "object" ? state : {};
    if (!Array.isArray(normalized.sessions)) normalized.sessions = [];
    normalized.nextNumber = Math.max(1, Number(normalized.nextNumber || 1));
    return normalized;
  }

  function initialState() {
    if (fs.existsSync(legacyStateFile)) {
      try {
        return normalize(JSON.parse(fs.readFileSync(legacyStateFile, "utf8")));
      } catch {
        const corruptBackup = `${legacyStateFile}.corrupt-${Date.now()}`;
        fs.copyFileSync(legacyStateFile, corruptBackup);
      }
    }
    return { nextNumber: 1, sessions: [] };
  }

  if (!selectState.get()) {
    const migrated = initialState();
    insertState.run(JSON.stringify(migrated), new Date().toISOString());
    if (fs.existsSync(legacyStateFile)) {
      const migrationBackup = `${legacyStateFile}.pre-sqlite`;
      if (!fs.existsSync(migrationBackup)) fs.copyFileSync(legacyStateFile, migrationBackup);
    }
  }

  function readState() {
    const row = selectState.get();
    return normalize(JSON.parse(row.json));
  }

  function writeMirror(state) {
    const temporaryFile = `${legacyStateFile}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2));
    fs.renameSync(temporaryFile, legacyStateFile);
  }

  function writeState(state, event = {}, expectedRevision = null) {
    const normalized = normalize(state);
    delete normalized._revision;
    const now = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      const current = selectState.get();
      if (expectedRevision !== null && Number(expectedRevision) !== Number(current.revision)) {
        const error = new Error("State revision conflict");
        error.code = "REVISION_CONFLICT";
        error.currentRevision = Number(current.revision);
        throw error;
      }
      updateState.run(JSON.stringify(normalized), now);
      if (event.type) {
        insertEvent.run(now, event.type, event.sessionId || null, JSON.stringify(event.payload || {}));
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    writeMirror(normalized);
    return selectState.get();
  }

  function info() {
    const row = selectState.get();
    return {
      databaseFile,
      revision: Number(row.revision),
      updatedAt: row.updated_at,
    };
  }

  function backup(backupDir) {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `glame-${stamp}.sqlite`);
    const sqlPath = backupFile.replace(/'/g, "''");
    database.exec(`VACUUM INTO '${sqlPath}'`);
    return backupFile;
  }

  function close() {
    database.close();
  }

  return { readState, writeState, info, backup, close };
}

module.exports = { createStateStore };
