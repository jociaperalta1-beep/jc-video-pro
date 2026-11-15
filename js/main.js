/* ============================================================
   JC VIDEO PRO — Arranque y coordinación de la aplicación
   ============================================================ */

import {
  $, $$, store, on, emit, createProject, normalizeProject, ASPECTS, allClips,
  projectDuration, fmtTime, snapshot, splitClipAt, removeClip, duplicateClip,
  createTextClip, addClip, uid, getLastProjectId, setLastProjectId, canUndo,
  canRedo, undo, redo, escapeHtml, setPlan,
} from "./core.js";
import {
  saveProjectRecord, getProjectRecord, listProjects, deleteProjectRecord,
  requestPersistentStorage,
} from "./storage.js";
import { importFiles, rehydrateMedia, addMediaClip, freeStart } from "./media.js";
import { Renderer } from "./renderer.js";
import { initTimeline } from "./timeline.js";
import { initInspector } from "./inspector.js";
import { initPanels } from "./panels.js";
import { formatVideoEmbedUrl, getMonetization } from "./monetization.js";
import { initExporter } from "./exporter.js";
import { bindModal, openModal, closeModal, toast, confirmAction } from "./ui.js";
import {
  supabase, getCurrentUser, signInWithEmail, signUpWithEmail, signInWithGoogle,
  resetPassword, signOutUser, sendSupportTicket,
} from "./supabase.js";

let renderer = null;
let saveTimer = null;

/* ---------------- Arranque ---------------- */
async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.has("pro_preview")) {
    setPlan("pro");
    const topBar = $("#ownerTopBar");
    if (topBar) {
      topBar.style.display = "flex";
      $("#backToAdminBtn")?.addEventListener("click", () => {
        window.location.href = "admin.html";
      });
    }
  }

  store.project = createProject({ aspect: "9:16" });
  renderer = new Renderer($("#preview"));
  renderer.setProject(store.project);

  bindModal();
  initTimeline(renderer);
  initInspector(renderer);
  initPanels();
  initPremium();
  initExporter(renderer);
  bindUI();
  bindDragAndDrop();
  fitPreview();
  new ResizeObserver(() => fitPreview()).observe($("#stageCanvasWrap"));
  window.addEventListener("resize", fitPreview);

  on("open-premium", openPremiumModal);
  on("notify", ({ msg, type }) => toast(msg, type || ""));
  on("playing", (playing) => $("#btnPlay")?.classList.toggle("playing", playing));
  on("export-end", () => { updateEmptyState(); updateTimeReadout(); });
  on("history", updateHistoryButtons);

  // Check Supabase auth state for top bar button
  try {
    const user = await getCurrentUser();
    if (user) {
      const btnAuth = $("#btnAuth");
      if (btnAuth) btnAuth.textContent = `👤 ${(user.email || "").split("@")[0]}`;
    }
  } catch (e) {
    console.warn("[JCVP] auth check", e);
  }

  try { await rehydrateMedia(); } catch (err) { console.warn("[JCVP] medios", err); }

  let loaded = false;
  const lastId = getLastProjectId();
  if (lastId) {
    try {
      const rec = await getProjectRecord(lastId);
      if (rec) { loadProject(rec); loaded = true; }
    } catch (err) { console.warn("[JCVP] proyecto", err); }
  }
  if (!loaded) {
    loadProject(store.project);
    await saveProjectRecord(store.project);
    setLastProjectId(store.project.id);
    updateSaveStateSaved();
    firstRun();
  }

  requestPersistentStorage();
  registerServiceWorker();
  updateHistoryButtons();
}

/* ---------------- Carga de proyecto ---------------- */
function loadProject(raw) {
  renderer.pause();
  store.project = normalizeProject(raw);
  store.selection = null;
  store.time = 0;
  store.playing = false;
  store.dirty = false;

  setLastProjectId(store.project.id);
  const nameInput = $("#projectName");
  if (nameInput) nameInput.value = store.project.name || "Mi proyecto";
  const fmt = $("#formatSelect");
  if (fmt) fmt.value = store.project.aspect || "9:16";

  renderer.setProject(store.project);
  fitPreview();
  emit("project");
  emit("selection", null);
  emit("time", 0);
  updateFormatBadge();
  updateEmptyState();
  updateTimeReadout();
  updateHistoryButtons();
  updateSaveStateSaved();
  checkMissingMedia();
}

function checkMissingMedia() {
  const missing = new Set();
  for (const { clip } of allClips()) {
    if (clip.mediaId && !store.media.has(clip.mediaId)) missing.add(clip.mediaId);
  }
  if (missing.size) {
    toast(`${missing.size} medio(s) del proyecto no están en esta biblioteca. Vuelve a importar los archivos originales para verlos.`, "err", 6500);
  }
}

/* ---------------- Interfaz ---------------- */
function bindUI() {
  $("#btnPlay")?.addEventListener("click", async () => {
    if (store.exporting) return;
    if (projectDuration() <= 0) {
      toast("Añade al menos un clip a la línea de tiempo.", "err");
      return;
    }
    await renderer.toggle();
    updateTimeReadout();
  });

  $("#btnStop")?.addEventListener("click", () => {
    renderer.pause();
    renderer.seek(0);
  });

  $("#btnSave")?.addEventListener("click", () => saveNow(true));
  $("#btnNew")?.addEventListener("click", openNewProjectModal);
  $("#btnOpen")?.addEventListener("click", openProjectsModal);
  $("#btnTutorial")?.addEventListener("click", openTutorialModal);
  $("#btnAuth")?.addEventListener("click", openAuthModal);
  $("#btnSupport")?.addEventListener("click", openSupportModal);

  // Language dropdown
  const langBtn = $("#btnLang");
  const langMenu = $("#langMenu");
  langBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (langMenu) langMenu.style.display = langMenu.style.display === "block" ? "none" : "block";
  });
  document.addEventListener("click", () => {
    if (langMenu) langMenu.style.display = "none";
  });
  langMenu?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lang]");
    if (!btn) return;
    const lang = btn.dataset.lang;
    setLanguage(lang);
    langBtn.textContent = `🌐 ${lang.toUpperCase()} ▾`;
    langMenu.style.display = "none";
    toast(lang === "en" ? "Language switched to English." : "Idioma cambiado a Español.", "ok");
  });

  $("#btnMoreMobile")?.addEventListener("click", openMobileMenu);

  $("#btnSplit")?.addEventListener("click", doSplit);
  $("#btnDeleteClip")?.addEventListener("click", doDelete);
  $("#btnDuplicate")?.addEventListener("click", doDuplicate);
  $("#btnAddText")?.addEventListener("click", doAddText);

  $("#btnFit")?.addEventListener("click", fitPreview);
  $("#btnInspector")?.addEventListener("click", () => $("#app")?.classList.add("show-inspector"));
  $("#closeInspector")?.addEventListener("click", () => $("#app")?.classList.remove("show-inspector"));
  $("#closePanel")?.addEventListener("click", () => $("#app")?.classList.remove("show-panel"));
  $("#btnPanelMobile")?.addEventListener("click", () => {
    $("#app")?.classList.add("show-panel");
  });

  $("#formatSelect")?.addEventListener("change", (e) => {
    if (!store.project) return;
    snapshot("Cambiar formato");
    const aspect = ASPECTS[e.target.value] || ASPECTS["9:16"];
    store.project.aspect = aspect.id;
    store.project.width = aspect.width;
    store.project.height = aspect.height;
    renderer.setProject(store.project);
    fitPreview();
    updateFormatBadge();
    emit("project");
    emit("change");
  });

  $("#projectName")?.addEventListener("input", (e) => {
    if (!store.project) return;
    store.project.name = e.target.value;
    store.dirty = true;
    scheduleSave();
  });
  $("#projectName")?.addEventListener("blur", () => {
    if (!store.project) return;
    const clean = $("#projectName").value.trim() || "Mi proyecto";
    $("#projectName").value = clean;
    store.project.name = clean;
  });

  $("#fileMedia")?.addEventListener("change", (e) => {
    handleFiles(e.target.files);
    e.target.value = "";
  });
  $("#fileProject")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importProjectFile(file);
    e.target.value = "";
  });
  $("#btnImportEmpty")?.addEventListener("click", () => $("#fileMedia")?.click());
  $("#stageDrop")?.addEventListener("click", (e) => {
    if (e.target.closest("#btnImportEmpty")) return;
    if (e.target === e.currentTarget) $("#fileMedia")?.click();
  });

  on("change", () => { scheduleSave(); emit("project"); });
  on("project", () => {
    updateFormatBadge();
    updateEmptyState();
    updateTimeReadout();
    updateHistoryButtons();
  });
  on("time", () => updateTimeReadout());
  on("selection", (sel) => {
    if (sel) {
      $("#app")?.classList.add("show-inspector");
    }
  });

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && store.dirty) saveNow(false);
  });
  window.addEventListener("beforeunload", (e) => {
    if (store.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

function onKeyDown(e) {
  const target = e.target;
  const typing = target.matches?.("input, textarea, select") || target.isContentEditable;
  if (typing) return;
  const mod = e.ctrlKey || e.metaKey;

  if (e.code === "Space") {
    e.preventDefault();
    $("#btnPlay")?.click();
  } else if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    emit("time", store.time);
  } else if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveNow(true);
  } else if (mod && e.key.toLowerCase() === "e") {
    e.preventDefault();
    $("#btnExport")?.click();
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (store.selection) {
      e.preventDefault();
      doDelete();
    }
  } else if (e.key.toLowerCase() === "s" && !mod) {
    e.preventDefault();
    doSplit();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    renderer.pause();
    renderer.seek(store.time - (e.shiftKey ? 5 : 1));
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    renderer.pause();
    renderer.seek(store.time + (e.shiftKey ? 5 : 1));
  }
}

/* ---------------- Acciones del editor ---------------- */
function doSplit() {
  if (!store.project) return;
  snapshot("Dividir clip");
  if (!splitClipAt(store.time)) toast("Coloca el cursor dentro de un clip para dividirlo.", "err");
}

function doDelete() {
  if (!store.selection) { toast("Selecciona un clip primero.", "err"); return; }
  snapshot("Eliminar clip");
  removeClip(store.selection.clipId);
  toast("Clip eliminado.", "");
}

function doDuplicate() {
  if (!store.selection) { toast("Selecciona un clip primero.", "err"); return; }
  snapshot("Duplicar clip");
  duplicateClip(store.selection.clipId);
}

function doAddText() {
  if (!store.project) return;
  snapshot("Añadir texto");
  const clip = createTextClip({ content: "Tu texto aquí", start: store.time, duration: 4 });
  addClip("t-text", clip);
  store.selection = { clipId: clip.id, trackId: "t-text" };
  emit("selection", store.selection);
  emit("project");
  emit("change");
  toast("Texto añadido en el cursor.", "ok");
}

/* ---------------- Medios ---------------- */
async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  updateSaveState("saving", "Importando…");
  const errors = [];
  let imported = [];
  try {
    imported = await importFiles(files, {
      onProgress: ({ index, total }) => updateSaveState("saving", `Importando ${index}/${total}…`),
      onError: (file, msg) => errors.push(`${file.name}: ${msg}`),
    });
  } catch (err) {
    console.error(err);
    errors.push(err.message || "Error inesperado");
  }

  if (imported.length) {
    toast(`${imported.length} archivo(s) importado(s) a la biblioteca.`, "ok");
    if (allClips().length === 0) {
      const media = store.media.get(imported[0]);
      if (media) {
        const trackId = media.type === "audio" ? "t-audio" : "t-video";
        addMediaClip(media.id, trackId, { start: 0 });
        emit("project");
      }
    }
  }
  if (errors.length) toast("No se pudo importar: " + errors.join(" · "), "err", 7000);
  updateSaveState(store.dirty ? "saving" : "saved", store.dirty ? "Sin guardar" : "Listo");
  updateEmptyState();
}

function bindDragAndDrop() {
  const wrap = $("#stageCanvasWrap");
  const drop = $("#stageDrop");
  if (!wrap || !drop) return;

  const show = () => drop.classList.add("visible");
  const hide = () => drop.classList.remove("visible");

  wrap.addEventListener("dragenter", (e) => {
    e.preventDefault();
    if (store.exporting) return;
    show();
    wrap.classList.add("dragover");
  });
  wrap.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  wrap.addEventListener("dragleave", (e) => {
    if (!wrap.contains(e.relatedTarget)) {
      wrap.classList.remove("dragover");
      updateEmptyState();
    }
  });
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    wrap.classList.remove("dragover");
    updateEmptyState();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) handleFiles(files);
  });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragover"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    updateEmptyState();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) handleFiles(files);
  });

  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    if (wrap.contains(e.target)) return;
    e.preventDefault();
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  });
}

/* ---------------- Proyectos ---------------- */
async function saveNow(showToast) {
  if (!store.project) return;
  clearTimeout(saveTimer);
  updateSaveState("saving", "Guardando…");
  try {
    const nameInput = $("#projectName");
    if (nameInput) store.project.name = nameInput.value.trim() || "Mi proyecto";
    await saveProjectRecord(store.project);
    store.dirty = false;
    setLastProjectId(store.project.id);
    updateSaveStateSaved();
    if (showToast) toast("Proyecto guardado en este navegador.", "ok");
  } catch (err) {
    console.error("[JCVP] guardar", err);
    updateSaveState("", "Error al guardar");
    toast("No se pudo guardar el proyecto: " + (err.message || err), "err");
  }
}

function scheduleSave() {
  if (!store.project) return;
  updateSaveState("saving", "Guardando…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(false), 1200);
}

function updateSaveState(kind, text) {
  const node = $("#saveState");
  if (!node) return;
  node.textContent = text;
  node.className = "save-state" + (kind ? " " + kind : "");
}

function updateSaveStateSaved() {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  updateSaveState("saved", "Guardado " + time);
}

function openMobileMenu() {
  openModal(`
    <h2>Menú</h2>
    <p class="modal-sub">Acciones del proyecto y del editor.</p>
    <div class="mobile-menu" id="mobileMenu">
      <button class="btn ghost" data-mobile-action="new">Nuevo proyecto</button>
      <button class="btn ghost" data-mobile-action="open">Abrir proyecto</button>
      <button class="btn ghost" data-mobile-action="save">Guardar ahora</button>
      <button class="btn ghost" data-mobile-action="undo">Deshacer</button>
      <button class="btn ghost" data-mobile-action="redo">Rehacer</button>
      <button class="btn ghost" data-mobile-action="premium">Planes Premium</button>
      <button class="btn ghost" data-mobile-action="auth">Iniciar sesión</button>
      <button class="btn ghost" data-mobile-action="support">Soporte</button>
    </div>
    <div class="modal-actions">
      <button class="btn primary" data-close>Cerrar</button>
    </div>
  `);

  $("#mobileMenu")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mobile-action]");
    if (!btn) return;
    const action = btn.dataset.mobileAction;
    closeModal(true);
    if (action === "new") openNewProjectModal();
    else if (action === "open") openProjectsModal();
    else if (action === "save") saveNow(true);
    else if (action === "undo") { undo(); emit("time", store.time); }
    else if (action === "redo") { redo(); emit("time", store.time); }
    else if (action === "premium") openPremiumModal();
    else if (action === "auth") openAuthModal();
    else if (action === "support") openSupportModal();
  });
}

async function openNewProjectModal() {
  await saveNow(false);
  openModal(`
    <h2>Nuevo proyecto</h2>
    <p class="modal-sub">Elige el nombre y el formato de salida. Tu biblioteca de medios se conserva.</p>
    <div class="modal-form">
      <label>Nombre del proyecto</label>
      <input class="text-input" id="npName" value="Mi proyecto" maxlength="60">
      <label>Formato</label>
      <select class="select" id="npAspect">
        ${Object.values(ASPECTS).map((a) => `<option value="${a.id}">${a.label} — ${a.hint}</option>`).join("")}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" data-close>Cancelar</button>
      <button class="btn primary" id="npCreate">Crear proyecto</button>
    </div>
  `);

  $("#npCreate")?.addEventListener("click", async () => {
    const name = $("#npName")?.value.trim() || "Mi proyecto";
    const aspect = $("#npAspect")?.value || "9:16";
    const project = createProject({ name, aspect });
    closeModal(true);
    loadProject(project);
    await saveProjectRecord(project);
    setLastProjectId(project.id);
    updateSaveStateSaved();
    toast("Proyecto creado.", "ok");
  });
}

async function openProjectsModal() {
  await saveNow(false);
  let projects = [];
  try { projects = await listProjects(); } catch (err) { console.warn(err); }

  const rows = projects.length
    ? projects.map((p) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:rgba(255,255,255,.03)">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name || "Proyecto")}</div>
          <div style="font-size:10.5px;color:var(--muted)">
            ${p.clipCount || 0} clip(s) · ${p.aspect || "9:16"} · ${new Date(p.updatedAt || p.savedAt || Date.now()).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
        <button class="btn tiny" data-open-project="${p.id}">Abrir</button>
        <button class="btn tiny danger" data-delete-project="${p.id}">Eliminar</button>
      </div>`).join("")
    : `<div class="empty-note"><strong>No hay proyectos guardados</strong>Crea uno nuevo para empezar.</div>`;

  openModal(`
    <h2>Tus proyectos</h2>
    <p class="modal-sub">Se guardan en este navegador. La sincronización con Supabase está activa.</p>
    <div id="projectsList">${rows}</div>
    <div class="modal-actions">
      <button class="btn ghost" id="btnImportJson">Importar .json</button>
      <button class="btn ghost" id="btnExportJson">Exportar este proyecto (.json)</button>
      <button class="btn primary" data-close>Cerrar</button>
    </div>
  `, { wide: true });

  $("#projectsList")?.addEventListener("click", async (e) => {
    const openBtn = e.target.closest("[data-open-project]");
    if (openBtn) {
      const rec = await getProjectRecord(openBtn.dataset.openProject);
      if (!rec) { toast("No se encontró el proyecto.", "err"); return; }
      loadProject(rec);
      closeModal(true);
      toast("Proyecto abierto.", "ok");
      return;
    }
    const delBtn = e.target.closest("[data-delete-project]");
    if (delBtn) {
      const ok = await confirmAction({
        title: "Eliminar proyecto",
        message: "El proyecto se eliminará de este navegador. Los archivos de la biblioteca se conservan.",
        confirmText: "Eliminar",
        danger: true,
      });
      if (!ok) return;
      await deleteProjectRecord(delBtn.dataset.deleteProject);
      if (getLastProjectId() === delBtn.dataset.deleteProject) setLastProjectId("");
      toast("Proyecto eliminado.", "ok");
      openProjectsModal();
    }
  });

  $("#btnImportJson")?.addEventListener("click", () => $("#fileProject")?.click());
  $("#btnExportJson")?.addEventListener("click", () => {
    const data = { app: "JC VIDEO PRO", type: "project", exportedAt: new Date().toISOString(), project: store.project };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `JC_VIDEO_PRO_${store.project.name.replace(/[^\w-]+/g, "_") || "proyecto"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast("Proyecto exportado como JSON (sin archivos multimedia).", "ok");
  });
}

async function importProjectFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const raw = data.project || data;
    if (!raw || !Array.isArray(raw.tracks)) throw new Error("El archivo no parece un proyecto de JC VIDEO PRO.");
    const project = normalizeProject(raw);
    project.id = uid("prj");
    project.name = (raw.name || "Proyecto") + " (importado)";
    loadProject(project);
    await saveProjectRecord(project);
    setLastProjectId(project.id);
    closeModal(true);
    toast("Proyecto importado. Revisa si faltan medios por importar.", "ok");
  } catch (err) {
    toast("No se pudo importar el proyecto: " + (err.message || err), "err");
  }
}

/* ---------------- Utilidades de vista ---------------- */
function fitPreview() {
  const wrap = $("#stageCanvasWrap");
  const canvas = $("#preview");
  if (!wrap || !canvas || !store.project) return;
  const availW = Math.max(120, wrap.clientWidth - 52);
  const availH = Math.max(120, wrap.clientHeight - 44);
  const ar = store.project.width / store.project.height;
  let w = availW;
  let h = w / ar;
  if (h > availH) { h = availH; w = h * ar; }
  canvas.style.width = Math.round(w) + "px";
  canvas.style.height = Math.round(h) + "px";
}

function updateFormatBadge() {
  const badge = $("#stageFormat");
  if (!badge || !store.project) return;
  badge.textContent = `${store.project.width} × ${store.project.height} · ${store.project.aspect}`;
}

function updateEmptyState() {
  const drop = $("#stageDrop");
  if (!drop) return;
  const empty = allClips().length === 0 && !store.exporting;
  drop.classList.toggle("visible", empty);
}

function updateTimeReadout() {
  const now = $("#timeNow");
  const total = $("#timeTotal");
  if (now) now.textContent = fmtTime(store.time);
  if (total) total.textContent = fmtTime(projectDuration());
}

function updateHistoryButtons() {
  const u = $("#btnUndo");
  const r = $("#btnRedo");
  if (u) u.disabled = !canUndo();
  if (r) r.disabled = !canRedo();
}

function firstRun() {
  let seen = null;
  try { seen = localStorage.getItem("jcvp.tourSeen"); } catch { /* ignore */ }
  if (seen) return;
  try { localStorage.setItem("jcvp.tourSeen", "1"); } catch { /* ignore */ }
  openModal(`
    <h2>Bienvenido a JC VIDEO PRO</h2>
    <p class="modal-sub">Tu editor de video profesional con Supabase e Inteligencia Artificial.</p>
    <div class="ai-card">
      <h3>1 · Importa</h3>
      <p>Arrastra videos, fotos o música al área de vista previa. Se guardan en tu biblioteca local.</p>
    </div>
    <div class="ai-card">
      <h3>2 · Edita y crea con IA</h3>
      <p>Organiza en la línea de tiempo, añade textos dinámicos, usa el estudio de IA y efectos profesionales.</p>
    </div>
    <div class="ai-card">
      <h3>3 · Exporta y comparte</h3>
      <p>Exporta tu creación en alta definición y compártela directamente en redes sociales.</p>
    </div>
    <div class="modal-actions">
      <button class="btn primary" data-close>Empezar a editar</button>
    </div>
  `, { wide: true });
}

/* ---------------- Tutorial, Auth y Soporte ---------------- */
function openTutorialModal() {
  const config = getMonetization();
  const embed = formatVideoEmbedUrl(config.tutorialVideoUrl || "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

  openModal(`
    <h2>Tutorial y Guía de Uso</h2>
    <p class="modal-sub">Aprende a editar videos profesionales, usar la IA y exportar en minutos.</p>
    
    ${embed.type !== "none" ? `
      <div style="position:relative; width:100%; padding-bottom:56.25%; background:#000; border-radius:8px; overflow:hidden; margin-bottom:16px;">
        <iframe src="${embed.src}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allowfullscreen></iframe>
      </div>
    ` : ""}

    <div style="display:flex; flex-direction:column; gap:10px; text-align:left; font-size:14px; max-height:260px; overflow-y:auto; padding-right:4px;">
      <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:6px;"><b>Paso 1: Importa tus medios</b><br>Sube tus videos, fotos o música desde el panel de Medios o arrastrándolos al lienzo.</div>
      <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:6px;"><b>Paso 2: Organiza la línea de tiempo</b><br>Arrastra clips a las pistas, recorta, divide o duplica con facilidad.</div>
      <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:6px;"><b>Paso 3: Estudio IA de Video, Música y Voz</b><br>Genera escenas automáticas con Pollinations AI, crea beats instrumentales y voz en off sintética.</div>
      <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:6px;"><b>Paso 4: Formatos para Redes Sociales</b><br>Adapta tu proyecto al instante para TikTok, YouTube Shorts, Reels o formato horizontal.</div>
      <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:6px;"><b>Paso 5: Exporta y comparte directo</b><br>Exporta en 720p o 1080p y comparte con un clic en YouTube, TikTok, Instagram, WhatsApp y más.</div>
    </div>

    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn primary" data-close>Entendido</button>
    </div>
  `, { wide: true });
}

async function openAuthModal() {
  const user = await getCurrentUser();
  if (user) {
    openModal(`
      <h2>Tu cuenta Supabase</h2>
      <p class="modal-sub">Sesión activa como <b>${escapeHtml(user.email)}</b> (Soporte & Dueño: soporte@jcads.net)</p>
      <div class="modal-actions">
        <button class="btn danger" id="authSignOut">Cerrar sesión</button>
        <button class="btn primary" data-close>Cerrar</button>
      </div>
    `);
    $("#authSignOut")?.addEventListener("click", async () => {
      await signOutUser();
      closeModal(true);
      toast("Sesión cerrada.", "ok");
      $("#btnAuth").textContent = "👤 Iniciar sesión";
    });
    return;
  }

  openModal(`
    <h2>Iniciar sesión / Registrarse</h2>
    <p class="modal-sub">Accede con Supabase para sincronizar tu perfil y soporte.</p>
    
    <button class="btn ghost wide" id="authGoogleBtn" style="margin-bottom:14px; border-color:var(--line-strong);">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;margin-right:6px"><path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.8 7.4l3.7 2.9C6.4 7.3 9 5 12 5z"/><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/><path fill="#FBBC05" d="M5.5 14.7c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.8 7.2C.7 9.4 0 11.9 0 14.5s.7 5.1 1.8 7.3l3.7-2.9c-.3-.9-.5-1.9-.5-3.2z"/><path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.6-2.3-6.5-5.3L1.8 15.8C3.7 19.6 7.5 23 12 23z"/></svg>
      Continuar con Google
    </button>

    <div style="text-align:center; margin:10px 0; color:var(--muted); font-size:11px;">o con correo y contraseña</div>

    <div class="modal-form" style="text-align:left;">
      <label>Correo electrónico</label>
      <input type="email" class="text-input" id="authEmail" placeholder="tucorreo@ejemplo.com">
      
      <label style="margin-top:10px;">Contraseña</label>
      <div style="position:relative;">
        <input type="password" class="text-input" id="authPassword" placeholder="••••••••" style="width:100%; padding-right:36px;">
        <button type="button" id="authEyeBtn" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer;">👁️</button>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <button class="link" id="authForgot" style="font-size:11px;">¿Olvidaste tu contraseña?</button>
      </div>

      <div id="authError" style="color:var(--danger); font-size:11px; margin-top:6px;"></div>
    </div>

    <div class="modal-actions" style="margin-top:14px;">
      <button class="btn ghost" id="authSignUp">Registrarse</button>
      <button class="btn primary" id="authSignIn">Iniciar sesión</button>
    </div>
  `, { wide: false });

  $("#authEyeBtn")?.addEventListener("click", () => {
    const p = $("#authPassword");
    if (p) p.type = p.type === "password" ? "text" : "password";
  });

  $("#authGoogleBtn")?.addEventListener("click", async () => {
    try { await signInWithGoogle(); } catch (err) { toast("Error Google: " + err.message, "err"); }
  });

  $("#authSignIn")?.addEventListener("click", async () => {
    const email = $("#authEmail")?.value.trim();
    const password = $("#authPassword")?.value;
    const err = $("#authError");
    if (!email || !password) { err.textContent = "Introduce correo y contraseña."; return; }
    try {
      await signInWithEmail(email, password);
      closeModal(true);
      toast("¡Sesión iniciada correctamente!", "ok");
      $("#btnAuth").textContent = `👤 ${email.split("@")[0]}`;
    } catch (e) {
      err.textContent = e.message || "Error al iniciar sesión";
    }
  });

  $("#authSignUp")?.addEventListener("click", async () => {
    const email = $("#authEmail")?.value.trim();
    const password = $("#authPassword")?.value;
    const err = $("#authError");
    if (!email || !password) { err.textContent = "Introduce correo y contraseña."; return; }
    try {
      await signUpWithEmail(email, password);
      closeModal(true);
      toast("¡Cuenta creada con éxito!", "ok", 6000);
      $("#btnAuth").textContent = `👤 ${email.split("@")[0]}`;
    } catch (e) {
      err.textContent = e.message || "Error al registrarse";
    }
  });

  $("#authForgot")?.addEventListener("click", async () => {
    const email = $("#authEmail")?.value.trim();
    const err = $("#authError");
    if (!email) { err.textContent = "Escribe tu correo arriba para recuperar la contraseña."; return; }
    try {
      await resetPassword(email);
      toast("Correo de recuperación enviado a " + email, "ok", 6000);
    } catch (e) {
      err.textContent = e.message || "Error al enviar recuperación";
    }
  });
}

function openSupportModal() {
  openModal(`
    <h2>Soporte Oficial JC ADS</h2>
    <p class="modal-sub">Envía tu consulta directa a <b>soporte@jcads.net</b> (Dueño y Administrador).</p>
    <div class="modal-form" style="text-align:left;">
      <label>Tu correo electrónico</label>
      <input type="email" class="text-input" id="supEmail" placeholder="tucorreo@ejemplo.com">
      <label style="margin-top:10px;">Mensaje o consulta</label>
      <textarea class="textarea" id="supMessage" rows="4" placeholder="Escribe tu consulta o requerimiento para soporte@jcads.net..."></textarea>
      <div id="supError" style="color:var(--danger); font-size:11px; margin-top:6px;"></div>
    </div>
    <div class="modal-actions" style="margin-top:14px;">
      <button class="btn ghost" data-close>Cancelar</button>
      <button class="btn primary" id="supSend">Enviar a soporte@jcads.net</button>
    </div>
  `, { wide: false });

  getCurrentUser().then(user => {
    if (user && $("#supEmail")) $("#supEmail").value = user.email;
  });

  $("#supSend")?.addEventListener("click", async () => {
    const email = $("#supEmail")?.value.trim() || "soporte@jcads.net";
    const message = $("#supMessage")?.value.trim();
    const err = $("#supError");
    if (!message) { err.textContent = "Escribe un mensaje."; return; }
    try {
      await sendSupportTicket(email, message);
      closeModal(true);
      toast("¡Mensaje enviado a soporte@jcads.net guardado en Supabase!", "ok", 6000);
    } catch (e) {
      err.textContent = e.message || "Error al enviar";
    }
  });
}

const UI_TEXTS = {
  es: {
    btnNew: "Nuevo",
    btnOpen: "Abrir",
    btnTutorial: "Tutorial",
    btnSave: "Guardar",
    btnExport: "Exportar",
    btnPremium: "Premium",
    btnAuth: "Iniciar sesión",
    btnSupport: "Soporte",
    "rail-media": "Medios",
    "rail-text": "Texto",
    "rail-audio": "Audio",
    "rail-effects": "Filtros",
    "rail-ai": "IA",
  },
  en: {
    btnNew: "New",
    btnOpen: "Open",
    btnTutorial: "Tutorial",
    btnSave: "Save",
    btnExport: "Export",
    btnPremium: "Premium",
    btnAuth: "Sign In",
    btnSupport: "Support",
    "rail-media": "Media",
    "rail-text": "Text",
    "rail-audio": "Audio",
    "rail-effects": "Filters",
    "rail-ai": "AI",
  },
};

function setLanguage(lang) {
  const dict = UI_TEXTS[lang] || UI_TEXTS.es;
  const newLbl = $("#btnNew span.btn-label");
  if (newLbl) newLbl.textContent = dict.btnNew;
  const openLbl = $("#btnOpen span.btn-label");
  if (openLbl) openLbl.textContent = dict.btnOpen;
  const tutLbl = $("#btnTutorial span.btn-label");
  if (tutLbl) tutLbl.textContent = dict.btnTutorial;
  const saveBtn = $("#btnSave");
  if (saveBtn) saveBtn.textContent = dict.btnSave;
  const expBtn = $("#btnExport");
  if (expBtn && expBtn.childNodes[2]) expBtn.childNodes[2].textContent = " " + dict.btnExport;
  const premBtn = $("#btnPremium");
  if (premBtn) premBtn.textContent = dict.btnPremium;
  const authBtn = $("#btnAuth");
  if (authBtn && !authBtn.textContent.includes("👤 ")) authBtn.textContent = `👤 ${dict.btnAuth}`;
  const suppBtn = $("#btnSupport");
  if (suppBtn) suppBtn.textContent = `💬 ${dict.btnSupport}`;

  $$(".rail-btn span").forEach((span) => {
    const text = span.textContent.trim();
    if (text === "Medios" || text === "Media") span.textContent = dict["rail-media"];
    if (text === "Texto" || text === "Text") span.textContent = dict["rail-text"];
    if (text === "Audio") span.textContent = dict["rail-audio"];
    if (text === "Filtros" || text === "Filters") span.textContent = dict["rail-effects"];
    if (text === "IA" || text === "AI") span.textContent = dict["rail-ai"];
  });
}

/* ---------------- Servicio ---------------- */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!location.protocol.startsWith("http")) return;
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("[JCVP] SW", err));
}

boot().catch((err) => {
  console.error("[JCVP] arranque", err);
  toast("Error al iniciar el editor. Revisa la consola.", "err", 8000);
});
