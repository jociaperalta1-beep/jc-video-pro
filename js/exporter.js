/* ============================================================
   JC VIDEO PRO — Exportación real (MediaRecorder + lienzo)
   Genera un archivo de video en tiempo real, sin servidores.
   ============================================================ */

import {
  $, store, projectDuration, isPremium, fmtTime, bytes, escapeHtml, emit,
} from "./core.js";
import { openModal, closeModal, toast } from "./ui.js";
import {
  getMonetization, mountAd, openDirectLink, grantReward,
  canExportWithoutWatermark, rewardMinutesLeft,
} from "./monetization.js";

let renderer = null;
let exporting = false;
const DEBUG = typeof location !== "undefined" && new URLSearchParams(location.search).has("debug");

export function initExporter(rendererInstance) {
  renderer = rendererInstance;
  $("#btnExport")?.addEventListener("click", openExportModal);
}

function dimsFor(targetHeight) {
  const ratio = store.project.width / store.project.height;
  let h = Math.round(targetHeight / 2) * 2;
  let w = Math.round((h * ratio) / 2) * 2;
  return { w, h };
}

function pickMime(webmOnly = false) {
  if (!window.MediaRecorder) return null;
  const mp4 = ["video/mp4"];
  const webm = [
    'video/webm;codecs="vp9,opus"',
    'video/webm;codecs="vp8,opus"',
    "video/webm",
  ];
  const candidates = webmOnly ? webm : [...mp4, ...webm];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch { /* ignore */ }
  }
  return webmOnly ? "" : null;
}

function bitrateFor(w, h, fps) {
  const px = w * h;
  return Math.round(Math.min(45_000_000, Math.max(2_500_000, px * fps * 0.07)));
}

function projectHasAudio() {
  const tracks = store.project?.tracks || [];
  for (const track of tracks) {
    for (const clip of track.clips || []) {
      if ((clip.kind === "audio" || clip.kind === "video") && (clip.volume ?? 1) > 0) return true;
    }
  }
  return false;
}

async function warmUpEncoder(mime, w, h, fps) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(640, w);
  canvas.height = Math.min(640, h);
  const ctx = canvas.getContext("2d");
  let recorder = null;
  let stream = null;
  try {
    stream = canvas.captureStream(fps);
    recorder = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: 1_000_000,
    });
  } catch (err) {
    if (DEBUG) console.warn("[JCVP export] warmup no disponible", err);
    stream?.getTracks().forEach((t) => t.stop());
    return false;
  }

  let firstData = false;
  const ready = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 6000);
    recorder.ondataavailable = (e) => {
      if (!firstData && e.data && e.data.size > 0) {
        firstData = true;
        clearTimeout(timer);
        setTimeout(() => resolve(true), 450);
      }
    };
    recorder.onerror = () => { clearTimeout(timer); resolve(false); };
  });

  try {
    recorder.start(200);
  } catch (err) {
    if (DEBUG) console.warn("[JCVP export] warmup start falló", err);
    stream.getTracks().forEach((t) => t.stop());
    return false;
  }

  const t0 = performance.now();
  const paint = () => {
    if (performance.now() - t0 > 6500) return;
    const t = performance.now() - t0;
    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, `hsl(${t / 8}, 70%, 40%)`);
    g.addColorStop(1, "#050d1f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);

  const ok = await ready;
  try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* ignore */ }
  stream.getTracks().forEach((t) => t.stop());
  if (DEBUG) console.log("[JCVP export] warmup", mime, ok);
  await new Promise((r) => setTimeout(r, 180));
  return ok;
}

function slug(name) {
  return (name || "proyecto")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "proyecto";
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

export function openExportModal() {
  if (exporting) return;
  const duration = projectDuration();
  if (!store.project || duration <= 0) {
    toast("Añade al menos un clip a la línea de tiempo antes de exportar.", "err");
    return;
  }
  const premium = isPremium();
  const unlocked = canExportWithoutWatermark();
  const money = getMonetization();
  const showAds = !unlocked && money.enabled && !!(money.adsterraBanner || money.adsterraDirectLink);
  const rewardMinutes = Math.max(1, Number(money.rewardMinutes) || 30);
  const mime = pickMime();
  if (!window.MediaRecorder) {
    toast("Este navegador no soporta exportación de video. Prueba con Chrome o Edge actualizado.", "err");
    return;
  }
  const defaultHeight = 1080;
  const { w, h } = dimsFor(defaultHeight);

  openModal(`
    <h2>Exportar video</h2>
    <p class="modal-sub">La exportación se graba en tiempo real desde el lienzo del editor. No se sube nada a Internet.</p>

    ${showAds ? `
      <div class="ad-slot">
        <div class="ad-slot-label">Publicidad</div>
        <div class="ad-slot-body" id="expAdBody"></div>
      </div>` : ""}

    <div class="modal-form">
      <div class="two-col">
        <div>
          <label>Resolución</label>
          <select class="select" id="expRes">
            <option value="720">720p · ${dimsFor(720).w}×${dimsFor(720).h}</option>
            <option value="1080" selected>1080p Full HD · ${w}×${h}</option>
            <option value="2160" ${premium ? "" : "disabled"}>4K · ${dimsFor(2160).w}×${dimsFor(2160).h}${premium ? "" : " (Premium)"}</option>
          </select>
        </div>
        <div>
          <label>Cuadros por segundo</label>
          <select class="select" id="expFps">
            <option value="30" selected>30 fps</option>
            <option value="60">60 fps</option>
          </select>
        </div>
      </div>

      <div class="export-info">
        <div><b>Duración:</b> ${fmtTime(duration)}</div>
        <div><b>Formato de archivo:</b> ${mime?.includes("mp4") ? "MP4" : "WebM"} (según este navegador)</div>
        <div><b>Marca de agua:</b> ${isPremium()
          ? "No (plan Premium)"
          : unlocked
            ? `No (desbloqueo por anuncio · ${rewardMinutesLeft()} min restantes)`
            : "Sí — se quita con Premium o con un anuncio"}</div>
      </div>

      ${unlocked ? "" : `
        <div class="honest-note">
          En el plan Gratis el video exportado incluye la marca «JC VIDEO PRO».
          ${showAds && money.adsterraDirectLink ? `
            <div class="reward-row">
              <button class="btn primary tiny" id="expReward">Ver anuncio y quitar la marca (${rewardMinutes} min)</button>
              <span class="mini-help" id="expRewardStatus">Se abrirá el enlace patrocinado en otra pestaña.</span>
            </div>` : ""}
          <button class="link" data-open-premium>Ver planes</button> · o exporta un fotograma PNG sin costo.
        </div>`}
      <p class="mini-help">
        La grabación tarda lo mismo que dura el video. Mantén la pestaña visible y no cierres el editor durante el proceso.
        La exportación genera ${mime?.includes("mp4") ? "MP4" : "WebM"}; podrás descargarlo al terminar.
      </p>
    </div>

    <div class="modal-actions">
      <button class="btn ghost" id="expFrame">Guardar fotograma PNG</button>
      <button class="btn ghost" data-close>Cancelar</button>
      <button class="btn primary" id="expStart">Exportar video</button>
    </div>
  `, { wide: true });

  const modal = $("#modal");
  const adBody = $("#expAdBody");
  if (adBody) {
    let mounted = false;
    if (money.adsterraBanner) mounted = mountAd(adBody, money.adsterraBanner);
    if (!mounted && money.adsterraDirectLink) {
      adBody.innerHTML = `<a class="btn ghost" href="${escapeHtml(money.adsterraDirectLink)}" target="_blank" rel="noopener noreferrer">Abrir anuncio patrocinado</a>`;
    }
  }

  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-premium]")) {
      closeModal(true);
      emit("open-premium");
    }
  });

  $("#expReward")?.addEventListener("click", () => {
    if (!openDirectLink(money.adsterraDirectLink)) {
      toast("No se pudo abrir el anuncio. Revisa el enlace en el panel de administración.", "err");
      return;
    }
    grantReward(rewardMinutes);
    toast(`Anuncio abierto. Marca de agua desbloqueada durante ${rewardMinutes} minutos.`, "ok", 6000);
    closeModal(true);
    setTimeout(openExportModal, 280);
  });

  $("#expFrame")?.addEventListener("click", exportFrame);
  $("#expStart")?.addEventListener("click", () => {
    const height = Number($("#expRes")?.value || 1080);
    const fps = Number($("#expFps")?.value || 30);
    closeModal(true);
    startExport({ height, fps });
  });
}

function exportFrame() {
  if (!store.project) return;
  renderer.pause();
  const canvas = document.createElement("canvas");
  canvas.width = store.project.width;
  canvas.height = store.project.height;
  renderer.draw(canvas.getContext("2d"), canvas.width, canvas.height, store.time, {
    watermark: !canExportWithoutWatermark(),
  });
  canvas.toBlob((blob) => {
    if (!blob) { toast("No se pudo generar el fotograma.", "err"); return; }
    download(blob, `JC_VIDEO_PRO_fotograma_${Date.now()}.png`);
    toast("Fotograma PNG guardado. Revisa tus descargas.", "ok");
  }, "image/png");
}

async function startExport({ height, fps, forceMime = null, retried = 0, noAudio = false }) {
  if (!renderer || !store.project) return;
  const duration = projectDuration();
  if (duration <= 0) return;
  const unlocked = canExportWithoutWatermark();
  const { w, h } = dimsFor(height);
  let mime = forceMime || pickMime();
  if (!mime) { toast("Este navegador no permite grabar video.", "err"); return; }
  const includeAudio = !noAudio && projectHasAudio();

  exporting = true;
  store.exporting = true;
  renderer.pause();
  emit("export-start");

  openModal(`
    <h2>Exportando…</h2>
    <p class="modal-sub">Grabando ${w}×${h} a ${fps} fps. La duración del proceso es igual a la del video.</p>
    <div class="progress-wrap">
      <div class="progress-bar"><span id="expBar"></span></div>
      <div class="progress-text"><span id="expTime">00:00.0 / ${fmtTime(duration)}</span><span id="expPct">0%</span></div>
    </div>
    <div class="honest-note" style="margin-top:14px">
      No cierres esta pestaña. <span id="expFormatNote">Si el navegador lo permite, el archivo será ${mime.includes("mp4") ? "MP4" : "WebM"}.</span>
    </div>
    <div class="modal-actions">
      <button class="btn danger" id="expCancel">Cancelar exportación</button>
    </div>
  `, { wide: true, locked: true });

  let cancelFlag = false;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let finished = false;

  $("#expCancel")?.addEventListener("click", () => {
    cancelFlag = true;
    try { recorder?.state === "recording" && recorder.stop(); } catch { /* ignore */ }
    if (!recorder) finish(false);
  });

  const cleanup = () => {
    try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    renderer.finishExport();
    store.exporting = false;
    exporting = false;
    emit("export-end");
  };

  const finish = (ok, blob = null, meta = {}) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (!ok || !blob || blob.size < 1024) {
      closeModal(true);
      if (ok) toast("El navegador generó un archivo vacío. Prueba otra resolución o usa Chrome/Edge actualizado.", "err");
      else toast("Exportación cancelada.", "");
      return;
    }
    showSuccess(blob, { w, h, mime, ...meta });
  };

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  let videoTrack = null;

  const setPrep = (msg) => {
    if ($("#expPct")) $("#expPct").textContent = msg;
    if ($("#expTime")) $("#expTime").textContent = "Preparando el grabador…";
  };

  try {
    setPrep("…");
    let warm = await warmUpEncoder(mime, w, h, fps);
    if (!warm && /mp4/i.test(mime)) {
      const fallback = pickMime(true) || "video/webm";
      toast("Tu navegador no grabó MP4 correctamente. Se usará WebM.", "");
      mime = fallback;
      setPrep("…");
      warm = await warmUpEncoder(mime, w, h, fps);
    }
    if ($("#expPct")) $("#expPct").textContent = "0%";
    if ($("#expTime")) $("#expTime").textContent = `00:00.0 / ${fmtTime(duration)}`;
    if ($("#expFormatNote")) $("#expFormatNote").textContent = `Si el navegador lo permite, el archivo será ${mime.includes("mp4") ? "MP4" : "WebM"}.`;
    await renderer.prepareExport();
    stream = canvas.captureStream(0);
    videoTrack = stream.getVideoTracks()[0];
    if (includeAudio) {
      const audioTrack = renderer.getAudioTrack();
      if (audioTrack) stream.addTrack(audioTrack);
    }
    recorder = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: bitrateFor(w, h, fps),
    });
    recorder.ondataavailable = (e) => {
      if (DEBUG) console.log("[JCVP export] chunk", e.data?.size, "total", chunks.length);
      if (e.data && e.data.size) chunks.push(e.data);
    };
    recorder.onerror = (err) => {
      console.error("[JCVP] MediaRecorder", err);
      finish(false);
      toast("La grabación falló. Prueba otra resolución o navegador.", "err");
    };
    recorder.onstop = () => {
      const type = mime || "video/webm";
      const blob = new Blob(chunks, { type });
      if (cancelFlag) { finish(false); return; }
      if (blob.size < 1024) {
        if (includeAudio) {
          finished = true;
          cleanup();
          toast("El audio no se pudo grabar. Reintentando sin audio…", "");
          startExport({ height, fps, forceMime: mime, retried: retried + 1, noAudio: true });
          return;
        }
        if (/mp4/i.test(mime) && retried < 2) {
          finished = true;
          cleanup();
          const fallback = pickMime(true) || "video/webm";
          toast("Este navegador no grabó MP4 correctamente. Reintentando en WebM…", "");
          startExport({ height, fps, forceMime: fallback, retried: retried + 1, noAudio: true });
          return;
        }
      }
      finish(true, blob, { audio: includeAudio });
    };
    recorder.start(250);
    if (DEBUG) console.log("[JCVP export] start", { mime, w, h, fps, audio: includeAudio, tracks: stream.getTracks().map((t) => t.kind), settings: stream.getVideoTracks()[0]?.getSettings?.() });
  } catch (err) {
    console.error(err);
    finish(false);
    toast("No se pudo iniciar la grabación: " + (err.message || err), "err");
    return;
  }

  const bar = () => $("#expBar");
  const timeLabel = () => $("#expTime");
  const pctLabel = () => $("#expPct");
  const startWall = performance.now();
  let lastUi = 0;
  let frameNo = 0;
  let reqCount = 0;

  const frame = () => {
    if (cancelFlag || finished) return;
    frameNo++;
    const elapsed = (performance.now() - startWall) / 1000;
    const t = Math.min(elapsed, duration - 0.001);
    if (elapsed >= duration) {
      renderer.syncMedia(duration, true);
      renderer.draw(ctx, w, h, t, { watermark: !unlocked });
      try { videoTrack?.requestFrame?.(); } catch { /* ignore */ }
      if (DEBUG) console.log("[JCVP export] last frame", frameNo, "chunks", chunks.length, "px", [...ctx.getImageData(0, 0, 1, 1).data]);
      try { recorder.stop(); } catch { /* ignore */ }
      return;
    }
    renderer.syncMedia(elapsed, true);
    renderer.draw(ctx, w, h, t, { watermark: !unlocked });
    ctx.fillStyle = frameNo % 2 ? "rgba(255,255,255,0.004)" : "rgba(255,255,255,0.008)";
    ctx.fillRect(0, 0, 1, 1);
    try { videoTrack?.requestFrame?.(); reqCount++; } catch { /* ignore */ }
    if (DEBUG && frameNo % 30 === 0) {
      console.log("[JCVP export] frame", frameNo, "req", reqCount, "elapsed", elapsed.toFixed(2), "chunks", chunks.length, "track", videoTrack?.readyState, "muted", videoTrack?.muted, "px", [...ctx.getImageData(0, 0, 1, 1).data]);
    }

    if (elapsed - lastUi > 0.1) {
      lastUi = elapsed;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      if (bar()) bar().style.width = pct + "%";
      if (pctLabel()) pctLabel().textContent = pct + "%";
      if (timeLabel()) timeLabel().textContent = `${fmtTime(elapsed)} / ${fmtTime(duration)}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function showSuccess(blob, { w, h, mime, audio = false }) {
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const filename = `JC_VIDEO_PRO_${slug(store.project.name)}_${w}x${h}.${ext}`;
  const url = download(blob, filename);
  const sizeText = bytes(blob.size);
  const premium = isPremium();
  const unlocked = canExportWithoutWatermark();
  const watermarkLabel = premium
    ? "No (plan Premium)"
    : unlocked
      ? `No (desbloqueo por anuncio · ${rewardMinutesLeft()} min)`
      : "Sí (plan Gratis)";

  openModal(`
    <h2>¡Video exportado con éxito!</h2>
    <p class="modal-sub">El archivo se descargó a tu dispositivo. Compártelo directamente en redes sociales o copia el enlace:</p>
    <video src="${url}" controls playsinline style="width:100%;max-height:36vh;border-radius:12px;background:#000;border:1px solid var(--line)"></video>
    
    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin:14px 0;">
      <a class="btn ghost" href="https://studio.youtube.com" target="_blank" rel="noopener" style="justify-content:center;">▶️ YouTube Studio</a>
      <a class="btn ghost" href="https://www.tiktok.com/upload" target="_blank" rel="noopener" style="justify-content:center;">🎵 TikTok</a>
      <a class="btn ghost" href="https://www.instagram.com" target="_blank" rel="noopener" style="justify-content:center;">📸 Instagram Reels</a>
      <a class="btn ghost" href="https://www.facebook.com" target="_blank" rel="noopener" style="justify-content:center;">📘 Facebook</a>
      <a class="btn ghost" href="https://api.whatsapp.com/send?text=¡Mira%20mi%20video%20creado%20con%20JC%20VIDEO%20PRO!%20https://jcads.net" target="_blank" rel="noopener" style="justify-content:center;">💬 WhatsApp</a>
      <button class="btn ghost" id="btnCopyShareLink" style="justify-content:center;">🔗 Copiar Enlace</button>
    </div>

    <div class="export-info">
      <div><b>Archivo:</b> ${escapeHtml(filename)}</div>
      <div><b>Tamaño:</b> ${escapeHtml(sizeText)} · <b>Resolución:</b> ${w}×${h}</div>
      <div><b>Marca de agua:</b> ${watermarkLabel}</div>
    </div>
    <div class="modal-actions">
      <a class="btn ghost" href="${url}" download="${escapeHtml(filename)}">Descargar de nuevo</a>
      <button class="btn ghost" id="expAgain">Exportar otro</button>
      <button class="btn primary" data-close>Cerrar</button>
    </div>
  `, { wide: true });

  $("#btnCopyShareLink")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(url);
    toast("Enlace del video copiado al portapapeles.", "ok");
  });

  $("#expAgain")?.addEventListener("click", () => {
    closeModal(true);
    openExportModal();
  });
  toast("Exportación completada.", "ok");
}
