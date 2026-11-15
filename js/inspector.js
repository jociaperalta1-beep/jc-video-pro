/* ============================================================
   JC VIDEO PRO — Panel de propiedades del clip
   ============================================================ */

import {
  $, store, on, emit, snapshot, touch, selectedClip, splitClipAt, duplicateClip,
  removeClip, isPremium, escapeHtml, fmtTime, round, DEFAULT_FILTER, clamp,
  animationOptions, isProAnimation,
} from "./core.js";
import { hasProAccess } from "./monetization.js";

let renderer = null;
let body = null;

const TYPE_LABEL = { video: "VIDEO", image: "FOTO", audio: "AUDIO", text: "TEXTO" };

export function initInspector(rendererInstance) {
  renderer = rendererInstance;
  body = $("#inspectorBody");
  if (!body) return;

  body.addEventListener("input", onInput);
  body.addEventListener("change", onChange);
  body.addEventListener("pointerdown", (e) => {
    if (e.target.matches("input, textarea, select")) snapshot("Editar propiedades");
  });
  body.addEventListener("click", onAction);

  on("selection", renderInspector);
  on("project", renderInspector);
  on("clip-live", syncLiveFields);
  renderInspector();
}

export function renderInspector() {
  if (!body) return;
  const found = selectedClip();
  if (!found?.clip) {
    body.innerHTML = `
      <div class="insp-empty">
        <div class="big">✦</div>
        <p><strong>Ningún clip seleccionado</strong></p>
        <p>Pulsa un clip en la línea de tiempo para ajustar su tamaño, color, velocidad, volumen o texto.</p>
        <p style="margin-top:14px">Consejo: usa <b>Dividir</b> para cortar en el cursor y arrastra los bordes del clip para recortar.</p>
      </div>`;
    return;
  }

  const clip = found.clip;
  const isText = clip.kind === "text";
  const isAudio = clip.kind === "audio";
  const isVisual = !isAudio;
  const premium = isPremium();
  const speedMax = premium ? 4 : 2;
  const f = { ...DEFAULT_FILTER, ...(clip.filter || {}) };
  const tr = clip.transform || { scale: 1, x: 0, y: 0, rotation: 0 };
  const t = clip.text || {};
  const media = store.media.get(clip.mediaId);

  body.innerHTML = `
    <div class="insp-card">
      <div class="insp-title-row">
        <span class="type-badge ${isAudio ? "audio" : isText ? "text" : ""}">${TYPE_LABEL[clip.kind] || "CLIP"}</span>
        <span class="clip-name" title="${escapeHtml(clip.name || "")}">${escapeHtml(clip.name || "Clip")}</span>
      </div>
      <div class="field-row"><label>Inicio</label><span class="val" data-live="start">${fmtTime(clip.start)}</span></div>
      <div class="field-row"><label>Duración</label><span class="val" data-live="duration">${fmtTime(clip.duration)}</span></div>
      ${media?.type !== "image" && media?.width ? `<div class="field-row"><label>Tamaño original</label><span class="val">${media.width}×${media.height}</span></div>` : ""}
      <div class="btn-row" style="margin-top:8px">
        <button class="btn tiny" data-action="goto">Ir al inicio</button>
        <button class="btn tiny" data-action="split">Dividir aquí</button>
      </div>
      <div class="btn-row" style="margin-top:6px">
        <button class="btn tiny" data-action="duplicate">Duplicar</button>
        <button class="btn tiny danger" data-action="delete">Eliminar</button>
      </div>
    </div>

    ${isVisual ? `
    <div class="insp-card">
      <div class="insp-section">
        <h4>Transformación</h4>
        ${sliderRow("Escala", "transform.scale", tr.scale, 0.2, 3, 0.01, (tr.scale || 1).toFixed(2) + "×")}
        ${sliderRow("Posición X", "transform.x", tr.x, -0.5, 0.5, 0.005, Math.round((tr.x || 0) * 100) + "%")}
        ${sliderRow("Posición Y", "transform.y", tr.y, -0.5, 0.5, 0.005, Math.round((tr.y || 0) * 100) + "%")}
        ${sliderRow("Rotación", "transform.rotation", tr.rotation, -180, 180, 1, Math.round(tr.rotation || 0) + "°")}
        <div class="field-row" style="margin-top:8px">
          <label>Animación del clip</label>
          <select class="select" data-anim="clip">
            ${animationOptions(clip.animation || "none")}
          </select>
        </div>
        ${!hasProAccess() ? `<div class="mini-help">Pop, zoom y deslizamiento son gratis. Las animaciones PRO requieren Premium o un anuncio.</div>` : ""}
      </div>
    </div>` : ""}

    ${isText ? `
    <div class="insp-card">
      <div class="insp-section">
        <h4>Texto</h4>
        <textarea class="text-area" data-text="content" placeholder="Escribe tu texto…">${escapeHtml(t.content || "")}</textarea>
        ${sliderRow("Tamaño", "text.size", t.size || 96, 24, 220, 1, Math.round(t.size || 96) + " px")}
        <div class="color-row"><label>Color del texto</label><input type="color" data-text="color" value="${t.color || "#ffffff"}"></div>
        <div class="color-row"><label>Fondo del texto</label><input type="color" data-text="bg" value="${t.bg || "#000000"}"></div>
        ${sliderRow("Opacidad fondo", "text.bgOpacity", Math.round((t.bgOpacity ?? 0.35) * 100), 0, 100, 1, Math.round((t.bgOpacity ?? 0.35) * 100) + "%")}
        ${sliderRow("Posición Y", "text.y", Math.round((t.y ?? 0.5) * 100), 0, 100, 1, Math.round((t.y ?? 0.5) * 100) + "%")}
        <div class="field-row">
          <label>Grosor</label>
          <select class="select" data-text="weight">
            ${[400, 600, 700, 800, 900].map((w) => `<option value="${w}" ${(t.weight || 800) === w ? "selected" : ""}>${w}</option>`).join("")}
          </select>
        </div>
        <div class="field-row">
          <label>Animación</label>
          <select class="select" data-text="animation">
            ${animationOptions(t.animation || "fade")}
          </select>
        </div>
        ${!hasProAccess() ? `<div class="mini-help">Las animaciones PRO (máquina de escribir, neón, pulso y destello) se desbloquean con Premium o con un anuncio.</div>` : ""}
      </div>
    </div>` : ""}

    ${isVisual && !isText ? `
    <div class="insp-card">
      <div class="insp-section">
        <h4>Color y efectos</h4>
        ${sliderRow("Brillo", "filter.brightness", f.brightness, 0, 200, 1, f.brightness + "%")}
        ${sliderRow("Contraste", "filter.contrast", f.contrast, 0, 200, 1, f.contrast + "%")}
        ${sliderRow("Saturación", "filter.saturate", f.saturate, 0, 250, 1, f.saturate + "%")}
        ${sliderRow("Sepia", "filter.sepia", f.sepia, 0, 100, 1, f.sepia + "%")}
        ${sliderRow("Blanco y negro", "filter.grayscale", f.grayscale, 0, 100, 1, f.grayscale + "%")}
        ${sliderRow("Tono", "filter.hue", f.hue, -180, 180, 1, f.hue + "°")}
        ${sliderRow("Desenfoque", "filter.blur", f.blur, 0, 12, 0.5, f.blur + " px")}
        <button class="btn tiny ghost wide" data-action="reset-filter" style="margin-top:4px">Restablecer color</button>
      </div>
    </div>` : ""}

    ${!isText && clip.kind !== "image" ? `
    <div class="insp-card">
      <div class="insp-section">
        <h4>Velocidad y audio</h4>
        ${sliderRow("Velocidad", "speed", clip.speed || 1, 0.25, speedMax, 0.05, (clip.speed || 1).toFixed(2) + "×")}
        ${!premium ? `<div class="mini-help">Hasta 2× en el plan Gratis. ${speedMax < 4 ? "Premium desbloquea hasta 4×." : ""}</div>` : ""}
        ${isAudio || clip.kind === "video" ? sliderRow("Volumen", "volume", Math.round((clip.volume ?? 1) * 100), 0, 100, 1, Math.round((clip.volume ?? 1) * 100) + "%") : ""}
        ${sliderRow("Fundido entrada", "fadeIn", clip.fadeIn || 0, 0, 2, 0.1, (clip.fadeIn || 0).toFixed(1) + "s")}
        ${sliderRow("Fundido salida", "fadeOut", clip.fadeOut || 0, 0, 2, 0.1, (clip.fadeOut || 0).toFixed(1) + "s")}
      </div>
    </div>` : ""}

    ${isText ? `
    <div class="insp-card">
      <div class="insp-section">
        <h4>Apariencia</h4>
        ${sliderRow("Opacidad", "opacity", Math.round((clip.opacity ?? 1) * 100), 0, 100, 1, Math.round((clip.opacity ?? 1) * 100) + "%")}
        ${sliderRow("Fundido entrada", "fadeIn", clip.fadeIn || 0, 0, 2, 0.1, (clip.fadeIn || 0).toFixed(1) + "s")}
        ${sliderRow("Fundido salida", "fadeOut", clip.fadeOut || 0, 0, 2, 0.1, (clip.fadeOut || 0).toFixed(1) + "s")}
      </div>
    </div>` : ""}

    <div class="locked-box">
      <span>Quitar fondo con IA</span>
      <span class="badge-soon">EN DESARROLLO</span>
    </div>
    <p class="mini-help">La eliminación de fondo automática todavía no está implementada. Se añadirá en una fase posterior.</p>
  `;

  bindLocalInputs();
}

function sliderRow(label, prop, value, min, max, step, display) {
  return `<div class="slider-row">
    <span class="mini-label">${label}</span>
    <input class="slider" type="range" data-prop="${prop}" min="${min}" max="${max}" step="${step}" value="${value}">
    <span class="val">${display}</span>
  </div>`;
}

function bindLocalInputs() {
  body.querySelectorAll("input[type=range]").forEach((input) => {
    input.addEventListener("input", () => {
      const val = input.parentElement?.querySelector(".val");
      if (!val) return;
      const prop = input.dataset.prop || "";
      const num = Number(input.value);
      if (prop === "transform.x" || prop === "transform.y") val.textContent = Math.round(num * 100) + "%";
      else if (prop === "transform.scale") val.textContent = num.toFixed(2) + "×";
      else if (prop === "transform.rotation") val.textContent = Math.round(num) + "°";
      else if (prop === "text.size") val.textContent = Math.round(num) + " px";
      else if (prop === "text.bgOpacity" || prop === "text.y" || prop === "volume" || prop === "opacity") val.textContent = Math.round(num) + "%";
      else if (prop === "speed") val.textContent = num.toFixed(2) + "×";
      else if (prop === "fadeIn" || prop === "fadeOut") val.textContent = num.toFixed(1) + "s";
      else if (prop.startsWith("filter.")) {
        const unit = prop.endsWith("hue") ? "°" : prop.endsWith("blur") ? " px" : "%";
        val.textContent = Math.round(num * 10) / 10 + unit;
      }
    });
  });
}

function getClip() {
  return selectedClip()?.clip || null;
}

function setDeep(obj, path, value) {
  const parts = path.split(".");
  let target = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!target[parts[i]] || typeof target[parts[i]] !== "object") target[parts[i]] = {};
    target = target[parts[i]];
  }
  target[parts[parts.length - 1]] = value;
}

function applyAnimationInput(input) {
  const clip = getClip();
  if (!clip) return;
  const next = input.value;
  if (isProAnimation(next) && !hasProAccess()) {
    emit("notify", { msg: "Esta animación es PRO. Actívala con Premium o con un anuncio.", type: "err" });
    emit("open-premium");
    renderInspector();
    return;
  }
  if (input.dataset.text === "animation") {
    clip.text = clip.text || {};
    clip.text.animation = next;
  } else if (input.dataset.anim === "clip") {
    clip.animation = next;
  }
  touch();
  renderer?.drawFrame();
  emit("clip-live", clip);
  emit("change");
  emit("project");
}

function onInput(e) {
  const clip = getClip();
  if (!clip) return;
  const input = e.target;
  if (input.dataset.text === "animation" || input.dataset.anim) {
    applyAnimationInput(input);
    return;
  }
  if (input.dataset.prop) {
    const num = Number(input.value);
    if (input.dataset.prop === "speed") {
      const oldSpeed = clip.speed || 1;
      const sourceLen = clip.duration * oldSpeed;
      const media = store.media.get(clip.mediaId);
      const available = media?.duration ? Math.max(0.1, media.duration - (clip.in || 0)) : sourceLen;
      const nextSpeed = clamp(num, 0.25, 4);
      const newSourceLen = Math.min(sourceLen, available);
      clip.speed = nextSpeed;
      clip.duration = round(Math.max(0.1, newSourceLen / nextSpeed), 3);
      syncLiveFields();
    } else if (input.dataset.prop === "volume") {
      clip.volume = clamp(num / 100, 0, 1);
    } else if (input.dataset.prop === "opacity") {
      clip.opacity = clamp(num / 100, 0, 1);
    } else if (input.dataset.prop === "fadeIn" || input.dataset.prop === "fadeOut") {
      clip[input.dataset.prop] = num;
    } else {
      setDeep(clip, input.dataset.prop, num);
    }
  }
  if (input.dataset.text) {
    const key = input.dataset.text;
    clip.text = clip.text || {};
    if (key === "size") clip.text.size = Number(input.value);
    else if (key === "bgOpacity") clip.text.bgOpacity = clamp(Number(input.value) / 100, 0, 1);
    else if (key === "y") clip.text.y = clamp(Number(input.value) / 100, 0, 1);
    else if (key === "weight") clip.text.weight = Number(input.value);
    else if (key === "content") {
      clip.text.content = input.value;
      const label = document.querySelector(`.tl-clip[data-clip="${CSS.escape(clip.id)}"] .clip-label`);
      if (label) label.textContent = input.value.slice(0, 40) || "Texto";
    } else {
      clip.text[key] = input.value;
    }
  }
  renderer?.drawFrame();
  emit("clip-live", clip);
}

function onChange(e) {
  const clip = getClip();
  if (!clip) return;
  const input = e.target;
  if (input.dataset.text === "animation" || input.dataset.anim) {
    applyAnimationInput(input);
    return;
  }
  if (input.matches("input[type=range]")) {
    touch();
    emit("change");
    emit("project");
  } else if (input.dataset.prop || input.dataset.text) {
    touch();
    emit("change");
    emit("project");
  }
}

function onAction(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const clip = getClip();
  if (!clip) return;
  const action = btn.dataset.action;
  if (action === "goto") {
    renderer?.pause();
    renderer?.seek(clip.start);
  } else if (action === "split") {
    snapshot("Dividir clip");
    if (!splitClipAt(store.time, clip.id)) emit("notify", { msg: "Coloca el cursor dentro del clip para dividirlo.", type: "err" });
  } else if (action === "duplicate") {
    snapshot("Duplicar clip");
    duplicateClip(clip.id);
  } else if (action === "delete") {
    snapshot("Eliminar clip");
    removeClip(clip.id);
  } else if (action === "reset-filter") {
    snapshot("Restablecer color");
    clip.filter = { ...DEFAULT_FILTER };
    touch();
    emit("project");
  }
}

function syncLiveFields() {
  if (!body) return;
  const clip = getClip();
  if (!clip) return;
  const startEl = body.querySelector('[data-live="start"]');
  if (startEl) startEl.textContent = fmtTime(clip.start);
  const durEl = body.querySelector('[data-live="duration"]');
  if (durEl) durEl.textContent = fmtTime(clip.duration);
}
