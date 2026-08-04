const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStateStore } = require("../storage");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "glame-stress-"));
const store = createStateStore({
  dataDir: root,
  legacyStateFile: path.join(root, "state.json"),
});

try {
  const startedAt = Date.now();
  const writes = 2000;
  for (let index = 1; index <= writes; index += 1) {
    const state = store.readState();
    state.nextNumber = index + 1;
    state.sessions = [{
      id: `STRESS-${String(index).padStart(5, "0")}`,
      status: index % 2 ? "WAITING" : "RAW_READY",
      updatedAt: new Date().toISOString(),
    }];
    const revision = store.info().revision;
    store.writeState(state, { type: "STRESS_WRITE", sessionId: state.sessions[0].id }, revision);
  }

  const finalState = store.readState();
  const info = store.info();
  if (finalState.nextNumber !== writes + 1) throw new Error("Final state mismatch");
  if (info.revision !== writes + 1) throw new Error(`Revision mismatch: ${info.revision}`);
  const backup = store.backup(path.join(root, "backups"));
  if (!fs.existsSync(backup) || fs.statSync(backup).size < 1) throw new Error("Backup failed");
  console.log(JSON.stringify({ ok: true, writes, revision: info.revision, elapsedMs: Date.now() - startedAt }));
} finally {
  store.close();
  const resolved = path.resolve(root);
  if (resolved.startsWith(path.resolve(os.tmpdir()))) fs.rmSync(resolved, { recursive: true, force: true });
}
