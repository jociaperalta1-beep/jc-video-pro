/* ============================================================
   JC VIDEO PRO — Almacenamiento local (IndexedDB)
   Proyectos, medios y ajustes viven en este navegador.
   ============================================================ */

const DB_NAME = "jcvp-db";
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------------- Proyectos ---------------- */
export async function saveProjectRecord(project) {
  const store = await tx("projects", "readwrite");
  const record = structuredClone({ ...project, savedAt: Date.now() });
  await reqToPromise(store.put(record));
  return true;
}

export async function listProjects() {
  const store = await tx("projects");
  const list = (await reqToPromise(store.getAll())) || [];
  return list
    .map((p) => ({
      id: p.id,
      name: p.name,
      aspect: p.aspect,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      savedAt: p.savedAt,
      clipCount: (p.tracks || []).reduce((n, t) => n + (t.clips?.length || 0), 0),
    }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getProjectRecord(id) {
  const store = await tx("projects");
  return reqToPromise(store.get(id));
}

export async function deleteProjectRecord(id) {
  const store = await tx("projects", "readwrite");
  return reqToPromise(store.delete(id));
}

/* ---------------- Medios ---------------- */
export async function saveMediaRecord(record) {
  const store = await tx("media", "readwrite");
  await reqToPromise(store.put(record));
  return true;
}

export async function getAllMediaRecords() {
  const store = await tx("media");
  return (await reqToPromise(store.getAll())) || [];
}

export async function deleteMediaRecord(id) {
  const store = await tx("media", "readwrite");
  return reqToPromise(store.delete(id));
}

/* ---------------- Ajustes ---------------- */
export async function setSetting(key, value) {
  const store = await tx("settings", "readwrite");
  return reqToPromise(store.put({ key, value }));
}

export async function getSetting(key, fallback = null) {
  const store = await tx("settings");
  const row = await reqToPromise(store.get(key));
  return row ? row.value : fallback;
}

/* ---------------- Estadísticas (panel admin) ---------------- */
export async function getStats() {
  const [projects, media] = await Promise.all([
    (async () => {
      const store = await tx("projects");
      return (await reqToPromise(store.getAll())) || [];
    })(),
    (async () => {
      const store = await tx("media");
      return (await reqToPromise(store.getAll())) || [];
    })(),
  ]);
  const mediaBytes = media.reduce((n, m) => n + (m.blob?.size || 0), 0);
  const durations = projects.map((p) => {
    let end = 0;
    for (const t of p.tracks || []) for (const c of t.clips || []) end = Math.max(end, (c.start || 0) + (c.duration || 0));
    return end;
  });
  let quota = null;
  try { quota = await navigator.storage?.estimate?.(); } catch { /* ignore */ }
  return {
    projectCount: projects.length,
    mediaCount: media.length,
    mediaBytes,
    totalMinutes: durations.reduce((a, b) => a + b, 0) / 60,
    quota,
    projects,
    media,
  };
}

export async function exportBackup() {
  const [projects, media] = await Promise.all([
    (async () => { const s = await tx("projects"); return (await reqToPromise(s.getAll())) || []; })(),
    (async () => { const s = await tx("media"); return (await reqToPromise(s.getAll())) || []; })(),
  ]);
  return {
    app: "JC VIDEO PRO",
    exportedAt: new Date().toISOString(),
    note: "Copia de seguridad local. Los archivos multimedia no se incluyen (solo metadatos).",
    projects: projects.map((p) => ({ ...p, tracks: p.tracks })),
    media: media.map((m) => ({
      id: m.id, name: m.name, type: m.type, size: m.blob?.size || 0,
      duration: m.duration, width: m.width, height: m.height,
    })),
  };
}

/* ---------------- Persistencia del navegador ---------------- */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}
