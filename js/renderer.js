/* ============================================================
   JC VIDEO PRO — Motor de reproducción y dibujo del lienzo
   ============================================================ */

import {
  store, projectDuration, emit, clamp, cssFilter, defaultText,
} from "./core.js";

const RENDER_ORDER = ["t-video", "t-overlay", "t-text"];
const FONT_STACK = '"Segoe UI Variable Display", "Segoe UI", Inter, system-ui, sans-serif';

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingQuality = "high";
    this.elements = new Map();
    this.images = new Map();
    this.audioCtx = null;
    this.master = null;
    this.mediaDest = null;
    this.raf = 0;
    this.playing = false;
    this.startWall = 0;
    this.startTime = 0;
    this.voicePlayed = new Set();
  }

  setProject(project) {
    this.pauseAllElements();
    this.stopVoiceover();
    this.playing = false;
    store.playing = false;
    cancelAnimationFrame(this.raf);
    this.elements.clear();
    this.images.clear();
    if (project) {
      this.canvas.width = project.width;
      this.canvas.height = project.height;
      this.drawFrame(0);
    }
  }

  /* ---------------- Audio ---------------- */
  initAudio() {
    if (this.audioCtx) return this.audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.audioCtx = new AC();
      this.master = this.audioCtx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.audioCtx.destination);
      this.mediaDest = this.audioCtx.createMediaStreamDestination();
      this.master.connect(this.mediaDest);
    } catch (err) {
      console.warn("[JCVP] AudioContext no disponible", err);
      this.audioCtx = null;
    }
    return this.audioCtx;
  }

  async ensureAudioRunning() {
    if (!this.audioCtx) this.initAudio();
    try {
      if (this.audioCtx?.state === "suspended") await this.audioCtx.resume();
    } catch { /* ignore */ }
  }

  connectAudio(el) {
    this.initAudio();
    if (!this.audioCtx || !this.master) return;
    if (el.__jcvpConnected) return;
    try {
      const source = this.audioCtx.createMediaElementSource(el);
      source.connect(this.master);
      el.__jcvpConnected = true;
    } catch (err) {
      console.warn("[JCVP] nodo de audio", err);
    }
  }

  getAudioTrack() {
    this.initAudio();
    return this.mediaDest?.stream.getAudioTracks()[0] || null;
  }

  speakVoiceover(clip) {
    if (!clip?.voiceover || !window.speechSynthesis) return;
    const text = String(clip.voiceover.text || "").trim();
    if (!text) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices() || [];
      const voice = voices.find((v) => v.voiceURI === clip.voiceover.voiceURI)
        || voices.find((v) => String(v.lang || "").toLowerCase().startsWith("es"));
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || "es-ES";
      utterance.rate = clamp(Number(clip.voiceover.rate) || 1, 0.5, 2);
      utterance.pitch = clamp(Number(clip.voiceover.pitch) || 1, 0, 2);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("[JCVP] voz IA", err);
    }
  }

  stopVoiceover() {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    this.voicePlayed.clear();
  }

  /* ---------------- Elementos multimedia ---------------- */
  ensureElement(clip) {
    if (!clip) return null;
    if (this.elements.has(clip.id)) return this.elements.get(clip.id);
    const media = store.media.get(clip.mediaId);
    if (!media) return null;

    if (clip.kind === "image") {
      let img = this.images.get(media.id);
      if (!img) {
        img = new Image();
        img.decoding = "async";
        img.onload = () => { if (!this.playing && !store.exporting) this.drawFrame(); };
        img.src = media.url;
        this.images.set(media.id, img);
      }
      return img;
    }

    if (clip.kind !== "video" && clip.kind !== "audio") return null;
    const el = document.createElement(clip.kind === "audio" ? "audio" : "video");
    el.src = media.url;
    el.preload = "auto";
    el.playsInline = true;
    if (clip.kind === "video") el.muted = false;
    el.addEventListener("seeked", () => { if (!this.playing) this.drawFrame(); });
    el.addEventListener("loadeddata", () => { if (!this.playing) this.drawFrame(); });
    this.connectAudio(el);
    this.elements.set(clip.id, el);
    return el;
  }

  /* ---------------- Dibujo ---------------- */
  drawFrame(time = store.time) {
    if (!store.project) return;
    this.draw(this.ctx, this.canvas.width, this.canvas.height, time, {
      watermark: false,
    });
  }

  draw(ctx, W, H, time, opts = {}) {
    if (!store.project) return;
    ctx.save();
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#07040f");
    bg.addColorStop(0.5, "#05030c");
    bg.addColorStop(1, "#0a0718");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (const trackId of RENDER_ORDER) {
      const track = store.project.tracks.find((t) => t.id === trackId);
      if (!track) continue;
      for (const clip of track.clips) {
        if (clip.hidden) continue;
        const local = time - clip.start;
        if (local < 0 || local >= clip.duration) continue;
        if (clip.kind === "text") this.drawText(ctx, W, H, clip, time);
        else this.drawMedia(ctx, W, H, clip, time);
      }
    }

    if (opts.watermark) this.drawWatermark(ctx, W, H);
    ctx.restore();
  }

  drawMedia(ctx, W, H, clip, time) {
    const media = store.media.get(clip.mediaId);
    if (!media) return;
    const source = this.ensureElement(clip);
    if (!source) return;
    const isImage = clip.kind === "image";
    const iw = isImage ? source.naturalWidth || media.width || W : source.videoWidth || media.width || W;
    const ih = isImage ? source.naturalHeight || media.height || H : source.videoHeight || media.height || H;
    if (!iw || !ih) return;
    if (isImage && !source.complete) return;
    if (!isImage && source.readyState < 2) return;

    const local = time - clip.start;
    let alpha = clip.opacity ?? 1;
    const fadeIn = clip.fadeIn || 0;
    const fadeOut = clip.fadeOut || 0;
    if (fadeIn > 0) alpha *= clamp(local / fadeIn, 0, 1);
    if (fadeOut > 0) alpha *= clamp((clip.duration - local) / fadeOut, 0, 1);
    if (alpha <= 0) return;

    const tr = clip.transform || {};
    const anim = clip.animation || "none";
    const animProgress = clamp(local / Math.max(0.01, clip.duration), 0, 1);
    let animScale = 1;
    let animX = 0;
    let animY = 0;
    let animAlpha = 1;
    let neonGlow = false;
    let flashAlpha = 0;
    let wipe = 0;
    if (anim === "pop") {
      const e = clamp(local / 0.45, 0, 1);
      animScale = Math.max(0.01, easeOutBack(e));
      animAlpha = clamp(local / 0.1, 0, 1);
    } else if (anim === "zoom" || anim === "zoomDynamic") {
      animScale = 1 + animProgress * 0.14;
      animAlpha = clamp(local / 0.2, 0, 1);
    } else if (anim === "slide" || anim === "slideSmooth") {
      const e = easeOutCubic(clamp(local / 0.45, 0, 1));
      animY = (1 - e) * 0.18;
      animAlpha = e;
    } else if (anim === "pulse") {
      animScale = 1 + Math.pow(Math.abs(Math.sin(local * Math.PI * 2.2)), 4) * 0.12;
      animAlpha = clamp(local / 0.15, 0, 1);
    } else if (anim === "neon") {
      neonGlow = true;
      animAlpha = clamp(local / 0.2, 0, 1);
    } else if (anim === "flash") {
      animAlpha = clamp(local / 0.08, 0, 1);
      flashAlpha = Math.max(0, 1 - local / 0.25);
    } else if (anim === "typewriter") {
      wipe = animProgress;
      animAlpha = clamp(local / 0.05, 0, 1);
    }
    if (anim !== "none" && anim !== "typewriter") {
      animAlpha *= clamp((clip.duration - local) / 0.25, 0, 1);
    }
    if (animAlpha <= 0) return;

    let motionScale = 1;
    let motionX = 0;
    let motionY = 0;
    if (clip.motion) {
      const progress = clamp(local / Math.max(0.01, clip.duration), 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const from = clip.motion;
      motionScale = (from.zoomFrom ?? 1) + ((from.zoomTo ?? 1) - (from.zoomFrom ?? 1)) * eased;
      motionX = (from.panFromX ?? 0) + ((from.panToX ?? 0) - (from.panFromX ?? 0)) * eased;
      motionY = (from.panFromY ?? 0) + ((from.panToY ?? 0) - (from.panFromY ?? 0)) * eased;
    }
    const scale = Math.max(W / iw, H / ih) * (tr.scale || 1) * motionScale * animScale;
    const dw = iw * scale;
    const dh = ih * scale;
    const cx = W / 2 + ((tr.x || 0) + motionX + animX) * W;
    const cy = H / 2 + ((tr.y || 0) + motionY + animY) * H;

    ctx.save();
    ctx.globalAlpha = clamp(alpha * animAlpha, 0, 1);
    try {
      ctx.filter = cssFilter(clip.filter);
      if (neonGlow) {
        ctx.filter += " drop-shadow(0 0 14px rgba(56,189,248,0.95)) drop-shadow(0 0 28px rgba(240,171,252,0.75))";
      }
    } catch { /* ignore */ }
    ctx.translate(cx, cy);
    if (tr.rotation) ctx.rotate((tr.rotation * Math.PI) / 180);
    if (wipe > 0) {
      ctx.beginPath();
      ctx.rect(-dw / 2, -dh / 2, dw * wipe, dh);
      ctx.clip();
    }
    try {
      ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
    } catch (err) {
      console.warn("[JCVP] no se pudo dibujar el clip", err);
    }
    if (flashAlpha > 0) {
      ctx.globalAlpha = clamp(flashAlpha * 0.85, 0, 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
  }

  drawText(ctx, W, H, clip, time) {
    const t = { ...defaultText(), ...(clip.text || {}) };
    const local = time - clip.start;
    const tr = clip.transform || {};
    const anim = t.animation || "none";
    const duration = Math.max(0.01, clip.duration);
    const progress = clamp(local / duration, 0, 1);
    const size = Math.max(8, (t.size || 96) * (H / 1920) * (tr.scale || 1));
    let alpha = 1;
    let rise = 0;
    let scale = 1;
    let neonGlow = false;
    let flashAlpha = 0;
    let typewriter = false;

    if (anim === "fade") {
      alpha = clamp(local / 0.3, 0, 1) * clamp((duration - local) / 0.25, 0, 1);
    } else if (anim === "slide" || anim === "slideSmooth") {
      const e = easeOutCubic(clamp(local / 0.45, 0, 1));
      rise = (1 - e) * size * 0.9;
      alpha = clamp(local / 0.25, 0, 1) * clamp((duration - local) / 0.25, 0, 1);
    } else if (anim === "zoom" || anim === "zoomDynamic") {
      scale = 0.9 + clamp(local / 0.35, 0, 1) * 0.18 + progress * 0.04;
      alpha = clamp(local / 0.2, 0, 1) * clamp((duration - local) / 0.25, 0, 1);
    } else if (anim === "pop") {
      scale = Math.max(0.01, easeOutBack(clamp(local / 0.45, 0, 1)));
      alpha = clamp(local / 0.1, 0, 1) * clamp((duration - local) / 0.25, 0, 1);
    } else if (anim === "pulse") {
      const beat = Math.abs(Math.sin(local * Math.PI * 2.2));
      scale = 1 + Math.pow(beat, 4) * 0.12;
      alpha = clamp(local / 0.15, 0, 1) * clamp((duration - local) / 0.25, 0, 1);
    } else if (anim === "neon") {
      neonGlow = true;
      alpha = clamp(local / 0.2, 0, 1) * clamp((duration - local) / 0.25, 0, 1);
    } else if (anim === "flash") {
      alpha = clamp(local / 0.08, 0, 1);
      flashAlpha = Math.max(0, 1 - local / 0.25);
    } else if (anim === "typewriter") {
      typewriter = true;
      alpha = 1;
    }

    let content = String(t.content ?? "");
    if (typewriter) {
      const reveal = clamp(local / Math.min(duration * 0.75, 3.5), 0, 1);
      const visibleChars = Math.floor(content.length * reveal);
      const cursor = visibleChars < content.length && Math.floor(local * 6) % 2 === 0 ? "▍" : "";
      content = content.slice(0, visibleChars) + cursor;
    }

    ctx.save();
    ctx.translate(t.x * W, t.y * H + rise);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.translate(-t.x * W, -(t.y * H + rise));
    ctx.globalAlpha = clamp(alpha, 0, 1);

    ctx.font = `${t.weight || 800} ${Math.round(size)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxWidth = W * 0.9;
    const paragraphs = content.split("\n");
    const lines = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(""); continue; }
      let current = "";
      for (const word of words) {
        const test = current ? current + " " + word : word;
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
    }
    const lineHeight = size * 1.18;
    const totalH = lines.length * lineHeight;
    const baseY = t.y * H - totalH / 2 + lineHeight / 2 + rise;
    const maxLineW = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));

    if (t.bg && (t.bgOpacity ?? 0) > 0) {
      const padX = size * 0.42;
      const padY = size * 0.22;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1) * clamp(t.bgOpacity, 0, 1);
      ctx.fillStyle = t.bg;
      const boxW = Math.min(W * 0.96, maxLineW + padX * 2);
      const boxH = totalH + padY * 2;
      const boxX = t.x * W - boxW / 2;
      const boxY = baseY - lineHeight / 2 - padY;
      this._roundRect(ctx, boxX, boxY, boxW, boxH, Math.min(size * 0.24, 28));
      ctx.fill();
      ctx.restore();
    }

    if (neonGlow) {
      ctx.shadowColor = Math.sin(local * 5) > 0 ? "#38bdf8" : "#f0abfc";
      ctx.shadowBlur = Math.max(8, size * 0.35 + Math.sin(local * 7) * size * 0.12);
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = Math.max(2, size * 0.1);
      ctx.shadowOffsetY = Math.max(1, size * 0.03);
    }
    ctx.fillStyle = t.color || "#ffffff";
    lines.forEach((line, i) => {
      ctx.fillText(line, t.x * W, baseY + i * lineHeight);
    });

    if (flashAlpha > 0) {
      const pad = size * 0.35;
      ctx.globalAlpha = clamp(flashAlpha * 0.85, 0, 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(t.x * W - maxLineW / 2 - pad, baseY - totalH / 2 - pad, maxLineW + pad * 2, totalH + pad * 2);
    }
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  drawWatermark(ctx, W, H) {
    const fs = Math.max(13, Math.round(W * 0.022));
    const text = "JC VIDEO PRO";
    ctx.save();
    ctx.font = `800 ${fs}px ${FONT_STACK}`;
    const tw = ctx.measureText(text).width;
    const padX = fs * 0.62;
    const padY = fs * 0.4;
    const w = tw + padX * 2 + fs * 1.1;
    const h = fs + padY * 2;
    const x = W - w - W * 0.03;
    const y = H - h - H * 0.028;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = "rgba(5, 4, 14, 0.72)";
    this._roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(124, 58, 237, 0.65)";
    ctx.lineWidth = Math.max(1, W * 0.0012);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, "#a855f7");
    grad.addColorStop(1, "#38bdf8");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x + padX + fs * 0.22, y + h / 2, fs * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f0ff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text, x + padX + fs * 0.8, y + h / 2 + fs * 0.03);
    ctx.restore();
  }

  /* ---------------- Sincronización de audio/video ---------------- */
  syncMedia(time, isPlaying) {
    if (!store.project) return;
    const activeClips = [];
    for (const trackId of ["t-video", "t-overlay", "t-audio"]) {
      const track = store.project.tracks.find((t) => t.id === trackId);
      if (!track) continue;
      for (const clip of track.clips) {
        if (clip.kind === "image" || clip.kind === "text") continue;
        const active = time >= clip.start && time < clip.start + clip.duration;
        if (active) activeClips.push(clip);
      }
    }
    const activeIds = new Set(activeClips.map((c) => c.id));

    const voiceClips = [];
    for (const track of store.project.tracks) {
      for (const clip of track.clips) {
        if (!clip.voiceover) continue;
        if (time >= clip.start && time < clip.start + clip.duration) voiceClips.push(clip);
      }
    }
    if (isPlaying) {
      for (const clip of voiceClips) {
        if (!this.voicePlayed.has(clip.id) && time - clip.start < 0.12) {
          this.speakVoiceover(clip);
          this.voicePlayed.add(clip.id);
        }
      }
    }
    for (const id of [...this.voicePlayed]) {
      if (!voiceClips.some((clip) => clip.id === id)) this.voicePlayed.delete(id);
    }

    for (const [clipId, el] of this.elements) {
      if (!activeIds.has(clipId) && !el.paused) el.pause();
    }

    for (const clip of activeClips) {
      const el = this.ensureElement(clip);
      if (!el) continue;
      const media = store.media.get(clip.mediaId);
      const speed = clamp(clip.speed || 1, 0.25, 4);
      el.volume = clamp(clip.volume ?? 1, 0, 1);
      el.playbackRate = speed;

      const local = time - clip.start;
      let sourceTime = (clip.in || 0) + local * speed;
      const maxTime = Math.max(0, (media?.duration || 0) - 0.03);
      sourceTime = clamp(sourceTime, 0, maxTime || sourceTime);

      if (isPlaying) {
        if (el.paused) {
          try { el.currentTime = sourceTime; } catch { /* ignore */ }
          el.play().catch(() => {});
        } else if (Math.abs(el.currentTime - sourceTime) > 0.38 && !el.seeking) {
          try { el.currentTime = sourceTime; } catch { /* ignore */ }
        }
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - sourceTime) > 0.04) {
          try { el.currentTime = sourceTime; } catch { /* ignore */ }
        }
      }
    }
  }

  pauseAllElements() {
    for (const el of this.elements.values()) {
      try { el.pause(); } catch { /* ignore */ }
    }
  }

  /* ---------------- Reproducción ---------------- */
  async play() {
    if (!store.project) return false;
    const duration = projectDuration();
    if (duration <= 0) return false;
    await this.ensureAudioRunning();
    this.stopVoiceover();

    this.pauseAllElements();
    if (store.time >= duration - 0.03) store.time = 0;
    this.playing = true;
    store.playing = true;
    emit("playing", true);
    this.startTime = store.time;
    this.startWall = performance.now();

    const loop = () => {
      if (!this.playing) return;
      const t = this.startTime + (performance.now() - this.startWall) / 1000;
      const dur = projectDuration();
      if (t >= dur) {
        store.time = dur;
        this.syncMedia(dur, false);
        this.pause();
        emit("time", dur);
        this.drawFrame(Math.max(0, dur - 0.001));
        return;
      }
      store.time = t;
      this.syncMedia(t, true);
      this.drawFrame(t);
      emit("time", t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    return true;
  }

  pause() {
    const wasPlaying = this.playing || store.playing;
    this.stopVoiceover();
    this.playing = false;
    store.playing = false;
    cancelAnimationFrame(this.raf);
    this.pauseAllElements();
    if (wasPlaying) emit("playing", false);
    if (!store.exporting) this.drawFrame();
  }

  async toggle() {
    if (this.playing) { this.pause(); return false; }
    return this.play();
  }

  seek(time) {
    if (!store.project) return;
    const duration = projectDuration();
    store.time = clamp(time, 0, duration);
    this.stopVoiceover();
    this.syncMedia(store.time, false);
    this.drawFrame(store.time);
    emit("time", store.time);
  }

  /* ---------------- Exportación ---------------- */
  async prepareExport() {
    this.pause();
    this.initAudio();
    await this.ensureAudioRunning();
    store.time = 0;
    this.syncMedia(0, false);
    this.drawFrame(0);
  }

  finishExport() {
    this.pauseAllElements();
    this.playing = false;
    store.playing = false;
    cancelAnimationFrame(this.raf);
  }

  stepFrame(direction = 1) {
    if (!store.project) return;
    const frame = 1 / (store.project.fps || 30);
    this.pause();
    this.seek(store.time + direction * frame);
  }
}
