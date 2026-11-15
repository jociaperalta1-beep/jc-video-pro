/* ============================================================
   JC VIDEO PRO — Monetización (anuncios, recompensas y pagos)
   Configuración local editable desde admin.html.
   ============================================================ */

import { emit, isPremium } from "./core.js";

const CONFIG_KEY = "jcvp.monetization";
const LEGACY_KEY = "jcvp.ads";
const REWARD_KEY = "jcvp.reward";

export const DEFAULT_MONETIZATION = {
  enabled: false,
  adsterraBanner: "",
  adsterraDirectLink: "",
  admobApp: "",
  admobBanner: "",
  admobRewarded: "",
  payPremium: "",
  payPro: "",
  payAnnual: "",
  payMethod: "",
  whatsapp: "",
  bankDetails: "",
  walletDetails: "",
  rewardMinutes: 30,
  tutorialVideoUrl: "",
  tutorialAdsEnabled: true,
  aiDailyLimit: 2,
  savedAt: "",
};

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}

export function getMonetization() {
  const saved = readJSON(CONFIG_KEY) || readJSON(LEGACY_KEY) || {};
  return { ...DEFAULT_MONETIZATION, ...saved };
}

export function setMonetization(values = {}) {
  const next = { ...getMonetization(), ...values, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
  emit("monetization", next);
  return next;
}

export function hasWebAds() {
  const config = getMonetization();
  return !!config.enabled && !!(config.adsterraBanner || config.adsterraDirectLink);
}

/* ---------------- Desbloqueo temporal por anuncio ---------------- */
export function getRewardUntil() {
  const data = readJSON(REWARD_KEY);
  return Number(data?.until) || 0;
}

export function rewardActive() {
  return getRewardUntil() > Date.now();
}

export function rewardMinutesLeft() {
  const ms = getRewardUntil() - Date.now();
  return ms > 0 ? Math.max(1, Math.ceil(ms / 60000)) : 0;
}

export function grantReward(minutes = 30) {
  const safeMinutes = Math.max(1, Math.min(1440, Number(minutes) || 30));
  const data = { until: Date.now() + safeMinutes * 60000, grantedAt: Date.now(), minutes: safeMinutes };
  try { localStorage.setItem(REWARD_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  emit("reward", data);
  return data;
}

export function clearReward() {
  try { localStorage.removeItem(REWARD_KEY); } catch { /* ignore */ }
  emit("reward", null);
}

export function canExportWithoutWatermark() {
  return isPremium() || rewardActive();
}

/* ---------------- Anuncios ---------------- */
export function openDirectLink(url = "") {
  const target = url || getMonetization().adsterraDirectLink;
  if (!/^https?:\/\//i.test(target || "")) return false;
  const opened = window.open(target, "_blank", "noopener,noreferrer");
  return !!opened;
}

export function mountAd(container, html = "") {
  if (!container) return false;
  container.innerHTML = "";
  if (!html) return false;
  const template = document.createElement("template");
  template.innerHTML = html;
  container.appendChild(template.content.cloneNode(true));

  container.querySelectorAll("script").forEach((old) => {
    const script = document.createElement("script");
    for (const attr of Array.from(old.attributes)) script.setAttribute(attr.name, attr.value);
    script.textContent = old.textContent;
    old.replaceWith(script);
  });
  return true;
}

/* ---------------- Pagos ---------------- */
const PAY_KEYS = { premium: "payPremium", pro: "payPro", annual: "payAnnual" };

export function getPaymentUrl(plan) {
  const key = PAY_KEYS[plan];
  return key ? getMonetization()[key] || "" : "";
}

export function getPaymentMethod() {
  return getMonetization().payMethod || "";
}

export function whatsappUrl(number = "", message = "") {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return "";
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}

/* ---------------- Acceso Pro temporal ---------------- */
export function hasProAccess() {
  return isPremium() || rewardActive();
}

/* ---------------- Tutorial ---------------- */
export function formatVideoEmbedUrl(url = "") {
  const value = String(url || "").trim();
  if (!value) return { type: "none", src: "" };
  const youtube = value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([\w-]{11})/);
  if (youtube) return { type: "youtube", src: `https://www.youtube.com/embed/${youtube[1]}?autoplay=0&rel=0` };
  const vimeo = value.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { type: "vimeo", src: `https://player.vimeo.com/video/${vimeo[1]}` };
  return { type: "video", src: value };
}

const PRO_TIPS_KEY = "jcvp.proTips";
export function hasProTipsUnlocked() {
  if (hasProAccess()) return true;
  try { return localStorage.getItem(PRO_TIPS_KEY) === "1"; } catch { return false; }
}
export function unlockProTips() {
  try { localStorage.setItem(PRO_TIPS_KEY, "1"); } catch { /* ignore */ }
  emit("pro-tips", true);
}

/* ---------------- Cuota diaria de IA ---------------- */
const AI_USAGE_KEY = "jcvp.aiDailyUses";

export function getAIUsage() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = JSON.parse(localStorage.getItem(AI_USAGE_KEY)) || {};
    if (raw.date !== today) return { date: today, used: 0, extraGranted: 0 };
    return {
      date: today,
      used: Math.max(0, Number(raw.used) || 0),
      extraGranted: Math.max(0, Number(raw.extraGranted) || 0),
    };
  } catch {
    return { date: today, used: 0, extraGranted: 0 };
  }
}

export function recordAIUse() {
  const usage = getAIUsage();
  usage.used += 1;
  try { localStorage.setItem(AI_USAGE_KEY, JSON.stringify(usage)); } catch { /* ignore */ }
  emit("ai-usage", usage);
  return usage;
}

export function grantExtraAIUses(count = 2) {
  const usage = getAIUsage();
  usage.extraGranted += Math.max(1, Number(count) || 2);
  try { localStorage.setItem(AI_USAGE_KEY, JSON.stringify(usage)); } catch { /* ignore */ }
  emit("ai-usage", usage);
  return usage;
}

export function checkAIQuota() {
  if (isPremium()) {
    return { allowed: true, unlimited: true, remaining: Infinity, limit: Infinity, used: 0, baseLimit: Infinity };
  }
  const config = getMonetization();
  const baseLimit = Math.max(1, Math.round(Number(config.aiDailyLimit) || 2));
  const usage = getAIUsage();
  const limit = baseLimit + usage.extraGranted;
  const remaining = Math.max(0, limit - usage.used);
  return {
    allowed: remaining > 0,
    unlimited: false,
    remaining,
    limit,
    baseLimit,
    used: usage.used,
    extraGranted: usage.extraGranted,
  };
}
