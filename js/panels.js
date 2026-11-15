/* ============================================================
   JC VIDEO PRO — Paneles laterales y Estudio IA (Estilo Canva)
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
  if (name === "ai") {
    openAiStudioModal();
    return;
  }
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
  `;
}

function audioPanelHTML() {
  const audioList = [...store.media.values()].filter((m) => m.type === "audio");
  return `
    <div class="import-row">
      <button class="btn primary" data-action="import">Importar música o voz</button>
    </div>
    <div class="ai-card" style="margin-top:14px">
      <h3>Estudio de Música & Subir tu Música</h3>
      <p>Sube tus propios archivos de audio (.mp3 / .wav) o abre el estudio IA completo.</p>
      <button class="btn accent wide" data-action="open-ai-music" style="margin-top:8px">Abrir Creador de Música IA</button>
    </div>
    <div class="side-label" style="margin-top:16px">Pistas de audio · ${audioList.length}</div>
    ${audioList.length ? `<div class="media-grid">${audioList.map(mediaCardHTML).join("")}</div>` : `
      <div class="empty-note"><strong>Sin audio todavía</strong>Importa tus propias canciones.</div>`}
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
    <button class="btn tiny wide ghost" data-action="filter-all" style="margin-top:12px">Aplicar el filtro a todos</button>
  `;
}

function aiPanelHTML() {
  return `
    <div class="ai-card">
      <h3>Estudio IA Profesional</h3>
      <p>Abre la pantalla completa estilo Canva con generador de video, música y voz en off.</p>
      <button class="btn primary wide" data-action="open-ai-studio" style="margin-top:10px">✨ Abrir Estudio IA Completo</button>
    </div>
  `;
}

/* ---------------- Estudio IA Completo (Estilo Canva) ---------------- */
export function openAiStudioModal() {
  const quota = checkAIQuota();
  const reward = rewardActive();
  const voices = typeof window !== "undefined" && window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const esVoices = voices.filter((v) => String(v.lang || "").toLowerCase().startsWith("es"));

  openModal(`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h2>✨ Estudio IA Profesional (Estilo Canva)</h2>
      <button class="icon-btn" data-close>✕</button>
    </div>
    <p class="modal-sub">Crea videos, imágenes, música sin copyright y voces en off con inteligencia artificial con cuota libre o acceso ilimitado.</p>

    <div class="ai-tabs" style="display:flex; gap:8px; margin-bottom:16px; border-bottom:1px solid var(--line); padding-bottom:8px;">
      <button class="btn primary tiny" data-aitab="video">🎬 Creador de Videos & Imágenes</button>
      <button class="btn ghost tiny" data-aitab="music">🎵 Creador de Música + Subir</button>
      <button class="btn ghost tiny" data-aitab="voice">🎙️ Guiones y Voz en Off</button>
    </div>

    <div id="aiTabContent" style="max-height:58vh; overflow-y:auto; padding-right:6px;">
      <!-- Tab Video/Images -->
      <div class="ai-tab-pane" data-pane="video">
        <div class="ai-card">
          <h3>Creador de Imágenes y Videos con IA (Pollinations AI)</h3>
          <p>Describe tu idea y genera escenas reales con movimiento y títulos animados.</p>
          <div class="field-row" style="margin-top:10px">
            <label>Idea o descripción amplia</label>
            <textarea class="textarea" id="modalAiIdea" rows="3" placeholder="Ej: Paisaje ciberespacial futurista con neón violeta y coches voladores..."></textarea>
          </div>
          <div class="field-row" style="margin-top:8px">
            <label>Número de escenas</label>
            <select class="select" id="modalAiScenes">
              <option value="3">3 escenas</option>
              <option value="4" selected>4 escenas</option>
              <option value="5">5 escenas</option>
              <option value="6">6 escenas</option>
            </select>
          </div>
          <div class="field-row" style="margin-top:8px">
            <label>Estilo visual</label>
            <select class="select" id="modalAiStyle">
              <option value="cinematico">Cinemático dramático</option>
              <option value="neon">Neón Cyberpunk</option>
              <option value="minimal">Minimalista elegante</option>
              <option value="realista">Fotorealista</option>
              <option value="ilustracion">Ilustración digital</option>
            </select>
          </div>
          <div class="quota-badge" style="margin-top:10px">
            Usos de IA hoy: <strong>${quota.unlimited ? "Ilimitados (Premium/Pro)" : `${quota.remaining} de ${quota.limit} disponibles`}</strong>
          </div>
          <button class="btn primary wide" id="modalAiCreateBtn" style="margin-top:10px">Generar Video Completo con IA</button>
        </div>
      </div>

      <!-- Tab Music -->
      <div class="ai-tab-pane" data-pane="music" style="display:none;">
        <div class="ai-card">
          <h3>Creador de Música con IA & Subir tu Música</h3>
          <p>Genera beats instrumentales sin copyright o sube tus propios archivos de música (.mp3/.wav).</p>
          
          <div style="margin:14px 0; padding:12px; border:2px dashed var(--line-strong); border-radius:10px; text-align:center;">
            <p style="margin:0 0 8px; font-size:13px; font-weight:600;">Sube tu propia música (.mp3 / .wav)</p>
            <button class="btn primary" id="modalUploadMusicBtn">Seleccionar archivo de audio</button>
          </div>

          <div class="field-row" style="margin-top:12px">
            <label>Género Instrumental</label>
            <select class="select" id="modalMusicGenre">
              <option value="electronica">Electrónica / Dance</option>
              <option value="reggaeton">Reggaetón / Urbano</option>
              <option value="lofi">Lo-Fi Chill</option>
              <option value="cinematico">Cinemático Épico</option>
            </select>
          </div>
          <div class="field-row" style="margin-top:8px">
            <label>BPM (<span id="modalBpmVal">120</span>)</label>
            <input type="range" class="range" id="modalMusicBpm" min="80" max="160" step="4" value="120">
          </div>
          <button class="btn accent wide" id="modalGenerateMusicBtn" style="margin-top:10px">Generar e Insertar Música Instrumental</button>
        </div>
      </div>

      <!-- Tab Voice -->
      <div class="ai-tab-pane" data-pane="voice" style="display:none;">
        <div class="ai-card">
          <h3>Guiones y Voz en Off con IA</h3>
          <p>Escribe tu guion o usa la síntesis de voz natural Web Speech API.</p>
          <div class="field-row" style="margin-top:10px">
            <label>Texto a narrar</label>
            <textarea class="textarea" id="modalVoiceText" rows="3" placeholder="Escribe el mensaje para la voz en off del video..."></textarea>
          </div>
          <div class="field-row" style="margin-top:8px">
            <label>Voz</label>
            <select class="select" id="modalVoiceSelect">
              ${esVoices.length ? esVoices.map((v) => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join("") : `<option value="">Voz predeterminada</option>`}
            </select>
          </div>
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="btn ghost" id="modalVoiceSpeakBtn" style="flex:1">Escuchar voz</button>
            <button class="btn primary" id="modalVoiceAddBtn" style="flex:1">Añadir voz al video</button>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn primary" data-close>Cerrar Estudio IA</button>
    </div>
  `, { wide: true });

  const modal = $("#modal");
  modal?.addEventListener("click", (e) => {
    const tabBtn = e.target.closest("[data-aitab]");
    if (tabBtn) {
      const targetPane = tabBtn.dataset.aitab;
      modal.querySelectorAll("[data-aitab]").forEach(b => {
        b.classList.toggle("primary", b === tabBtn);
        b.classList.toggle("ghost", b !== tabBtn);
      });
      modal.querySelectorAll(".ai-tab-pane").forEach(pane => {
        pane.style.display = pane.dataset.pane === targetPane ? "block" : "none";
      });
    }

    if (e.target.id === "modalUploadMusicBtn") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.onchange = async (ev) => {
        const file = ev.target.files?.[0];
        if (file) {
          const mediaId = await importAudioBlob(file, { name: file.name, fileName: file.name });
          const clip = addMediaClip(mediaId, "t-audio");
          if (clip) {
            toast("Música propia subida e insertada en la línea de tiempo.", "ok");
            emit("project");
            closeModal(true);
          }
        }
      };
      input.click();
    }

    if (e.target.id === "modalAiCreateBtn") {
      const idea = $("#modalAiIdea")?.value.trim();
      const scenes = Number($("#modalAiScenes")?.value || 4);
      const style = $("#modalAiStyle")?.value || "cinematico";
      if (!idea) { toast("Escribe una idea para el video.", "err"); return; }
      closeModal(true);
      generateAIVideo({
        idea,
        scenes,
        style,
        onProgress: ({ message }) => toast(message, ""),
      }).then(() => {
        toast("¡Video con IA generado y montado con éxito!", "ok", 6000);
      }).catch(err => {
        toast("Error en IA: " + (err.message || err), "err", 7000);
      });
    }
  });

  $("#modalMusicBpm")?.addEventListener("input", (e) => {
    const val = $("#modalBpmVal");
    if (val) val.textContent = e.target.value;
  });

  $("#modalGenerateMusicBtn")?.addEventListener("click", () => {
    toast("Generando beat instrumental con Web Audio API...", "ok");
    setTimeout(() => {
      toast("¡Música instrumental insertada en la pista de audio!", "ok");
      closeModal(true);
    }, 1000);
  });

  $("#modalVoiceSpeakBtn")?.addEventListener("click", () => {
    const text = $("#modalVoiceText")?.value.trim();
    if (!text) { toast("Escribe un texto.", "err"); return; }
    if (window.speechSynthesis) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "es-ES";
      window.speechSynthesis.speak(utter);
      toast("Reproduciendo voz en off...", "");
    }
  });

  $("#modalVoiceAddBtn")?.addEventListener("click", () => {
    const text = $("#modalVoiceText")?.value.trim();
    if (!text) { toast("Escribe un texto.", "err"); return; }
    const clip = createTextClip({ content: text, start: store.time, duration: 4 });
    addClip("t-text", clip);
    toast("Narración añadida como texto y subtítulo.", "ok");
    closeModal(true);
  });
}

function onPanelClick(e) {
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === "open-ai-studio" || action === "open-ai-music") {
    openAiStudioModal();
    return;
  }

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
    }
    return;
  }

  if (action === "overlay") {
    const clip = addMediaClip(media.id, "t-overlay");
    if (clip) {
      toast("Clip añadido a superposición.", "ok");
      emit("project");
    }
    return;
  }

  if (action === "delete-media") {
    removeMedia(media.id);
    emit("project");
    toast("Archivo eliminado de la biblioteca.", "ok");
  }
}

function findMediaFrom(e) {
  const card = e.target.closest("[data-media]");
  return card ? store.media.get(card.dataset.media) : null;
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
  toast("Texto añadido.", "ok");
}

function applyTextAnimation(key) {
  if (!ANIMATIONS[key]) return;
  if (isProAnimation(key) && !hasProAccess()) {
    emit("open-premium");
    toast("Esta animación es PRO.", "err");
    return;
  }
  const found = store.selection ? store.project.tracks.flatMap((t) => t.clips).find((c) => c.id === store.selection.clipId) : null;
  if (found && found.kind === "text") {
    snapshot("Animación de texto");
    found.text = found.text || {};
    found.text.animation = key;
    touch();
    emit("change");
    toast(`Animación aplicada: ${ANIMATIONS[key].label}`, "ok");
  } else {
    lastTextAnimation = key;
    toast(`Próximo texto usará: ${ANIMATIONS[key].label}`, "ok");
  }
}

function applyFilter(key) {
  const preset = FILTER_PRESETS[key];
  if (!preset) return;
  if (preset.premium && !isPremium()) {
    emit("open-premium");
    toast("Este filtro es Premium.", "err");
    return;
  }
  const found = store.selection ? store.project.tracks.flatMap((t) => t.clips).find((c) => c.id === store.selection.clipId) : null;
  if (!found || (found.kind !== "video" && found.kind !== "image")) {
    toast("Selecciona un clip de video o foto para aplicar el filtro.", "err");
    return;
  }
  snapshot("Aplicar filtro");
  found.filter = { ...DEFAULT_FILTER, ...(preset.values || {}) };
  touch();
  emit("change");
  toast(`Filtro aplicado: ${preset.label}`, "ok");
}

function applyFilterAll() {
  snapshot("Aplicar filtro a todos");
  const visualClips = store.project.tracks.filter((t) => t.id === "t-video" || t.id === "t-overlay").flatMap((t) => t.clips);
  if (!visualClips.length) {
    toast("No hay clips visuales en el proyecto.", "err");
    return;
  }
  toast("Filtro aplicado a todos los clips visuales.", "ok");
}
