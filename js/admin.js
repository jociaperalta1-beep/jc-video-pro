/* ============================================================
   JC VIDEO PRO — Panel de administración (local)
   ============================================================ */

import {
  $, getPlan, setPlan, getPrices, setPrices, getAdminCode, setAdminCode,
  DEFAULT_PRICES, getLastProjectId, setLastProjectId, fmtTime, bytes, escapeHtml,
} from "./core.js";
import { getStats, deleteProjectRecord, exportBackup } from "./storage.js";

const AUTH_KEY = "jcvp.adminAuth";
const ADS_KEY = "jcvp.ads";

function isAuthed() {
  try { return sessionStorage.getItem(AUTH_KEY) === "1"; } catch { return false; }
}

function login() {
  const ok = $("#gateCode")?.value === getAdminCode();
  if (!ok) {
    const err = $("#gateError");
    if (err) err.textContent = "Código incorrecto. Inténtalo de nuevo.";
    return;
  }
  try { sessionStorage.setItem(AUTH_KEY, "1"); } catch { /* ignore */ }
  showApp();
}

function showApp() {
  const gate = $("#gate");
  const app = $("#adminApp");
  if (gate) gate.style.display = "none";
  if (app) app.hidden = false;
  renderAll();
}

function renderAll() {
  renderStats();
  renderPrices();
  renderAds();
  renderPlan();
  renderProjects();
  renderSecurity();
}

async function renderStats() {
  const grid = $("#statsGrid");
  if (!grid) return;
  grid.innerHTML = `<div class="stat-card"><div class="sc-label">Cargando…</div><div class="sc-value">…</div></div>`;
  try {
    const stats = await getStats();
    const quotaMB = stats.quota?.quota ? (stats.quota.quota / 1048576).toFixed(0) + " MB" : "—";
    const plan = getPlan();
    const planLabel = { free: "Gratis", premium: "Premium", pro: "Profesional" }[plan] || plan;
    grid.innerHTML = [
      stat("Proyectos", stats.projectCount, "guardados en este navegador"),
      stat("Archivos", stats.mediaCount, "en la biblioteca local"),
      stat("Espacio usado", bytes(stats.mediaBytes), "archivos multimedia"),
      stat("Timeline total", stats.totalMinutes >= 1 ? stats.totalMinutes.toFixed(1) + " min" : Math.round(stats.totalMinutes * 60) + " s", "suma de todos los proyectos"),
      stat("Plan actual", planLabel, "demo local, sin cobro"),
      stat("Cuota del navegador", quotaMB, stats.quota?.usage ? bytes(stats.quota.usage) + " usados" : "no disponible"),
    ].join("");
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="stat-card"><div class="sc-label">Error</div><div class="sc-value">—</div><div class="sc-sub">No se pudieron leer los datos locales.</div></div>`;
  }
}

function stat(label, value, sub) {
  return `<div class="stat-card">
    <div class="sc-label">${escapeHtml(String(label))}</div>
    <div class="sc-value">${escapeHtml(String(value))}</div>
    <div class="sc-sub">${escapeHtml(String(sub || ""))}</div>
  </div>`;
}

function renderPrices() {
  const prices = getPrices();
  if ($("#pricePremium")) $("#pricePremium").value = prices.premium.toFixed(2);
  if ($("#pricePro")) $("#pricePro").value = prices.pro.toFixed(2);
  if ($("#priceAnnual")) $("#priceAnnual").value = prices.annual.toFixed(2);
}

function renderAds() {
  let ads = {};
  try { ads = JSON.parse(localStorage.getItem(ADS_KEY)) || {}; } catch { ads = {}; }
  if ($("#adsEnabled")) $("#adsEnabled").checked = !!ads.enabled;
  if ($("#admobApp")) $("#admobApp").value = ads.admobApp || "";
  if ($("#admobBanner")) $("#admobBanner").value = ads.admobBanner || "";
  if ($("#admobRewarded")) $("#admobRewarded").value = ads.admobRewarded || "";
  if ($("#adsWeb")) $("#adsWeb").value = ads.adsWeb || "";
}

function renderPlan() {
  if ($("#planSelect")) $("#planSelect").value = getPlan();
}

async function renderProjects() {
  const body = $("#projectsBody");
  if (!body) return;
  try {
    const stats = await getStats();
    const list = (stats.projects || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    body.innerHTML = list.length ? list.map((p) => {
      const clips = (p.tracks || []).reduce((n, t) => n + (t.clips?.length || 0), 0);
      const date = new Date(p.updatedAt || p.savedAt || Date.now()).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      return `<tr>
        <td>${escapeHtml(p.name || "Proyecto")}</td>
        <td>${escapeHtml(p.aspect || "9:16")}</td>
        <td>${clips}</td>
        <td>${escapeHtml(date)}</td>
        <td style="text-align:right"><button class="btn tiny danger" data-del-project="${p.id}">Eliminar</button></td>
      </tr>`;
    }).join("") : `<tr><td colspan="5" style="color:var(--muted)">Todavía no hay proyectos guardados.</td></tr>`;

    const info = $("#storageInfo");
    if (info) {
      info.textContent = stats.quota?.usage
        ? `Uso aproximado del navegador: ${bytes(stats.quota.usage)} de ${bytes(stats.quota.quota || 0)}.`
        : "El navegador no informa la cuota de almacenamiento.";
    }
  } catch (err) {
    console.error(err);
    body.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">No se pudieron cargar los proyectos.</td></tr>`;
  }
}

function renderSecurity() {
  if ($("#adminCodeNew")) $("#adminCodeNew").value = "";
}

/* ---------------- Acciones ---------------- */
function bind() {
  $("#gateBtn")?.addEventListener("click", login);
  $("#gateCode")?.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });

  $("#projectsBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-del-project]");
    if (!btn) return;
    const id = btn.dataset.delProject;
    const name = btn.closest("tr")?.querySelector("td")?.textContent || "el proyecto";
    if (!window.confirm(`¿Eliminar «${name}»? Los archivos multimedia se conservan.`)) return;
    await deleteProjectRecord(id);
    if (getLastProjectId() === id) setLastProjectId("");
    renderProjects();
    renderStats();
  });

  $("#logoutBtn")?.addEventListener("click", () => {
    try { sessionStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
    location.reload();
  });

  $("#savePrices")?.addEventListener("click", () => {
    const premium = Number($("#pricePremium").value);
    const pro = Number($("#pricePro").value);
    const annual = Number($("#priceAnnual").value);
    if (![premium, pro, annual].every((n) => Number.isFinite(n) && n >= 0)) {
      setStatus("#pricesStatus", "Introduce números válidos.", true);
      return;
    }
    setPrices({ premium, pro, annual });
    setStatus("#pricesStatus", "Precios guardados. Se aplican en el editor de inmediato.");
  });

  $("#applyPlan")?.addEventListener("click", () => {
    const plan = $("#planSelect").value;
    setPlan(plan);
    setStatus("#planStatus", "Plan aplicado en este navegador (demo, sin pago).");
    renderStats();
  });

  $("#saveAds")?.addEventListener("click", () => {
    const data = {
      enabled: !!$("#adsEnabled")?.checked,
      admobApp: $("#admobApp")?.value.trim() || "",
      admobBanner: $("#admobBanner")?.value.trim() || "",
      admobRewarded: $("#admobRewarded")?.value.trim() || "",
      adsWeb: $("#adsWeb")?.value.trim() || "",
      savedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(ADS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    setStatus("#adsStatus", "Configuración guardada. No se muestran anuncios hasta integrar el SDK.");
  });

  $("#saveAdminCode")?.addEventListener("click", () => {
    const code = $("#adminCodeNew")?.value.trim();
    if (!code || code.length < 4) {
      setStatus("#codeStatus", "Usa al menos 4 caracteres.", true);
      return;
    }
    setAdminCode(code);
    setStatus("#codeStatus", "Código actualizado. Se pedirá la próxima vez que entres.");
    $("#adminCodeNew").value = "";
  });

  $("#backupBtn")?.addEventListener("click", async () => {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `JC_VIDEO_PRO_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus("#storageInfo", "Copia descargada (sin archivos multimedia).");
  });

  $("#clearBtn")?.addEventListener("click", () => {
    const ok = window.confirm("Se borrarán TODOS los proyectos, archivos y ajustes de este navegador. ¿Continuar?");
    if (!ok) return;
    try {
      indexedDB.deleteDatabase("jcvp-db");
      Object.keys(localStorage).filter((k) => k.startsWith("jcvp.")).forEach((k) => localStorage.removeItem(k));
      sessionStorage.removeItem(AUTH_KEY);
    } catch (err) {
      console.error(err);
    }
    setTimeout(() => location.reload(), 350);
  });
}

function setStatus(sel, text, error = false) {
  const node = $(sel);
  if (!node) return;
  node.textContent = text;
  node.style.color = error ? "var(--danger)" : "var(--green)";
}

bind();
if (isAuthed()) showApp();
else $("#gateCode")?.focus();
