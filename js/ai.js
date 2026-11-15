/* ============================================================
   JC VIDEO PRO — Creador de video con IA (Pollinations, sin clave)
   Genera imágenes, narración y clips animados reales.
   ============================================================ */

import {
  store, projectDuration, uid, clamp, snapshot, addClip, createTextClip,
  touch, emit, DEFAULT_FILTER, DEFAULT_TRANSFORM,
} from "./core.js";
import { importImageBlob } from "./media.js";

const IMAGE_API = "https://image.pollinations.ai/prompt/";
const TEXT_API = "https://text.pollinations.ai/";

const STYLE_PROMPTS = {
  cinematico: "cinematic photography, dramatic lighting, shallow depth of field, rich colors",
  neon: "neon cyberpunk lighting, vivid violet and cyan colors, futuristic atmosphere",
  minimal: "minimalist composition, clean background, elegant negative space",
  realista: "photorealistic, natural light, sharp details, documentary style",
  ilustracion: "premium digital illustration, vibrant colors, artistic detail",
};

const SCENE_PROMPTS = [
  "wide establishing shot with strong composition",
  "medium shot with dramatic light and depth",
  "close-up with rich texture and detail",
  "aerial or elevated view with scale",
  "low angle composition with energy",
  "soft ambient final shot with atmosphere",
];

const MOTIONS = {
  zoomIn: { zoomFrom: 1.02, zoomTo: 1.14, panFromX: 0, panToX: 0, panFromY: 0, panToY: 0 },
  zoomOut: { zoomFrom: 1.14, zoomTo: 1.02, panFromX: 0, panToX: 0, panFromY: 0, panToY: 0 },
  panLeft: { zoomFrom: 1.12, zoomTo: 1.12, panFromX: 0.035, panToX: -0.035, panFromY: 0, panToY: 0 },
  panRight: { zoomFrom: 1.12, zoomTo: 1.12, panFromX: -0.035, panToX: 0.035, panFromY: 0, panToY: 0 },
  panUp: { zoomFrom: 1.12, zoomTo: 1.12, panFromX: 0, panToX: 0, panFromY: 0.035, panToY: -0.035 },
  panDown: { zoomFrom: 1.12, zoomTo: 1.12, panFromX: 0, panToX: 0, panFromY: -0.035, panToY: 0.035 },
};
const MOTION_KEYS = Object.keys(MOTIONS);

function aiDims() {
  const w = store.project?.width || 1080;
  const h = store.project?.height || 1920;
  const long = 1024;
  if (w === h) return { w: 768, h: 768 };
  if (w > h) return { w: long, h: Math.round((long * h) / w / 2) * 2 };
  return { w: Math.round((long * w) / h / 2) * 2, h: long };
}

async function fetchWithTimeout(url, ms = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, mode: "cors" });
  } finally {
    clearTimeout(timer);
  }
}

function cleanLine(line) {
  return String(line || "")
    .replace(/^```[\s\S]*?```$/g, "")
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^\s*\d+[.)-]\s*/, "")
    .replace(/^["“'«]+|["”'»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNarration(text, count) {
  const raw = String(text || "").replace(/```/g, "").trim();
  const lines = raw.split(/\n+/).map(cleanLine).filter((line) => line.length > 2);
  const sentences = raw.split(/(?<=[.!?])\s+/).map(cleanLine).filter((line) => line.length > 2);
  const merged = [...lines, ...sentences].filter((line, index, arr) => arr.indexOf(line) === index);
  return merged.slice(0, count).map((line) => line.slice(0, 120));
}

function fallbackNarration(idea, count) {
  const topic = idea.trim().replace(/[.!?]+$/, "");
  const base = [
    `Descubre ${topic}`,
    "Una historia que despierta los sentidos",
    "Cada plano cuenta una emoción",
    "Imagina, crea y comparte",
    "El futuro se ve mejor en movimiento",
    "Tu marca merece brillar",
  ];
  return Array.from({ length: count }, (_, i) => base[i % base.length]);
}

export async function generateNarration(idea, count) {
  const prompt = [
    `Escribe exactamente ${count} frases muy cortas en español para narrar un video vertical sobre: ${idea}.`,
    "Cada frase debe tener máximo 12 palabras, ser original, emocional y no incluir numeración, comillas ni explicaciones.",
    "Devuelve solo las frases, una por línea.",
  ].join(" ");
  try {
    const url = `${TEXT_API}${encodeURIComponent(prompt)}?seed=${Math.floor(Math.random() * 1e9)}`;
    const res = await fetchWithTimeout(url, 45000);
    if (!res.ok) throw new Error(`Texto IA: ${res.status}`);
    const text = await res.text();
    const lines = parseNarration(text, count);
    if (lines.length >= count) return { lines: lines.slice(0, count), fallback: false };
    if (lines.length) {
      const missing = fallbackNarration(idea, count).slice(lines.length);
      return { lines: [...lines, ...missing].slice(0, count), fallback: true };
    }
    throw new Error("La IA no devolvió frases");
  } catch (err) {
    console.warn("[JCVP IA] narración", err);
    return { lines: fallbackNarration(idea, count), fallback: true };
  }
}

async function generateSceneImage(prompt, seed, dims) {
  const url = `${IMAGE_API}${encodeURIComponent(prompt)}?width=${dims.w}&height=${dims.h}&seed=${seed}&nologo=true&enhance=true&model=flux`;
  const res = await fetchWithTimeout(url, 110000);
  if (!res.ok) throw new Error(`Imagen IA: ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error("El servicio de imágenes no devolvió una imagen válida");
  const blob = await res.blob();
  if (blob.size < 1024) throw new Error("La imagen generada llegó vacía");
  return blob;
}

export async function generateAIVideo({ idea, scenes = 4, style = "cinematico", onProgress = () => {} } = {}) {
  const cleanIdea = String(idea || "").trim();
  if (!cleanIdea) throw new Error("Escribe una idea para el video");
  const count = clamp(Math.round(Number(scenes) || 4), 3, 6);
  const styleText = STYLE_PROMPTS[style] || STYLE_PROMPTS.cinematico;
  const dims = aiDims();
  const seedBase = Math.floor(Math.random() * 1e9);

  onProgress({ phase: "script", pct: 4, message: "Escribiendo la narración con IA…" });
  const narration = await generateNarration(cleanIdea, count);

  const generated = [];
  for (let i = 0; i < count; i++) {
    const sceneText = `${cleanIdea}. ${SCENE_PROMPTS[i % SCENE_PROMPTS.length]}. ${styleText}. vertical video composition, high detail, no text, no logos, no watermark.`;
    onProgress({
      phase: "image",
      pct: 10 + Math.round((i / count) * 78),
      message: `Generando escena ${i + 1} de ${count}…`,
    });
    const blob = await generateSceneImage(sceneText, seedBase + i * 977, dims);
    const mediaId = await importImageBlob(blob, {
      name: `IA · ${cleanIdea.slice(0, 34)} · ${i + 1}`,
      fileName: `jc_ia_${Date.now()}_${i + 1}.jpg`,
      source: "Pollinations",
      prompt: sceneText,
    });
    generated.push({
      mediaId,
      text: narration.lines[i] || "",
      motion: MOTIONS[MOTION_KEYS[i % MOTION_KEYS.length]],
    });
  }

  onProgress({ phase: "timeline", pct: 92, message: "Montando escenas y textos en la línea de tiempo…" });
  snapshot("Crear video con IA");
  const startBase = projectDuration() > 0 ? projectDuration() + 0.25 : 0;
  let cursor = startBase;
  let firstClipId = null;

  generated.forEach((scene, index) => {
    const clip = {
      id: uid("clip"),
      kind: "image",
      mediaId: scene.mediaId,
      name: `Escena IA ${index + 1}`,
      start: cursor,
      duration: 4,
      in: 0,
      volume: 1,
      speed: 1,
      filter: { ...DEFAULT_FILTER },
      transform: { ...DEFAULT_TRANSFORM },
      motion: { ...scene.motion },
    };
    addClip("t-video", clip);
    if (!firstClipId) firstClipId = clip.id;

    if (scene.text) {
      const subtitle = createTextClip({
        content: scene.text,
        start: cursor + 0.35,
        duration: Math.min(3.2, 3.55),
        y: 0.8,
      });
      subtitle.text.size = 62;
      subtitle.text.weight = 700;
      subtitle.text.bgOpacity = 0.45;
      subtitle.text.animation = "slide";
      subtitle.name = "Narración IA";
      addClip("t-text", subtitle);
    }
    cursor += 4.05;
  });

  const title = createTextClip({
    content: cleanIdea.slice(0, 64),
    start: startBase + 0.15,
    duration: 2.6,
    y: 0.2,
  });
  title.text.size = 92;
  title.text.weight = 900;
  title.text.bgOpacity = 0;
  title.text.animation = "zoom";
  title.name = "Título IA";
  addClip("t-text", title);

  touch();
  emit("project");
  emit("change");
  if (firstClipId) {
    store.selection = { clipId: firstClipId, trackId: "t-video" };
    emit("selection", store.selection);
  }

  onProgress({ phase: "done", pct: 100, message: "Video con IA listo en la línea de tiempo." });
  return {
    count,
    fallbackNarration: narration.fallback,
    start: startBase,
    end: cursor,
    firstClipId,
  };
}
