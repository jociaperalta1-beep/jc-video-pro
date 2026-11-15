/* ============================================================
   JC VIDEO PRO — Paneles laterales (medios, texto, audio, filtros, IA)
   ============================================================ */

import {
  $, $$, store, on, emit, snapshot, touch, addClip, createTextClip,
  isPremium, escapeHtml, fmtTime, bytes, clamp, DEFAULT_FILTER, ANIMATIONS,
  isProAnimation,
} from "./core.js";
import { addMediaClip, removeMedia, mediaLabel, importAudioBlob } from "./media.js";
import { generateAIVideo } from "./ai.js";
import { searchITunes, addTrackToLibrary, downloadTrack } from "./music.js";
import {
  getMonetization, openDirectLink, grantReward, canExportWithoutWatermark,
  rewardMinutesLeft, hasProAccess, checkAIQuota, recordAIUse, grantExtraAIUses,
  hasProTipsUnlocked, unlockProTips, formatVideoEmbedUrl,
} from "./monetization.js";
import { toast, confirmAction, openModal, closeModal } from "./ui.js";

let currentPanel = "media";

const TITLES = {
  media: "Medios",
  text: "Texto y títulos",
  audio: "Audio y música",
  effects: "Filtros y color",
  ai: "Herramientas IA",
};

const FILTER_PRESETS = {
  original: { label: "Original", swatch: "linear-gradient(135deg,#334155,#0f172a)", values: {} },
  cine: { label: "Cine", swatch: "linear-gradient(135deg,#1d4ed8,#0b1026)", values: { brightness: 97, contrast: 118, saturate: 88, sepia: 8, hue: 0, grayscale: 0, blur: 0 } },
  calido: { label: "Cálido", swatch: "linear-gradient(135deg,#f59e0b,#7c2d12)", values: { brightness: 105, contrast: 104, saturate: 118, sepia: 16, hue: -4, grayscale: 0, blur: 0 } },
  frio: { label: "Frío", swatch: "linear-gradient(135deg,#38bdf8,#1e1b4b)", values: { brightness: 102, contrast: 107, saturate: 94, sepia: 0, hue: 9, grayscale: 0, blur: 0 } },
  vivo: { label: "Vívido", swatch: "linear-gradient(135deg,#f43f5e,#7c3aed)", values: { brightness: 105, contrast: 112, saturate: 145, sepia: 0, hue: 0, grayscale: 0, blur: 0 } },
  bn: { label: "B/N", swatch: "linear-gradient(135deg,#e5e7eb,#111827)", values: { brightness: 103, contrast: 114, saturate: 0, grayscale: 100, sepia: 0, hue: 0, blur: 0 } },
  vintage: { label: "Vintage", swatch: "linear-gradient(135deg,#d6b98c,#7c5a3a)", values: { brightness: 105, contrast: 94, saturate: 74, sepia: 34, grayscale: 0, hue: -8, blur: 0 } },
  neon: { label: "Neón", premium: true, swatch: "linear-gradient(135deg,#22d3ee,#a855f7)", values: { brightness: 104, contrast: 121, saturate: 162, sepia: 0, hue: 16, grayscale: 0, blur: 0 } },
  cyber: { label: "Cyber", premium: true, swatch: "linear-gradient(135deg,#f0abfc,#0ea5e9)", values: { brightness: 100, contrast: 126, saturate: 142, sepia: 0, hue: -22, grayscale: 0, blur: 0 } },
  sueno: { label: "Sueño", premium: true, swatch: "linear-gradient(135deg,#c4b5fd,#fbcfe8)", values: { brightness: 108, contrast: 92, saturate: 106, sepia: 4, hue: 6, grayscale: 0, blur: 1 } },
};

const TEXT_PRESETS = [
  { key: "title", label: "Título grande", content: "TU TÍTULO AQUÍ", size: 128, weight: 900, y: 0.28, bgOpacity: 0, color: "#ffffff" },
  { key: "sub", label: "Subtítulo", content: "Un subtítulo que impacta", size: 78, weight: 700, y: 0.8, bgOpacity: 0.55, color: "#ffffff" },
  { key: "quote", label: "Cita", content: "“Crea contenido que conecte”", size: 70, weight: 600, y: 0.5, bgOpacity: 0.42, color: "#ffffff" },
  { key: "watermark", label: "Marca de agua", content: "JC VIDEO PRO", size: 44, weight: 800, y: 0.93, bgOpacity: 0, color: "#d8b4fe" },
];

const musicState = {
  term: "",
  results: [],
  loading: false,
  error: "",
  previewId: null,
  audio: null,
};

const aiState = {
  busy: false,
  status: "",
  pct: 0,
  error: false,
};

let dictation = null;
let lastTextAnimation = "fade";

export function initPanels() {
  const body = $("#panelBody");
  if (!body) return;

  $("#rail")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".rail-btn[data-panel]");
    if (!btn) return;
    setPanel(btn.dataset.panel);
    if (window.innerWidth <= 980) $("#app")?.classList.add("show-panel");
  });

  body.addEventListener("click", onPanelClick);
  body.addEventListener("keydown", (e) => {
    if (e.target.id === "musicQuery" && e.key === "Enter") {
      e.preventDefault();
      doMusicSearch();
    }
  });

  on("media", () => {
    if (currentPanel === "media" || currentPanel === "audio") renderPanel();
  });
  on("selection", () => {
    if (currentPanel === "effects") renderPanel();
  });
  on("project", () => {
    if (currentPanel === "effects") renderPanel();
  });

  setPanel("media");
}

export function setPanel(name) {
  if (!TITLES[name]) return;
  if (name !== "audio" && musicState.audio) {
    try { musicState.audio.pause(); } catch { /* ignore */ }
    musicState.previewId = null;
  }
  currentPanel = name;
  $$(".rail-btn[data-panel]").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
  const title = $("#panelTitle");
  if (title) title.textContent = TITLES[name];
  renderPanel();
}

export function renderPanel() {
  const body = $("#panelBody");
  if (!body || !store.project) return;
  if (currentPanel === "media") body.innerHTML = mediaPanelHTML();
  else if (currentPanel === "text") body.innerHTML = textPanelHTML();
  else if (currentPanel === "audio") body.innerHTML = audioPanelHTML();
  else if (currentPanel === "effects") body.innerHTML = effectsPanelHTML();
  else if (currentPanel === "ai") body.innerHTML = aiPanelHTML();
}

/* ---------------- Contenido de paneles ---------------- */
function mediaPanelHTML() {
  const list = [...store.media.values()].sort((a, b) => b.id.localeCompare(a.id));
  return `
    <div class="import-row">
      <button class="btn primary" data-action="import">
        <svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3h16v-3"/></svg>
        Importar archivos
      </button>
    </div>
    <div class="side-label">Biblioteca · ${list.length}</div>
    ${list.length ? `<div class="media-grid">${list.map(mediaCardHTML).join("")}</div>` : `
      <div class="empty-note">
        <strong>Tu biblioteca está vacía</strong>
        Importa videos, fotos o música desde tu dispositivo.<br>
        También puedes arrastrarlos al área de vista previa.
      </div>`}
    <p class="mini-help">Los archivos se guardan en este navegador. Nada se sube a un servidor en esta versión.</p>
  `;
}

function mediaCardHTML(media) {
  const isVideo = media.type === "video";
  const isImage = media.type === "image";
  const isAudio = media.type === "audio";
  const thumb = media.thumb
    ? `<img src="${media.thumb}" alt="" loading="lazy">`
    : `<div style="width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#064e3b,#0f172a);font-size:18px;color:#6ee7b7">♪</div>`;
  return `
    <div class="media-card" data-media="${media.id}">
      <div class="mc-thumb" data-action="add" title="Añadir a la línea de tiempo">
        ${thumb}
        <span class="mc-kind">${(isVideo ? "VIDEO" : isImage ? "FOTO" : "AUDIO")}</span>
        <span class="mc-dur">${escapeHtml(mediaLabel(media))}</span>
      </div>
      <div class="mc-info">
        <div class="mc-name" title="${escapeHtml(media.name)}">${escapeHtml(media.name)}</div>
        <div class="mc-actions">
          <button class="mc-add" data-action="add">+ ${isAudio ? "Audio" : "Pista"}</button>
          ${isVideo || isImage ? `<button class="mc-add" data-action="overlay">Sup.</button>` : ""}
          <button class="mc-del" data-action="delete-media" title="Eliminar de la biblioteca">✕</button>
        </div>
      </div>
    </div>`;
}

function textPanelHTML() {
  return `
    <div class="side-label">Añadir texto en el cursor</div>
    <div class="chip-row">
      ${TEXT_PRESETS.map((p) => `<button class="chip" data-action="text-preset" data-preset="${p.key}">${p.label}</button>`).join("")}
    </div>
    <div class="side-label" style="margin-top:16px">Animaciones estilo CapCut</div>
    <div class="chip-row">
      ${Object.entries(ANIMATIONS).filter(([key]) => key !== "none").map(([key, value]) => `
        <button class="chip" data-action="text-anim" data-anim="${key}" title="${value.pro ? "PRO" : "Gratis"}">
          ${value.label}${value.pro ? " · PRO" : ""}
        </button>`).join("")}
    </div>
    <p class="mini-help">Toca una animación con un texto seleccionado para aplicarla, o para usarla en el próximo texto.</p>
    <div class="empty-note" style="margin-top:14px">
      <strong>Edita el texto después</strong>
      Selecciona el clip de texto en la línea de tiempo y cambia contenido, tamaño, color, fondo y animación en el panel de propiedades.
    </div>
    <p class="mini-help">Consejo: haz doble clic sobre un clip de texto para saltar a su inicio.</p>
  `;
}

function audioPanelHTML() {
  const audioList = [...store.media.values()].filter((m) => m.type === "audio");
  return `
    <div class="import-row">
      <button class="btn primary" data-action="import">Importar música o voz</button>
    </div>

    <div class="ai-card" style="margin-top:14px">
      <h3>Buscador de Música (iTunes API)</h3>
      <p>Busca canciones reales con previews de 30s libres para tus videos.</p>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <input type="text" class="input" id="itunesSearchInput" placeholder="Artista o canción..." style="flex:1">
        <button class="btn primary" data-action="itunes-search">Buscar</button>
      </div>
      <div id="itunesResults" style="margin-top:10px; display:flex; flex-direction:column; gap:6px; max-height:180px; overflow-y:auto;"></div>
    </div>

    <div class="ai-card" style="margin-top:14px">
      <h3>Estudio DJ / Instrumentales</h3>
      <p>Genera bases instrumentales instantáneas con sintetizador Web Audio.</p>
      <div class="field-row" style="margin-top:8px">
        <label>Estilo</label>
        <select class="select" id="djGenre">
          <option value="electronica">Electrónica / Dance</option>
          <option value="reggaeton">Reggaetón / Urbano</option>
          <option value="lofi">Lo-Fi Chill</option>
          <option value="cinematico">Cinemático Épico</option>
        </select>
      </div>
      <div class="field-row" style="margin-top:8px">
        <label>BPM (<span id="bpmVal">120</span>)</label>
        <input type="range" class="range" id="djBpm" min="80" max="160" step="4" value="120">
      </div>
      <button class="btn accent wide" data-action="dj-generate" style="margin-top:8px">Generar Instrumental DJ</button>
    </div>

    <div class="side-label" style="margin-top:16px">Pistas de audio · ${audioList.length}</div>
    ${audioList.length ? `<div class="media-grid">${audioList.map(mediaCardHTML).join("")}</div>` : `
      <div class="empty-note">
        <strong>Sin audio todavía</strong>
        Importa tus propias canciones o genera instrumentales arriba.
      </div>`}
  `;
}

function effectsPanelHTML() {
  const selected = store.selection ? store.project.tracks.flatMap((t) => t.clips).find((c) => c.id === store.selection.clipId) : null;
  const target = selected && (selected.kind === "video" || selected.kind === "image")
    ? `Aplicar a: <b>${escapeHtml(selected.name || "clip")}</b>`
    : "Selecciona un clip de video o foto";
  const premium = isPremium();
  return `
    <div class="side-label">Filtros de color</div>
    <p class="mini-help" style="margin-bottom:10px">${target}</p>
    <div class="filter-grid">
      ${Object.entries(FILTER_PRESETS).map(([key, p]) => `
        <button class="filter-tile ${p.premium && !premium ? "locked" : ""}" data-action="filter" data-filter="${key}">
          <span class="ft-swatch" style="background:${p.swatch}"></span>${p.label}
        </button>`).join("")}
    </div>
    <button class="btn tiny wide ghost" data-action="filter-all" style="margin-top:12px">Aplicar el filtro elegido a todos los clips visuales</button>
    <p class="mini-help">Los filtros no destructivos se aplican en tiempo real y también en la exportación.</p>
    ${!premium ? `
      <div class="honest-note">
        Neón, Cyber y Sueño son filtros Premium. <button class="link" data-action="open-premium">Ver planes</button>
      </div>` : ""}
  `;
}

function aiPanelHTML() {
  const quota = checkAIQuota();
  const reward = rewardActive();
  const voices = typeof window !== "undefined" && window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const esVoices = voices.filter((v) => String(v.lang || "").toLowerCase().startsWith("es"));

  return `
    <div class="ai-card">
      <h3>Creador de Video con IA</h3>
      <p>Genera imágenes de alta calidad, títulos dinámicos y narración estructurada automáticamente en la línea de tiempo usando Pollinations AI.</p>
      <div class="field-row" style="margin-top:10px">
        <label>Idea o guion</label>
        <textarea class="textarea" id="aiIdea" rows="3" placeholder="Ej: Las maravillas de la inteligencia artificial y el futuro..."></textarea>
      </div>
      <div class="field-row" style="margin-top:8px">
        <label>Escenas</label>
        <select class="select" id="aiScenes">
          <option value="3">3 escenas (corta)</option>
          <option value="4" selected>4 escenas (estándar)</option>
          <option value="5">5 escenas (dinámica)</option>
          <option value="6">6 escenas (larga)</option>
        </select>
      </div>
      <div class="field-row" style="margin-top:8px">
        <label>Estilo visual</label>
        <select class="select" id="aiStyle">
          <option value="cinematico">Cinemático dramático</option>
          <option value="neon">Neón Cyberpunk</option>
          <option value="minimal">Minimalista elegante</option>
          <option value="realista">Fotorealista</option>
          <option value="ilustracion">Ilustración digital</option>
        </select>
      </div>
      <div class="quota-badge" style="margin-top:10px">
        Usos de IA hoy: <strong>${quota.unlimited ? "Ilimitados (Premium)" : `${quota.remaining} de ${quota.limit} disponibles`}</strong>
      </div>
      <button class="btn primary wide" data-action="ai-create" style="margin-top:10px">Generar Video con IA</button>
    </div>

    <div class="ai-card" style="margin-top:16px">
      <h3>Creador de Música con IA</h3>
      <p>Genera melodías y beats automáticos sin copyright según el género y BPM.</p>
      <div class="field-row" style="margin-top:8px">
        <label>Género</label>
        <select class="select" id="aiMusicGenre">
          <option value="electronica">Electrónica</option>
          <option value="reggaeton">Urbano / Reggaetón</option>
          <option value="lofi">Lo-Fi</option>
          <option value="cinematico">Cinemático</option>
        </select>
      </div>
      <div class="field-row" style="margin-top:8px">
        <label>BPM</label>
        <input type="range" class="range" id="aiMusicBpm" min="80" max="150" step="5" value="120">
      </div>
      <button class="btn primary wide" data-action="ai-music-create" style="margin-top:8px">Generar Música con IA</button>
    </div>

    <div class="ai-card" style="margin-top:16px">
      <h3>Voz en Off con IA (Web Speech API)</h3>
      <p>Convierte texto en voz natural, escúchala y añádela sincronizada a la línea de tiempo.</p>
      <div class="field-row" style="margin-top:10px">
        <label>Texto a voz</label>
        <textarea class="textarea" id="aiVoiceText" rows="3" placeholder="Escribe lo que dirá la voz en off..."></textarea>
      </div>
      <div class="field-row" style="margin-top:8px">
        <label>Voz</label>
        <select class="select" id="aiVoiceSelect">
          ${esVoices.length ? esVoices.map((v) => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join("") : `<option value="">Voz predeterminada del sistema</option>`}
        </select>
      </div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn ghost" data-action="ai-speak" style="flex:1">Escuchar voz</button>
        <button class="btn primary" data-action="ai-add-voice" style="flex:1">Añadir al vídeo</button>
      </div>
    </div>

    <div class="ai-card" style="margin-top:16px">
      <h3>Potencia JC VIDEO PRO</h3>
      <p>¿Necesitas más usos de IA o exportación sin marca de agua sin pagar? Gana tiempo PRO gratis viendo un anuncio patrocinado.</p>
      <div class="quota-badge" style="margin-top:8px">
        Estado: <strong>${reward ? `PRO activo (${rewardMinutesLeft()} min restantes)` : "Modo Gratis"}</strong>
      </div>
      <button class="btn accent wide" data-action="ai-reward" style="margin-top:10px">Ver anuncio / Patrocinador (+2 IA & 30m PRO)</button>
    </div>
  `;
}

/* ---------------- Acciones ---------------- */
function findMediaFrom(e) {
  const card = e.target.closest("[data-media]");
  return card ? store.media.get(card.dataset.media) : null;
}

async function onPanelClick(e) {
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === "import") {
    $("#fileMedia")?.click();
    return;
  }

  if (action === "open-premium") {
    emit("open-premium");
    return;
  }

  if (action === "text-preset") {
    addTextPreset(actionEl.dataset.preset);
    return;
  }

  if (action === "text-anim") {
    applyTextAnimation(actionEl.dataset.anim);
    return;
  }

  if (action === "ai-create") {
    handleAICreate();
    return;
  }

  if (action === "ai-speak") {
    handleAISpeak();
    return;
  }

  if (action === "ai-add-voice") {
    handleAIAddVoice();
    return;
  }

  if (action === "ai-reward") {
    handleAIReward();
    return;
  }

  if (action === "itunes-search") {
    handleItunesSearch();
    return;
  }

  if (action === "itunes-add") {
    handleItunesAdd(actionEl.dataset.preview, actionEl.dataset.title, actionEl.dataset.artist, actionEl.dataset.artwork);
    return;
  }

  if (action === "dj-generate" || action === "ai-music-create") {
    handleGenerateMusic(action === "ai-music-create" ? "ai" : "dj");
    return;
  }

  if (action === "filter") {
    applyFilter(actionEl.dataset.filter);
    return;
  }

  if (action === "filter-all") {
    applyFilterAll();
    return;
  }

  const media = findMediaFrom(e);
  if (!media) return;

  if (action === "add") {
    const trackId = media.type === "audio" ? "t-audio" : "t-video";
    const clip = addMediaClip(media.id, trackId);
    if (clip) {
      toast("Clip añadido a la línea de tiempo.", "ok");
      emit("project");
    } else {
      toast("No se pudo añadir el clip.", "err");
    }
    return;
  }

  if (action === "overlay") {
    const clip = addMediaClip(media.id, "t-overlay");
    if (clip) {
      toast("Clip añadido a la pista de superposición.", "ok");
      emit("project");
    } else {
      toast("No se pudo añadir el clip.", "err");
    }
    return;
  }

  if (action === "delete-media") {
    const ok = await confirmAction({
      title: "Eliminar de la biblioteca",
      message: `Se eliminará «${escapeHtml(media.name)}» y todos los clips que lo usan. Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    await removeMedia(media.id);
    emit("project");
    toast("Archivo eliminado de la biblioteca.", "ok");
  }
}

function addTextPreset(key) {
  const preset = TEXT_PRESETS.find((p) => p.key === key);
  if (!preset) return;
  snapshot("Añadir texto");
  const clip = createTextClip({
    content: preset.content,
    size: preset.size,
    start: store.time,
    duration: 4,
    y: preset.y,
  });
  clip.text.weight = preset.weight;
  clip.text.bgOpacity = preset.bgOpacity;
  clip.text.color = preset.color;
  clip.text.animation = lastTextAnimation || "fade";
  clip.name = preset.label;
  addClip("t-text", clip);
  store.selection = { clipId: clip.id, trackId: "t-text" };
  emit("selection", store.selection);
  emit("project");
  emit("change");
  toast("Texto añadido. Edítalo en Propiedades.", "ok");
}

function applyTextAnimation(key) {
  if (!ANIMATIONS[key]) return;
  if (isProAnimation(key) && !hasProAccess()) {
    emit("open-premium");
    toast("Esta animación es PRO. Desbloquéala con Premium o con un anuncio.", "err");
    return;
  }
  const found = store.selection ? store.project.tracks.flatMap((t) => t.clips).find((c) => c.id === store.selection.clipId) : null;
  if (found && found.kind === "text") {
    snapshot("Cambiar animación de texto");
    found.text = found.text || {};
    found.text.animation = key;
    touch();
    emit("project");
    emit("notify", { msg: `Animación «${ANIMATIONS[key].label}» aplicada.`, type: "ok" });
  } else {
    lastTextAnimation = key;
    toast(`Animación «${ANIMATIONS[key].label}» lista para el próximo texto.`, "ok");
  }
}

function visualSelectedClip() {
  if (!store.selection) return null;
  return store.project.tracks.flatMap((t) => t.clips).find(
    (c) => c.id === store.selection.clipId && (c.kind === "video" || c.kind === "image")
  ) || null;
}

function applyFilter(key) {
  const preset = FILTER_PRESETS[key];
  if (!preset) return;
  if (preset.premium && !isPremium()) {
    emit("open-premium");
    return;
  }
  const clip = visualSelectedClip();
  if (!clip) {
    toast("Selecciona un clip de video o foto en la línea de tiempo.", "err");
    return;
  }
  snapshot("Aplicar filtro");
  clip.filter = { ...clip.filter, ...preset.values };
  touch();
  emit("project");
  emit("notify", { msg: `Filtro «${preset.label}» aplicado.`, type: "ok" });
}

let lastFilterKey = null;
function applyFilterAll() {
  const key = lastFilterKey;
  if (!key) {
    toast("Primero toca un filtro de la lista y luego pulsa este botón.", "err");
    return;
  }
  const preset = FILTER_PRESETS[key];
  if (preset.premium && !isPremium()) { emit("open-premium"); return; }
  const clips = store.project.tracks.flatMap((t) => t.clips).filter((c) => c.kind === "video" || c.kind === "image");
  if (!clips.length) { toast("No hay clips visuales en el proyecto.", "err"); return; }
  snapshot("Aplicar filtro a todos");
  for (const clip of clips) clip.filter = { ...clip.filter, ...preset.values };
  touch();
  emit("project");
  toast(`Filtro «${preset.label}» aplicado a ${clips.length} clip(s).`, "ok");
}

/* Registrar el último filtro tocado (para «aplicar a todos») */
document.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-action='filter']");
  if (tile) lastFilterKey = tile.dataset.filter;
});

async function handleAICreate() {
  const quota = checkAIQuota();
  if (!quota.allowed) {
    toast("Has agotado tus usos gratuitos de IA de hoy. Activa Premium o mira un anuncio para obtener más.", "err");
    emit("open-premium");
    return;
  }
  const idea = $("#aiIdea")?.value.trim();
  if (!idea) {
    toast("Escribe una idea o guion para generar el video.", "err");
    return;
  }
  const scenes = $("#aiScenes")?.value || 4;
  const style = $("#aiStyle")?.value || "cinematico";

  openModal(`
    <h2>Generando vídeo con IA…</h2>
    <p class="modal-sub" id="aiGenStatus">Iniciando conexión con Pollinations AI…</p>
    <div style="margin:20px 0; background:rgba(255,255,255,0.08); border-radius:8px; height:10px; overflow:hidden;">
      <div id="aiGenProgress" style="background:linear-gradient(90deg, #a855f7, #38bdf8); width:5%; height:100%; transition:width 0.3s;"></div>
    </div>
  `, { locked: true });

  try {
    recordAIUse();
    await generateAIVideo({
      idea,
      scenes,
      style,
      onProgress: ({ pct, message }) => {
        const bar = $("#aiGenProgress");
        const status = $("#aiGenStatus");
        if (bar) bar.style.width = pct + "%";
        if (status) status.textContent = message;
      },
    });
    closeModal(true);
    toast("¡Vídeo con IA generado con éxito!", "ok");
    renderPanel();
  } catch (err) {
    closeModal(true);
    console.error("[JCVP] IA video", err);
    toast("Error al generar vídeo con IA: " + (err.message || err), "err");
  }
}

function handleAISpeak() {
  const text = $("#aiVoiceText")?.value.trim();
  if (!text) {
    toast("Escribe algún texto para escuchar.", "err");
    return;
  }
  if (!window.speechSynthesis) {
    toast("Tu navegador no soporta síntesis de voz.", "err");
    return;
  }
  const voiceURI = $("#aiVoiceSelect")?.value;
  const voices = window.speechSynthesis.getVoices() || [];
  const voice = voices.find((v) => v.voiceURI === voiceURI) || voices.find((v) => v.lang.startsWith("es"));
  const utt = new SpeechSynthesisUtterance(text);
  if (voice) utt.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utt);
  toast("Reproduciendo voz en off…", "ok");
}

function handleAIAddVoice() {
  const text = $("#aiVoiceText")?.value.trim();
  if (!text) {
    toast("Escribe el texto de la voz en off.", "err");
    return;
  }
  const voiceURI = $("#aiVoiceSelect")?.value;

  snapshot("Añadir voz IA");
  const duration = Math.max(2, Math.min(30, text.split(/\s+/).length * 0.45));
  const clip = createTextClip({
    content: "",
    start: store.time,
    duration,
    y: 0.5,
  });
  clip.name = `Voz IA · ${text.slice(0, 24)}`;
  clip.voiceover = { text, voiceURI, rate: 1, pitch: 1 };
  addClip("t-text", clip);
  store.selection = { clipId: clip.id, trackId: "t-text" };
  emit("selection", store.selection);
  emit("project");
  emit("change");
  toast("Voz IA sincronizada añadida a la línea de tiempo.", "ok");
}

function handleAIReward() {
  openDirectLink();
  grantReward(30);
  grantExtraAIUses(2);
  toast("¡Has ganado 30 minutos de acceso PRO y +2 usos de IA!", "ok");
  renderPanel();
}

async function handleItunesSearch() {
  const term = $("#itunesSearchInput")?.value.trim();
  const resBox = $("#itunesResults");
  if (!resBox) return;
  if (!term) {
    toast("Escribe el nombre de un artista o canción.", "err");
    return;
  }
  resBox.innerHTML = `<div style="font-size:12px; opacity:0.7; padding:4px;">Buscando en iTunes…</div>`;
  try {
    const tracks = await searchITunes(term, 8);
    if (!tracks.length) {
      resBox.innerHTML = `<div style="font-size:12px; opacity:0.7; padding:4px;">No se encontraron canciones.</div>`;
      return;
    }
    resBox.innerHTML = tracks.map((t) => `
      <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.04); padding:6px; border-radius:6px;">
        <img src="${t.artwork || ""}" style="width:36px; height:36px; border-radius:4px; object-fit:cover;" onerror="this.style.display='none'">
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.title)}</div>
          <div style="font-size:11px; opacity:0.7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.artist)}</div>
        </div>
        <button class="btn tiny primary" data-action="itunes-add" data-preview="${escapeHtml(t.previewUrl)}" data-title="${escapeHtml(t.title)}" data-artist="${escapeHtml(t.artist)}" data-artwork="${escapeHtml(t.artwork)}">Añadir</button>
      </div>
    `).join("");
  } catch (err) {
    console.error("[JCVP] iTunes", err);
    resBox.innerHTML = `<div style="font-size:12px; color:#f87171; padding:4px;">Error en la búsqueda.</div>`;
  }
}

async function handleItunesAdd(previewUrl, title, artist, artwork) {
  if (!previewUrl) return;
  try {
    const track = { previewUrl, title, artist, artwork, duration: 30 };
    await addTrackToLibrary(track);
    toast("Pista añadida a la biblioteca de audio.", "ok");
    renderPanel();
  } catch (err) {
    console.error("[JCVP] add track", err);
    toast("No se pudo añadir la pista.", "err");
  }
}

async function handleGenerateMusic(mode) {
  const genre = mode === "ai" ? ($("#aiMusicGenre")?.value || "electronica") : ($("#djGenre")?.value || "electronica");
  const bpm = mode === "ai" ? (Number($("#aiMusicBpm")?.value) || 120) : (Number($("#djBpm")?.value) || 120);

  openModal(`
    <h2>Generando instrumental con IA…</h2>
    <p class="modal-sub">Sintetizando base instrumental (${genre.toUpperCase()} a ${bpm} BPM)…</p>
    <div style="margin:20px 0; background:rgba(255,255,255,0.08); border-radius:8px; height:10px; overflow:hidden;">
      <div style="background:linear-gradient(90deg, #a855f7, #38bdf8); width:100%; height:100%;"></div>
    </div>
  `, { locked: true });

  try {
    await generateAIMusic({ genre, bpm });
    closeModal(true);
    toast("¡Instrumental generada y añadida a la biblioteca!", "ok");
    renderPanel();
  } catch (err) {
    closeModal(true);
    console.error("[JCVP] AI music", err);
    toast("Error al generar instrumental: " + (err.message || err), "err");
  }
}

async function generateAIMusic({ genre = "electronica", bpm = 120 } = {}) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const sampleRate = ctx.sampleRate;
  const durationSec = 12;
  const numFrames = sampleRate * durationSec;
  const buffer = ctx.createBuffer(2, numFrames, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const beatInterval = 60 / bpm;

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const beat = Math.floor(t / beatInterval);
    const subBeat = (t % beatInterval) / beatInterval;
    
    let sample = 0;
    if (genre === "electronica" || genre === "reggaeton") {
      if (subBeat < 0.15 && (beat % 2 === 0 || (genre === "reggaeton" && (subBeat < 0.1 || (subBeat > 0.5 && subBeat < 0.6))))) {
        const env = Math.max(0, 1 - subBeat * 8);
        sample += Math.sin(t * 130 * Math.PI) * env * 0.75;
      }
      const freq = 220 * (1 + Math.sin(beat * 0.5) * 0.4);
      sample += Math.sin(t * freq * 2 * Math.PI) * 0.14 * Math.sin(t * 4 * Math.PI);
    } else if (genre === "lofi") {
      sample += (Math.random() * 2 - 1) * 0.04;
      const chordFreq = 174.61;
      sample += Math.sin(t * chordFreq * 2 * Math.PI) * 0.1 * Math.sin(t * 0.5 * Math.PI);
    } else {
      sample += Math.sin(t * 110 * 2 * Math.PI) * 0.22 * Math.sin(t * 0.2 * Math.PI);
    }

    left[i] = clamp(sample, -1, 1);
    right[i] = clamp(sample, -1, 1);
  }

  const wavBlob = bufferToWav(buffer, numFrames);
  const media = await importAudioBlob(wavBlob, {
    name: `Música IA · ${genre.toUpperCase()} (${bpm} BPM)`,
    fileName: `ai_music_${genre}_${Date.now()}.wav`,
    source: "IA",
    duration: durationSec,
  });
  return media;
}

function bufferToWav(buffer, numFrames) {
  const numOfChan = buffer.numberOfChannels;
  const length = numFrames * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  let sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function writeString(str) {
    for (let i = 0; i < str.length; i++) {
      out.setUint8(pos++, str.charCodeAt(i));
    }
  }

  writeString("RIFF");
  out.setUint32(pos, length - 8, true); pos += 4;
  writeString("WAVE");
  writeString("fmt ");
  out.setUint32(pos, 16, true); pos += 4;
  out.setUint16(pos, 1, true); pos += 2;
  out.setUint16(pos, numOfChan, true); pos += 2;
  out.setUint32(pos, sampleRate, true); pos += 4;
  out.setUint32(pos, sampleRate * numOfChan * 2, true); pos += 4;
  out.setUint16(pos, numOfChan * 2, true); pos += 2;
  out.setUint16(pos, 16, true); pos += 2;
  writeString("data");
  out.setUint32(pos, length - pos - 4, true); pos += 4;

  const channels = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

  while (offset < numFrames) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([out.buffer], { type: "audio/wav" });
}
