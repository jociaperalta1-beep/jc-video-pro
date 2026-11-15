/* ============================================================
   JC VIDEO PRO — Línea de tiempo multipista
   ============================================================ */

import {
  $, store, on, emit, projectDuration, findClip, selectClip, moveClipToTrack,
  snapshot, touch, clamp, round, snapTime, maxClipDuration, escapeHtml, fmtTime,
} from "./core.js";
import { mediaURL } from "./media.js";

let renderer = null;
let drag = null;
let scrub = null;
let rafRuler = 0;

const el = {};

export function initTimeline(rendererInstance) {
  renderer = rendererInstance;
  el.scroll = $("#tlScroll");
  el.content = $("#tlContent");
  el.ruler = $("#tlRuler");
  el.heads = $("#tlHeads");
  el.playhead = $("#tlPlayhead");
  el.zoomLabel = $("#zoomLabel");

  buildHeads();
  buildLanesContainer();
  bindTimelineEvents();
  bindToolbar();
  renderTimeline();

  on("project", () => renderTimeline());
  on("selection", () => updateSelection());
  on("media", () => renderTimeline());
  on("time", () => {
    updatePlayhead();
    if (store.playing) followPlayhead();
  });

  el.scroll.addEventListener("scroll", () => {
    cancelAnimationFrame(rafRuler);
    rafRuler = requestAnimationFrame(() => renderRuler());
  }, { passive: true });
  window.addEventListener("resize", () => { renderRuler(); });
}

function buildHeads() {
  if (!el.heads) return;
  el.heads.innerHTML = "";
  for (const track of store.project.tracks) {
    const head = document.createElement("div");
    head.className = "tl-head";
    head.dataset.kind = track.kind === "overlay" ? "overlay" : track.kind;
    head.innerHTML = `<span class="dot"></span><span>${escapeHtml(track.name)}</span>`;
    el.heads.appendChild(head);
  }
}

let lanesContainer = null;
function buildLanesContainer() {
  if (!lanesContainer) {
    lanesContainer = document.createElement("div");
    lanesContainer.id = "tlLanes";
    el.content.appendChild(lanesContainer);
  }
}

/* ---------------- Render ---------------- */
export function renderTimeline() {
  if (!store.project || !extrasReady()) return;
  const pps = store.zoom;
  const duration = Math.max(projectDuration(), store.time) + 6;
  const width = Math.max(el.scroll.clientWidth || 600, duration * pps + 60);
  el.content.style.width = width + "px";
  const trackCount = store.project.tracks.length;
  el.content.style.height = `calc(var(--ruler-h) + (var(--track-h) + 6px) * ${trackCount} + 4px)`;

  lanesContainer.innerHTML = "";
  const totalClips = store.project.tracks.reduce((n, t) => n + t.clips.length, 0);

  for (const track of store.project.tracks) {
    const lane = document.createElement("div");
    lane.className = "tl-lane";
    lane.dataset.track = track.id;
    lane.dataset.kind = track.kind;
    for (const clip of track.clips) {
      lane.appendChild(makeClipEl(track, clip, pps));
    }
    if (!totalClips && track.id === "t-video") {
      const hint = document.createElement("div");
      hint.textContent = "Importa un video y pulsa «+ Pista principal»";
      hint.style.cssText = "position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--muted-2);pointer-events:none;white-space:nowrap";
      lane.appendChild(hint);
    }
    lanesContainer.appendChild(lane);
  }

  if (!totalClips && !store.dirty) {
    el.content.style.width = width + "px";
  }

  renderRuler();
  updatePlayhead();
  if (el.zoomLabel) el.zoomLabel.textContent = `${Math.round(pps)} px/s`;
}

function extrasReady() {
  return el.scroll && el.content && el.ruler && lanesContainer;
}

function makeClipEl(track, clip, pps) {
  const node = document.createElement("div");
  const selected = store.selection?.clipId === clip.id;
  node.className = `tl-clip kind-${clip.kind}${selected ? " selected" : ""}`;
  node.dataset.clip = clip.id;
  node.dataset.track = track.id;
  node.style.left = clip.start * pps + "px";
  node.style.width = Math.max(10, clip.duration * pps) + "px";
  node.title = `${clip.name || "Clip"} · ${fmtTime(clip.start)} → ${fmtTime(clip.start + clip.duration)}`;

  const media = store.media.get(clip.mediaId);
  const badge = { video: "VIDEO", image: "FOTO", audio: "AUDIO", text: "TEXTO" }[clip.kind] || "CLIP";
  const label = clip.kind === "text" ? (clip.text?.content || "Texto") : (clip.name || media?.name || "Clip");
  const thumbURL = media?.thumb && (clip.kind === "video" || clip.kind === "image")
    ? mediaURL(clip.mediaId) && media.thumb
    : null;

  node.innerHTML = `
    ${thumbURL ? `<img class="clip-thumb" src="${thumbURL}" alt="" draggable="false">` : ""}
    <div class="clip-badge">${badge}</div>
    <div class="clip-label">${escapeHtml(String(label).slice(0, 60))}</div>
    <div class="clip-trim l" title="Recortar inicio"></div>
    <div class="clip-trim r" title="Recortar final"></div>
  `;
  return node;
}

function renderRuler() {
  if (!extrasReady()) return;
  const pps = store.zoom;
  const scrollLeft = el.scroll.scrollLeft || 0;
  const viewW = el.scroll.clientWidth || 600;
  const step = tickStep(pps);
  const t0 = Math.max(0, scrollLeft / pps - step * 2);
  const t1 = (scrollLeft + viewW) / pps + step * 2;
  const frag = document.createDocumentFragment();
  for (let t = Math.floor(t0 / step) * step; t <= t1; t += step) {
    if (t < 0) continue;
    const tick = document.createElement("div");
    tick.className = "tl-tick major";
    tick.style.left = t * pps + "px";
    const label = document.createElement("span");
    label.className = "tl-tick-label";
    label.textContent = tickLabel(t, step);
    tick.appendChild(label);
    frag.appendChild(tick);
  }
  el.ruler.innerHTML = "";
  el.ruler.appendChild(frag);
}

function tickStep(pps) {
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const c of candidates) if (c * pps >= 74) return c;
  return 900;
}

function tickLabel(t, step) {
  const m = Math.floor(t / 60);
  const s = t % 60;
  if (step < 1) return `${t.toFixed(1)}s`;
  if (m >= 1) return `${m}:${String(Math.round(s)).padStart(2, "0")}`;
  return `${Math.round(s)}s`;
}

function updatePlayhead() {
  if (!extrasReady()) return;
  const x = store.time * store.zoom;
  el.playhead.style.transform = `translateX(${x}px)`;
}

function followPlayhead() {
  if (!extrasReady()) return;
  const x = store.time * store.zoom;
  const left = el.scroll.scrollLeft;
  const w = el.scroll.clientWidth;
  if (x < left + 24 || x > left + w - 60) {
    el.scroll.scrollLeft = Math.max(0, x - w * 0.35);
  }
}

export function updateSelection() {
  if (!extrasReady()) return;
  el.content.querySelectorAll(".tl-clip").forEach((node) => {
    node.classList.toggle("selected", node.dataset.clip === store.selection?.clipId);
  });
}

/* ---------------- Interacciones ---------------- */
function bindTimelineEvents() {
  el.content.addEventListener("pointerdown", onPointerDown);
  el.content.addEventListener("click", onClickEmpty);
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  if (store.exporting) return;
  const clipNode = e.target.closest?.(".tl-clip");
  if (clipNode) {
    const found = findClip(clipNode.dataset.clip);
    if (!found) return;
    selectClip(found.clip.id);
    if (renderer?.playing) renderer.pause();
    const mode = e.target.classList.contains("l") ? "trim-l"
      : e.target.classList.contains("r") ? "trim-r"
      : "move";
    drag = {
      mode,
      clipId: found.clip.id,
      originTrack: found.track.id,
      startX: e.clientX,
      startY: e.clientY,
      pps: store.zoom,
      orig: {
        start: found.clip.start,
        duration: found.clip.duration,
        in: found.clip.in || 0,
        speed: found.clip.speed || 1,
      },
      moved: false,
      pointerId: e.pointerId,
    };
    el.content.setPointerCapture?.(e.pointerId);
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", onDragUp, { once: true });
    e.preventDefault();
    return;
  }

  if (e.pointerType === "touch") return; // dejar el desplazamiento táctil al navegador

  const rect = el.content.getBoundingClientRect();
  const time = (e.clientX - rect.left) / store.zoom;
  startScrub(time, e);

  function onMove(ev) {
    const t = (ev.clientX - rect.left) / store.zoom;
    if (renderer) renderer.seek(Math.max(0, t));
    emit("scrub", t);
  }
  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  }
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function startScrub(time, e) {
  if (store.exporting) return;
  if (renderer?.playing) renderer.pause();
  if (renderer) renderer.seek(Math.max(0, time));
  emit("scrub", time);
  e.preventDefault();
}

function onClickEmpty(e) {
  if (store.exporting) return;
  if (e.target.closest?.(".tl-clip")) return;
  const rect = el.content.getBoundingClientRect();
  const time = (e.clientX - rect.left) / store.zoom;
  if (renderer?.playing) renderer.pause();
  if (renderer) renderer.seek(Math.max(0, time));
}

function onDragMove(e) {
  if (!drag) return;
  const found = findClip(drag.clipId);
  if (!found) return;
  const dxPx = e.clientX - drag.startX;
  const dyPx = e.clientY - drag.startY;
  if (!drag.moved) {
    if (Math.abs(dxPx) < 3 && Math.abs(dyPx) < 3) return;
    snapshot("Ajustar clip");
    drag.moved = true;
    document.body.style.cursor = drag.mode === "move" ? "grabbing" : "ew-resize";
  }

  const clip = found.clip;
  const pps = drag.pps;
  const dx = dxPx / pps;

  if (drag.mode === "move") {
    let start = Math.max(0, drag.orig.start + dx);
    start = snapTime(start, clip.id, 7, pps);
    clip.start = round(Math.max(0, start), 3);
    highlightDropLane(e, clip, drag.originTrack);
  } else if (drag.mode === "trim-l") {
    const maxStart = drag.orig.start + drag.orig.duration - 0.15;
    const minStartByMedia = drag.orig.start - (drag.orig.in || 0) / (clip.speed || 1);
    let start = clamp(drag.orig.start + dx, Math.max(0, minStartByMedia), maxStart);
    start = snapTime(start, clip.id, 7, pps);
    start = clamp(start, Math.max(0, minStartByMedia), maxStart);
    const delta = start - drag.orig.start;
    clip.start = round(start, 3);
    clip.in = Math.max(0, round((drag.orig.in || 0) + delta * (clip.speed || 1), 3));
    clip.duration = round(drag.orig.duration - delta, 3);
  } else if (drag.mode === "trim-r") {
    const md = store.media.get(clip.mediaId);
    const maxDur = clip.kind === "video" || clip.kind === "audio"
      ? Math.max(0.1, ((md?.duration || clip.duration) - (drag.orig.in || 0)) / (clip.speed || 1))
      : 3600;
    let end = drag.orig.start + drag.orig.duration + dx;
    end = snapTime(end, clip.id, 7, pps);
    clip.duration = round(clamp(end - drag.orig.start, 0.1, maxDur), 3);
  }

  const node = el.content.querySelector(`.tl-clip[data-clip="${CSS.escape(clip.id)}"]`);
  if (node) {
    node.style.left = clip.start * pps + "px";
    node.style.width = Math.max(10, clip.duration * pps) + "px";
  }
  emit("clip-live", clip);
}

function highlightDropLane(e, clip, originTrackId) {
  const lanes = document.querySelectorAll(".tl-lane");
  lanes.forEach((lane) => lane.classList.remove("hover-target"));
  const candidates = document.elementsFromPoint(e.clientX, e.clientY);
  const lane = candidates.find((n) => n.classList?.contains("tl-lane"));
  if (lane && lane.dataset.track !== originTrackId) lane.classList.add("hover-target");
}

function onDragUp(e) {
  document.removeEventListener("pointermove", onDragMove);
  document.body.style.cursor = "";
  if (!drag) return;
  const current = drag;
  drag = null;

  const candidates = document.elementsFromPoint(e.clientX, e.clientY);
  const lane = candidates.find((n) => n.classList?.contains("tl-lane"));
  if (current.mode === "move" && lane && lane.dataset.track !== current.originTrackId) {
    const found = findClip(current.clipId);
    if (found) {
      const defAccepts = { "t-video": ["video", "image"], "t-overlay": ["video", "image"], "t-audio": ["audio"], "t-text": ["text"] };
      if (defAccepts[lane.dataset.track]?.includes(found.clip.kind)) {
        moveClipToTrack(current.clipId, lane.dataset.track);
      }
    }
  }
  document.querySelectorAll(".tl-lane").forEach((l) => l.classList.remove("hover-target"));

  if (current.moved) {
    touch();
    emit("project");
    emit("change");
  }
}

/* ---------------- Barra de herramientas ---------------- */
function bindToolbar() {
  $("#btnZoomIn")?.addEventListener("click", () => setZoom(store.zoom * 1.35));
  $("#btnZoomOut")?.addEventListener("click", () => setZoom(store.zoom / 1.35));
  $("#btnFitTimeline")?.addEventListener("click", fitTimeline);
}

export function setZoom(value) {
  store.zoom = clamp(Math.round(value), 20, 480);
  renderTimeline();
}

export function fitTimeline() {
  const w = (el.scroll?.clientWidth || 800) - 50;
  const duration = Math.max(4, projectDuration());
  setZoom(w / duration);
}

export function scrollToTime(time, center = false) {
  if (!extrasReady()) return;
  const x = time * store.zoom;
  const w = el.scroll.clientWidth;
  if (center) el.scroll.scrollLeft = Math.max(0, x - w / 2);
  else if (x < el.scroll.scrollLeft || x > el.scroll.scrollLeft + w - 40) {
    el.scroll.scrollLeft = Math.max(0, x - 60);
  }
}
