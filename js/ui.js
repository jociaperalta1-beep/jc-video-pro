/* ============================================================
   JC VIDEO PRO — Utilidades de interfaz (modales, avisos)
   ============================================================ */

import { $ } from "./core.js";

let pendingConfirm = null;
let lastFocus = null;

export function openModal(html, { wide = false, locked = false } = {}) {
  const backdrop = $("#modalBackdrop");
  const modal = $("#modal");
  if (!backdrop || !modal) return;
  backdrop.hidden = false;
  backdrop.dataset.locked = locked ? "1" : "";
  modal.className = "modal" + (wide ? " wide" : "");
  modal.innerHTML = (locked ? "" : `<button class="modal-close" data-close aria-label="Cerrar">✕</button>`) + html;
  lastFocus = document.activeElement;
  setTimeout(() => {
    const first = modal.querySelector("input:not([type=hidden]), select, textarea, button:not([data-close])");
    first?.focus?.({ preventScroll: true });
  }, 40);
}

export function closeModal(force = false) {
  const backdrop = $("#modalBackdrop");
  if (!backdrop || backdrop.hidden) return;
  if (backdrop.dataset.locked === "1" && !force) return;
  backdrop.hidden = true;
  backdrop.dataset.locked = "";
  const modal = $("#modal");
  if (modal) { modal.className = "modal"; modal.innerHTML = ""; }
  if (pendingConfirm) {
    const resolve = pendingConfirm;
    pendingConfirm = null;
    resolve(false);
  }
  try { lastFocus?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
}

export function isModalOpen() {
  const backdrop = $("#modalBackdrop");
  return !!backdrop && !backdrop.hidden;
}

export function bindModal() {
  const backdrop = $("#modalBackdrop");
  if (!backdrop) return;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

export function toast(message, type = "", ms = 3400) {
  const wrap = $("#toasts");
  if (!wrap) return;
  const node = document.createElement("div");
  node.className = "toast " + type;
  node.textContent = message;
  wrap.appendChild(node);
  while (wrap.children.length > 5) wrap.firstElementChild.remove();
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transition = "opacity .25s";
    setTimeout(() => node.remove(), 280);
  }, ms);
}

export function confirmAction({
  title = "Confirmar",
  message = "",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    openModal(`
      <h2>${title}</h2>
      <p class="modal-sub">${message}</p>
      <div class="modal-actions">
        <button class="btn ghost" data-result="no">${cancelText}</button>
        <button class="btn ${danger ? "danger" : "primary"}" data-result="yes">${confirmText}</button>
      </div>`);
    pendingConfirm = resolve;
    const modal = $("#modal");
    const onClick = (e) => {
      const btn = e.target.closest("[data-result]");
      if (!btn) return;
      modal.removeEventListener("click", onClick);
      const yes = btn.dataset.result === "yes";
      pendingConfirm = null;
      closeModal(true);
      resolve(yes);
    };
    modal.addEventListener("click", onClick);
  });
}
