/* ============================================================
   JC VIDEO PRO — Importación y gestión de medios
   ============================================================ */

import { uid, emit, store, snapshot, touch, addClip, removeClip, allClips, fmtDur, clamp } from "./core.js";
import { saveMediaRecord, getAllMediaRecords, deleteMediaRecord } from "./storage.js";

const byExt = (name = "") => {
  const ext = name.split(".").pop().toLowerCase();
  if (["mp4", "webm", "mov", "m4v", "ogv", "mkv", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"].includes(ext)) return "audio";
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp"].includes(ext)) return "image";
  return null;
};

export function detectType(file) {
  if (!file) return null;
  if (file.type?.startsWith("video/")) return "video";
  if (file.type?.startsWith("image/")) return "image";
  if (file.type?.startsWith("audio/")) return "audio";
  return byExt(file.name || "");
}

export function mediaURL(id) {
  return store.media.get(id)?.url || "";
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Tiempo agotado: " + label)), ms)),
  ]);
}

function thumbnailFrom(source, width, height, maxW = 320) {
  try {
    const scale = Math.min(1, maxW / (width || maxW));
    const w = Math.max(1, Math.round((width || maxW) * scale));
    const h = Math.max(1, Math.round((height || maxW) * (maxW / (width || maxW)) || maxW));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch (err) {
    console.warn("[JCVP] miniatura", err);
    return null;
  }
}

function probeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const thumb = thumbnailFrom(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight, duration: 0, thumb });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    const cleanup = () => { URL.revokeObjectURL(url); video.src = ""; };
    const finish = (data) => { if (settled) return; settled = true; cleanup(); resolve(data); };
    const fail = (msg) => { if (settled) return; settled = true; cleanup(); reject(new Error(msg)); };

    withTimeout(new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = () => rej(new Error("Formato de video no compatible en este navegador"));
    }), 15000, "metadatos de video").then(() => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const seekTo = Math.min(Math.max(0.05, duration * 0.2), Math.max(0.05, duration - 0.1));
      const draw = () => {
        const thumb = thumbnailFrom(video, video.videoWidth, video.videoHeight);
        finish({ width: video.videoWidth, height: video.videoHeight, duration, thumb });
      };
      video.onseeked = draw;
      try { video.currentTime = seekTo; }
      catch { draw(); }
      setTimeout(() => { if (!settled) draw(); }, 3500);
    }).catch((err) => fail(err.message));
    video.src = url;
  });
}

function probeAudio(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0, duration, thumb: null });
    };
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer el audio")); };
    audio.src = url;
  });
}

async function probe(file, type) {
  if (type === "video") return probeVideo(file);
  if (type === "image") return probeImage(file);
  if (type === "audio") return probeAudio(file);
  throw new Error("Tipo de archivo no soportado");
}

async function saveMediaBlob(blob, meta = {}) {
  const record = {
    id: uid("med"),
    name: meta.name || "Archivo",
    fileName: meta.fileName || meta.name || "archivo",
    type: meta.type || "image",
    blob,
    thumb: meta.thumb || null,
    width: meta.width || 0,
    height: meta.height || 0,
    duration: meta.duration || 0,
    size: blob.size || 0,
    source: meta.source || "",
    prompt: meta.prompt || "",
    previewUrl: meta.previewUrl || "",
    addedAt: Date.now(),
  };
  await saveMediaRecord(record);
  store.media.set(record.id, {
    id: record.id,
    name: record.name,
    type: record.type,
    url: URL.createObjectURL(blob),
    thumb: record.thumb,
    width: record.width,
    height: record.height,
    duration: record.duration,
    size: record.size,
    source: record.source,
  });
  emit("media");
  return record.id;
}

export async function importImageBlob(blob, meta = {}) {
  const probed = await probeImage(blob);
  return saveMediaBlob(blob, {
    ...meta,
    type: "image",
    width: probed.width,
    height: probed.height,
    duration: 0,
    thumb: probed.thumb,
  });
}

export async function importAudioBlob(blob, meta = {}) {
  const probed = await probeAudio(blob);
  return saveMediaBlob(blob, {
    ...meta,
    type: "audio",
    duration: probed.duration || meta.duration || 0,
    thumb: meta.thumb || null,
  });
}

export async function addRemoteMedia(meta = {}) {
  const url = meta.url || "";
  if (!url) throw new Error("Falta la URL del archivo remoto");
  const record = {
    id: uid("med"),
    name: meta.name || "Audio remoto",
    fileName: meta.fileName || "",
    type: meta.type || "audio",
    blob: null,
    url,
    remote: true,
    thumb: meta.thumb || null,
    width: meta.width || 0,
    height: meta.height || 0,
    duration: meta.duration || 0,
    size: meta.size || 0,
    source: meta.source || "",
    previewUrl: meta.previewUrl || url,
    addedAt: Date.now(),
  };
  await saveMediaRecord(record);
  store.media.set(record.id, {
    id: record.id,
    name: record.name,
    type: record.type,
    url,
    remote: true,
    thumb: record.thumb,
    width: record.width,
    height: record.height,
    duration: record.duration,
    size: record.size,
    source: record.source,
  });
  emit("media");
  return record.id;
}

export async function importFiles(fileList, options = {}) {
  const files = Array.from(fileList || []).filter(Boolean);
  const accepted = [];
  for (const file of files) {
    const type = detectType(file);
    if (!type) { options.onError?.(file, "Formato no soportado"); continue; }
    accepted.push({ file, type });
  }
  if (!accepted.length) return [];

  const imported = [];
  let index = 0;
  for (const { file, type } of accepted) {
    index++;
    options.onProgress?.({ phase: "reading", file: file.name, index, total: accepted.length });
    try {
      const probed = await probe(file, type);
      const record = {
        id: uid("med"),
        name: file.name.replace(/\.[^.]+$/, "") || file.name,
        fileName: file.name,
        type,
        blob: file,
        thumb: probed.thumb,
        width: probed.width || 0,
        height: probed.height || 0,
        duration: probed.duration || 0,
        size: file.size,
        addedAt: Date.now(),
      };
      await saveMediaRecord(record);
      store.media.set(record.id, {
        id: record.id,
        name: record.name,
        type: record.type,
        url: URL.createObjectURL(file),
        thumb: record.thumb,
        width: record.width,
        height: record.height,
        duration: record.duration,
        size: record.size,
      });
      imported.push(record.id);
      emit("media");
    } catch (err) {
      console.warn("[JCVP] importación fallida", file.name, err);
      options.onError?.(file, err.message || "Error al importar");
    }
  }
  options.onProgress?.({ phase: "done", count: imported.length, total: accepted.length });
  return imported;
}

export async function rehydrateMedia() {
  const records = await getAllMediaRecords();
  for (const rec of records) {
    if (store.media.has(rec.id)) continue;
    if (!rec.blob && !rec.url) continue;
    store.media.set(rec.id, {
      id: rec.id,
      name: rec.name,
      type: rec.type,
      url: rec.url || URL.createObjectURL(rec.blob),
      remote: !!rec.remote || !rec.blob,
      thumb: rec.thumb,
      width: rec.width,
      height: rec.height,
      duration: rec.duration,
      size: rec.blob?.size || rec.size || 0,
      source: rec.source || "",
    });
  }
  emit("media");
  return records.length;
}

export function defaultClipDuration(media) {
  if (!media) return 4;
  if (media.type === "image") return 4;
  return clamp(media.duration || 4, 0.3, 3600);
}

export function trackEnd(track) {
  return track ? track.clips.reduce((end, c) => Math.max(end, c.start + c.duration), 0) : 0;
}

export function freeStart(track, desired, duration) {
  let start = Math.max(0, desired);
  const overlaps = track.clips.some((c) => start < c.start + c.duration - 0.001 && start + duration > c.start + 0.001);
  if (overlaps) start = trackEnd(track) + 0.05;
  return start;
}

export function addMediaClip(mediaId, trackId, opts = {}) {
  const media = store.media.get(mediaId);
  if (!media) return null;
  const track = store.project.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const duration = opts.duration || defaultClipDuration(media);
  const start = opts.start ?? freeStart(track, store.time, duration);
  const clip = {
    id: uid("clip"),
    kind: media.type,
    mediaId,
    name: media.name,
    start,
    duration,
    in: 0,
    volume: 1,
    speed: 1,
    filter: { brightness: 100, contrast: 100, saturate: 100, sepia: 0, grayscale: 0, hue: 0, blur: 0 },
    transform: { scale: 1, x: 0, y: 0, rotation: 0 },
  };
  snapshot("Añadir clip");
  const added = addClip(trackId, clip);
  if (added) {
    store.selection = { clipId: added.id, trackId };
    emit("selection", store.selection);
  }
  return added;
}

export async function removeMedia(mediaId, { removeClips = true } = {}) {
  const media = store.media.get(mediaId);
  if (!media) return;
  if (removeClips) {
    const used = allClips().filter(({ clip }) => clip.mediaId === mediaId);
    if (used.length) snapshot("Eliminar medio");
    for (const { clip } of used) removeClip(clip.id);
  }
  store.media.delete(mediaId);
  if (!media.remote) {
    try { URL.revokeObjectURL(media.url); } catch { /* ignore */ }
  }
  try { await deleteMediaRecord(mediaId); } catch (err) { console.warn(err); }
  emit("media");
  emit("project");
}

export function mediaLabel(media) {
  if (!media) return "Medio";
  if (media.type === "image") return (media.width || 0) + "×" + (media.height || 0);
  return fmtDur(media.duration || 0);
}

export function importSummary(importedCount, errors = []) {
  if (!importedCount && !errors.length) return "No se importó ningún archivo.";
  const ok = importedCount ? `${importedCount} archivo(s) importado(s)` : "";
  const bad = errors.length ? `${errors.length} archivo(s) no compatibles` : "";
  return [ok, bad].filter(Boolean).join(" · ");
}
