/* ============================================================
   JC VIDEO PRO — Núcleo del editor (estado, modelo, eventos)
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const uid = (prefix = "id") =>
  prefix + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function fmtTime(seconds = 0) {
  seconds = Math.max(0, seconds || 0);
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const d = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

export function fmtDur(seconds = 0) {
  seconds = Math.max(0, seconds || 0);
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function bytes(size = 0) {
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + " MB";
  return (size / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

/* ---------------- Bus de eventos ---------------- */
const listeners = new Map();
export function on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event)?.delete(cb);
}
export function emit(event, data) {
  listeners.get(event)?.forEach((cb) => {
    try { cb(data); } catch (err) { console.error("[JCVP]", event, err); }
  });
}

/* ---------------- Preferencias (localStorage) ---------------- */
const LS = {
  plan: "jcvp.plan",
  prices: "jcvp.prices",
  adminCode: "jcvp.adminCode",
  lastProject: "jcvp.lastProject",
  tour: "jcvp.tourSeen",
};

export const DEFAULT_PRICES = { premium: 3.99, pro: 6.99, annual: 49.99 };

export function getPlan() {
  try { return localStorage.getItem(LS.plan) || "free"; } catch { return "free"; }
}
export function setPlan(plan) {
  try { localStorage.setItem(LS.plan, plan); } catch { /* ignore */ }
  emit("premium", plan);
}
export function isPremium() {
  return getPlan() !== "free";
}
export function getPrices() {
  try { return { ...DEFAULT_PRICES, ...(JSON.parse(localStorage.getItem(LS.prices)) || {}) }; }
  catch { return { ...DEFAULT_PRICES }; }
}
export function setPrices(prices) {
  try { localStorage.setItem(LS.prices, JSON.stringify(prices)); } catch { /* ignore */ }
}
export function getAdminCode() {
  try { return localStorage.getItem(LS.adminCode) || "jcadmin"; } catch { return "jcadmin"; }
}
export function setAdminCode(code) {
  try { localStorage.setItem(LS.adminCode, code || "jcadmin"); } catch { /* ignore */ }
}
export function getLastProjectId() {
  try { return localStorage.getItem(LS.lastProject) || null; } catch { return null; }
}
export function setLastProjectId(id) {
  try { localStorage.setItem(LS.lastProject, id || ""); } catch { /* ignore */ }
}

/* ---------------- Formatos ---------------- */
export const ASPECTS = {
  "tiktok": { id: "tiktok", ratio: "9:16", width: 1080, height: 1920, label: "TikTok (9:16 · 1080×1920)", hint: "TikTok" },
  "youtube": { id: "youtube", ratio: "16:9", width: 1920, height: 1080, label: "YouTube (16:9 · 1920×1080)", hint: "Horizontal" },
  "yt-shorts": { id: "yt-shorts", ratio: "9:16", width: 1080, height: 1920, label: "YouTube Shorts (9:16 · 1080×1920)", hint: "Shorts" },
  "ig-post": { id: "ig-post", ratio: "1:1", width: 1080, height: 1080, label: "Instagram Post (1:1 · 1080×1080)", hint: "Feed Cuadrado" },
  "ig-vertical": { id: "ig-vertical", ratio: "4:5", width: 1080, height: 1350, label: "Instagram Vertical (4:5 · 1080×1350)", hint: "Feed Retrato" },
  "ig-reels": { id: "ig-reels", ratio: "9:16", width: 1080, height: 1920, label: "Instagram Reels (9:16 · 1080×1920)", hint: "Reels" },
  "fb-horizontal": { id: "fb-horizontal", ratio: "16:9", width: 1920, height: 1080, label: "Facebook Horizontal (16:9 · 1920×1080)", hint: "Videos FB" },
  "fb-feed": { id: "fb-feed", ratio: "4:5", width: 1080, height: 1350, label: "Facebook Feed Vertical (4:5 · 1080×1350)", hint: "Feed FB" },
  "fb-reels": { id: "fb-reels", ratio: "9:16", width: 1080, height: 1920, label: "Facebook Reels (9:16 · 1080×1920)", hint: "Reels FB" },
  // Compatibilidad con proyectos existentes
  "9:16": { id: "9:16", ratio: "9:16", width: 1080, height: 1920, label: "Vertical 9:16 (TikTok / Reels / Shorts)", hint: "9:16" },
  "16:9": { id: "16:9", ratio: "16:9", width: 1920, height: 1080, label: "Horizontal 16:9 (YouTube / Facebook)", hint: "16:9" },
  "1:1": { id: "1:1", ratio: "1:1", width: 1080, height: 1080, label: "Cuadrado 1:1 (Instagram Feed)", hint: "1:1" },
  "4:5": { id: "4:5", ratio: "4:5", width: 1080, height: 1350, label: "Retrato 4:5 (Instagram / Facebook)", hint: "4:5" },
};

export const SOCIAL_PRESETS = [
  { id: "tiktok", label: "TikTok (9:16 · 1080×1920)", w: 1080, h: 1920 },
  { id: "youtube", label: "YouTube (16:9 · 1920×1080)", w: 1920, h: 1080 },
  { id: "yt-shorts", label: "YouTube Shorts (9:16 · 1080×1920)", w: 1080, h: 1920 },
  { id: "ig-post", label: "Instagram Post (1:1 · 1080×1080)", w: 1080, h: 1080 },
  { id: "ig-vertical", label: "Instagram Vertical (4:5 · 1080×1350)", w: 1080, h: 1350 },
  { id: "ig-reels", label: "Instagram Reels (9:16 · 1080×1920)", w: 1080, h: 1920 },
  { id: "fb-horizontal", label: "Facebook Horizontal (16:9 · 1920×1080)", w: 1920, h: 1080 },
  { id: "fb-feed", label: "Facebook Feed Vertical (4:5 · 1080×1350)", w: 1080, h: 1350 },
  { id: "fb-reels", label: "Facebook Reels (9:16 · 1080×1920)", w: 1080, h: 1920 },
];

export const TRACK_DEFS = [
  { id: "t-overlay", kind: "overlay", name: "Superposición", accepts: ["video", "image"] },
  { id: "t-video", kind: "video", name: "Video principal", accepts: ["video", "image"] },
  { id: "t-text", kind: "text", name: "Textos", accepts: ["text"] },
  { id: "t-audio", kind: "audio", name: "Audio", accepts: ["audio"] },
];

export const DEFAULT_FILTER = {
  brightness: 100, contrast: 100, saturate: 100, sepia: 0, grayscale: 0, hue: 0, blur: 0,
};
export const DEFAULT_TRANSFORM = { scale: 1, x: 0, y: 0, rotation: 0 };

export const ANIMATIONS = {
  none: { label: "Sin animación", pro: false },
  fade: { label: "Fundido", pro: false },
  slide: { label: "Deslizamiento suave", pro: false },
  zoom: { label: "Zoom dinámico", pro: false },
  pop: { label: "Entrada con rebote (Pop)", pro: false },
  typewriter: { label: "Máquina de escribir", pro: true },
  neon: { label: "Neón luminoso", pro: true },
  pulse: { label: "Latido / Pulso", pro: true },
  flash: { label: "Destello (Flash)", pro: true },
};

export function isProAnimation(name) {
  return !!(ANIMATIONS[name] && ANIMATIONS[name].pro);
}

export function animationOptions(selected = "fade") {
  return Object.entries(ANIMATIONS)
    .map(([key, value]) => `<option value="${key}" ${selected === key ? "selected" : ""}>${value.label}${value.pro ? " · PRO" : ""}</option>`)
    .join("");
}

export function defaultText() {
  return {
    content: "Tu texto aquí",
    size: 96,
    color: "#ffffff",
    bg: "#000000",
    bgOpacity: 0.35,
    weight: 800,
    align: "center",
    x: 0.5,
    y: 0.5,
    animation: "fade",
  };
}

/* ---------------- Modelo de proyecto ---------------- */
export function createProject(opts = {}) {
  const aspect = ASPECTS[opts.aspect] || ASPECTS["9:16"];
  return {
    id: uid("prj"),
    version: 1,
    name: opts.name || "Mi proyecto",
    width: aspect.width,
    height: aspect.height,
    aspect: aspect.id,
    fps: 30,
    tracks: TRACK_DEFS.map((t) => ({ id: t.id, kind: t.kind, name: t.name, clips: [] })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") return createProject();
  const p = { ...createProject({ aspect: raw.aspect, name: raw.name }), ...raw };
  const fallback = TRACK_DEFS.map((t) => ({ id: t.id, kind: t.kind, name: t.name, clips: [] }));
  p.tracks = fallback.map((def) => {
    const found = Array.isArray(raw.tracks) ? raw.tracks.find((t) => t.id === def.id) : null;
    return {
      ...def,
      clips: Array.isArray(found?.clips)
        ? found.clips.map((c) => ({
            ...c,
            filter: { ...DEFAULT_FILTER, ...(c.filter || {}) },
            transform: { ...DEFAULT_TRANSFORM, ...(c.transform || {}) },
            volume: c.volume ?? 1,
            speed: c.speed ?? 1,
            in: c.in ?? 0,
            start: Math.max(0, c.start ?? 0),
            duration: Math.max(0.05, c.duration ?? 3),
            text: c.kind === "text" ? { ...defaultText(), ...(c.text || {}) } : c.text,
          }))
        : [],
    };
  });
  p.width = raw.width || ASPECTS[p.aspect]?.width || 1080;
  p.height = raw.height || ASPECTS[p.aspect]?.height || 1920;
  return p;
}

export const store = {
  project: null,
  media: new Map(),
  selection: null, // { clipId, trackId }
  time: 0,
  playing: false,
  zoom: 80,
  dirty: false,
  exporting: false,
};

export function projectDuration(project = store.project) {
  let end = 0;
  if (!project) return 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.start + clip.duration);
  }
  return end;
}

export function allClips(project = store.project) {
  return project ? project.tracks.flatMap((t) => t.clips.map((c) => ({ clip: c, track: t }))) : [];
}

export function findClip(clipId) {
  if (!clipId || !store.project) return null;
  for (const track of store.project.tracks) {
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index >= 0) return { track, index, clip: track.clips[index] };
  }
  return null;
}

export function findTrack(trackId) {
  return store.project?.tracks.find((t) => t.id === trackId) || null;
}

export function clipEnd(clip) { return clip.start + clip.duration; }

export function mediaDurationOf(clip) {
  const m = store.media.get(clip.mediaId);
  if (!m || !m.duration) return 0;
  return m.duration;
}

export function maxClipDuration(clip) {
  if (clip.kind === "image" || clip.kind === "text") return 3600;
  const md = mediaDurationOf(clip);
  if (!md) return 3600;
  return Math.max(0.2, (md - clip.in) / (clip.speed || 1));
}

/* ---------------- Selección ---------------- */
export function selectClip(clipId) {
  const found = findClip(clipId);
  if (!found) { store.selection = null; }
  else { store.selection = { clipId: found.clip.id, trackId: found.track.id }; }
  emit("selection", store.selection);
}

export function selectedClip() {
  if (!store.selection) return null;
  return findClip(store.selection.clipId);
}

/* ---------------- Historial ---------------- */
const undoStack = [];
const redoStack = [];
const historyLimit = 60;

export function snapshot(label = "") {
  if (!store.project) return;
  undoStack.push({ label, project: structuredClone(store.project) });
  if (undoStack.length > historyLimit) undoStack.shift();
  redoStack.length = 0;
  emit("history");
}

export function undo() {
  if (!undoStack.length) return false;
  const entry = undoStack.pop();
  redoStack.push({ label: entry.label, project: structuredClone(store.project) });
  store.project = entry.project;
  store.dirty = true;
  if (store.selection && !findClip(store.selection.clipId)) store.selection = null;
  emit("project");
  emit("history");
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  const entry = redoStack.pop();
  undoStack.push({ label: entry.label, project: structuredClone(store.project) });
  store.project = entry.project;
  store.dirty = true;
  if (store.selection && !findClip(store.selection.clipId)) store.selection = null;
  emit("project");
  emit("history");
  return true;
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

/* ---------------- Mutaciones ---------------- */
export function touch() {
  if (store.project) store.project.updatedAt = Date.now();
  store.dirty = true;
  emit("change");
}

export function addClip(trackId, clip) {
  const track = findTrack(trackId);
  if (!track) return null;
  const def = TRACK_DEFS.find((t) => t.id === trackId);
  if (def && !def.accepts.includes(clip.kind)) return null;
  track.clips.push(clip);
  touch();
  emit("project");
  return clip;
}

export function removeClip(clipId) {
  const found = findClip(clipId);
  if (!found) return false;
  found.track.clips.splice(found.index, 1);
  if (store.selection?.clipId === clipId) store.selection = null;
  touch();
  emit("project");
  emit("selection", store.selection);
  return true;
}

export function splitClipAt(time, clipId = store.selection?.clipId) {
  const found = findClip(clipId);
  if (!found) return false;
  const { clip, track } = found;
  if (time <= clip.start + 0.05 || time >= clip.start + clip.duration - 0.05) return false;
  const offset = time - clip.start;
  const right = structuredClone(clip);
  right.id = uid("clip");
  right.start = time;
  right.in = (clip.in || 0) + offset * (clip.speed || 1);
  right.duration = clip.duration - offset;
  clip.duration = offset;
  track.clips.push(right);
  touch();
  emit("project");
  selectClip(right.id);
  return true;
}

export function duplicateClip(clipId = store.selection?.clipId) {
  const found = findClip(clipId);
  if (!found) return false;
  const copy = structuredClone(found.clip);
  copy.id = uid("clip");
  copy.start = clipEnd(found.clip) + 0.05;
  found.track.clips.push(copy);
  touch();
  emit("project");
  selectClip(copy.id);
  return true;
}

export function moveClipToTrack(clipId, targetTrackId) {
  const found = findClip(clipId);
  const target = findTrack(targetTrackId);
  if (!found || !target || found.track.id === targetTrackId) return false;
  const def = TRACK_DEFS.find((t) => t.id === targetTrackId);
  if (def && !def.accepts.includes(found.clip.kind)) return false;
  found.track.clips.splice(found.index, 1);
  target.clips.push(found.clip);
  store.selection = { clipId, trackId: targetTrackId };
  touch();
  emit("project");
  emit("selection", store.selection);
  return true;
}

export function createTextClip({ content, size, color, start = store.time, duration = 4, y = 0.5 } = {}) {
  return {
    id: uid("txt"),
    kind: "text",
    name: (content || "Texto").slice(0, 24),
    start: Math.max(0, start),
    duration,
    in: 0,
    volume: 1,
    speed: 1,
    filter: { ...DEFAULT_FILTER },
    transform: { ...DEFAULT_TRANSFORM },
    text: { ...defaultText(), ...(content ? { content } : {}), ...(size ? { size } : {}), ...(color ? { color } : {}), y },
  };
}

export function shiftClipsAfterRemoval(track) {
  for (const clip of track.clips) clip.start = Math.max(0, clip.start);
}

/* ---------------- Snap / utilidades de tiempo ---------------- */
export function snapTime(time, excludeClipId = null, thresholdPx = 7, pps = store.zoom) {
  const threshold = thresholdPx / pps;
  const candidates = [0, store.time];
  for (const { clip } of allClips()) {
    if (clip.id === excludeClipId) continue;
    candidates.push(clip.start, clip.start + clip.duration);
  }
  let best = time;
  let bestDist = threshold;
  for (const c of candidates) {
    const dist = Math.abs(c - time);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

/* ---------------- Filtros ---------------- */
export function cssFilter(filter = {}) {
  const f = { ...DEFAULT_FILTER, ...filter };
  const parts = [
    `brightness(${f.brightness}%)`,
    `contrast(${f.contrast}%)`,
    `saturate(${f.saturate}%)`,
  ];
  if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.blur) parts.push(`blur(${f.blur}px)`);
  return parts.join(" ");
}
