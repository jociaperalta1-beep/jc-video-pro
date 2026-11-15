/* ============================================================
   JC VIDEO PRO — Panel de administración con Supabase
   ============================================================ */

import { supabase, getCurrentUser, signInWithEmail, signInWithGoogle, signOutUser, getAdminData } from "./supabase.js";
import { $, $$, escapeHtml } from "./core.js";

const ADMIN_EMAIL = "soporte@jcads.net";

async function initAdmin() {
  const user = await getCurrentUser();
  if (user && user.email === ADMIN_EMAIL) {
    showWelcomeScreen(user);
  } else {
    showGate();
  }
  bindAdminEvents();
}

function showGate() {
  const gate = $("#gate");
  const welcome = $("#welcomeGate");
  const app = $("#adminApp");
  if (gate) gate.style.display = "grid";
  if (welcome) welcome.style.display = "none";
  if (app) app.hidden = true;
}

function showWelcomeScreen(user) {
  const gate = $("#gate");
  const welcome = $("#welcomeGate");
  const app = $("#adminApp");
  if (gate) gate.style.display = "none";
  if (welcome) welcome.style.display = "grid";
  if (app) app.hidden = true;
}

function showAdminApp() {
  const gate = $("#gate");
  const welcome = $("#welcomeGate");
  const app = $("#adminApp");
  if (gate) gate.style.display = "none";
  if (welcome) welcome.style.display = "none";
  if (app) app.hidden = false;
  loadSupabaseData();
}

function bindAdminEvents() {
  // Password eye toggle
  $("#adminEyeBtn")?.addEventListener("click", () => {
    const pwdInput = $("#adminPasswordInput");
    if (pwdInput) {
      pwdInput.type = pwdInput.type === "password" ? "text" : "password";
    }
  });

  $("#gateLoginBtn")?.addEventListener("click", async () => {
    const password = $("#adminPasswordInput")?.value || "";
    const errNode = $("#gateError");
    if (!password) {
      if (errNode) errNode.textContent = "Introduce la contraseña.";
      return;
    }
    if (errNode) errNode.textContent = "Iniciando sesión en Supabase…";
    try {
      const res = await signInWithEmail(ADMIN_EMAIL, password);
      const user = res.user;
      if (user?.email !== ADMIN_EMAIL) {
        throw new Error("Acceso denegado: solo soporte@jcads.net es administrador.");
      }
      showWelcomeScreen(user);
    } catch (err) {
      console.error(err);
      if (errNode) errNode.textContent = "Error: " + (err.message || "Credenciales inválidas.");
    }
  });

  $("#gateGoogleBtn")?.addEventListener("click", async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      const errNode = $("#gateError");
      if (errNode) errNode.textContent = "Error con Google: " + err.message;
    }
  });

  $("#goToAdminPanelBtn")?.addEventListener("click", () => {
    showAdminApp();
  });

  $("#goToPublicWebBtn")?.addEventListener("click", () => {
    window.location.href = "index.html?pro_preview=1";
  });

  $("#adminLogoutBtn")?.addEventListener("click", async () => {
    await signOutUser();
    location.reload();
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    await signOutUser();
    location.reload();
  });

  // Settings saves
  $("#savePrices")?.addEventListener("click", () => {
    const prices = {
      premium: Number($("#pricePremium").value),
      pro: Number($("#pricePro").value),
      annual: Number($("#priceAnnual").value),
    };
    try {
      localStorage.setItem("jcvp.prices", JSON.stringify(prices));
      setStatus("#pricesStatus", "Precios guardados correctamente.");
    } catch (err) {
      setStatus("#pricesStatus", "Error al guardar.", true);
    }
  });

  $("#saveMonetization")?.addEventListener("click", () => {
    const config = {
      tutorialVideoUrl: $("#tutorialVideoUrl")?.value.trim() || "",
      adsterraBanner: $("#adsterraBanner")?.value.trim() || "",
      adsterraDirectLink: $("#adsterraDirectLink")?.value.trim() || "",
      enabled: true,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem("jcvp.monetization", JSON.stringify(config));
      setStatus("#monetizationStatus", "Configuración guardada correctamente.");
    } catch (err) {
      setStatus("#monetizationStatus", "Error al guardar.", true);
    }
  });
}

async function loadSupabaseData() {
  const grid = $("#statsGrid");
  const usersBody = $("#usersBody");
  const ticketsBody = $("#ticketsBody");
  const paymentsBody = $("#paymentsBody");

  if (grid) grid.innerHTML = `<div class="stat-card"><div class="sc-label">Cargando Supabase…</div><div class="sc-value">…</div></div>`;

  const data = await getAdminData();
  const users = data.users || [];
  const payments = data.payments || [];
  const tickets = data.tickets || [];

  if (grid) {
    grid.innerHTML = [
      statCard("Usuarios", users.length, "registrados en profiles"),
      statCard("Tickets Soporte", tickets.length, "en support_tickets"),
      statCard("Pagos / Ventas", payments.length, "registrados"),
      statCard("Admin Activo", "soporte@jcads.net", "acceso verificado"),
    ].join("");
  }

  if (usersBody) {
    usersBody.innerHTML = users.length ? users.map((u) => `
      <tr>
        <td>${escapeHtml(u.id)}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td>${escapeHtml(u.plan || "Gratis")}</td>
        <td>${escapeHtml(new Date(u.updated_at || Date.now()).toLocaleString("es"))}</td>
      </tr>
    `).join("") : `<tr><td colspan="4" style="color:var(--muted)">No hay perfiles registrados en la tabla profiles aún.</td></tr>`;
  }

  if (ticketsBody) {
    ticketsBody.innerHTML = tickets.length ? tickets.map((t) => `
      <tr>
        <td>${escapeHtml(new Date(t.created_at || Date.now()).toLocaleString("es"))}</td>
        <td>${escapeHtml(t.user_email || "soporte@jcads.net")}</td>
        <td>${escapeHtml(t.message || "")}</td>
        <td><span style="color:var(--amber)">${escapeHtml(t.status || "pendiente")}</span></td>
      </tr>
    `).join("") : `<tr><td colspan="4" style="color:var(--muted)">No hay tickets de soporte pendientes.</td></tr>`;
  }

  if (paymentsBody) {
    paymentsBody.innerHTML = payments.length ? payments.map((p) => `
      <tr>
        <td>${escapeHtml(p.id || "—")}</td>
        <td>${escapeHtml(p.user_email || "—")}</td>
        <td>$${Number(p.amount || 0).toFixed(2)}</td>
        <td>${escapeHtml(p.plan || "Pro")}</td>
        <td>${escapeHtml(new Date(p.created_at || Date.now()).toLocaleString("es"))}</td>
      </tr>
    `).join("") : `<tr><td colspan="5" style="color:var(--muted)">No hay transacciones registradas en payments.</td></tr>`;
  }
}

function statCard(label, value, sub) {
  return `<div class="stat-card">
    <div class="sc-label">${escapeHtml(label)}</div>
    <div class="sc-value">${escapeHtml(String(value))}</div>
    <div class="sc-sub">${escapeHtml(sub)}</div>
  </div>`;
}

function setStatus(sel, text, error = false) {
  const node = $(sel);
  if (!node) return;
  node.textContent = text;
  node.style.color = error ? "var(--danger)" : "var(--green)";
}

// Check initial load
initAdmin();
