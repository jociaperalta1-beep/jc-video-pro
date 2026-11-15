/* ============================================================
   JC VIDEO PRO — Planes, pagos configurados y estado Premium
   ============================================================ */

import { $, emit, on, getPlan, setPlan, getPrices, isPremium, escapeHtml } from "./core.js";
import {
  getMonetization, getPaymentUrl, getPaymentMethod, whatsappUrl,
  rewardActive, rewardMinutesLeft,
} from "./monetization.js";
import { openModal, closeModal, toast } from "./ui.js";

const PLAN_NAMES = { free: "Gratis", premium: "Premium", pro: "Profesional" };

export function initPremium() {
  $("#premiumRibbonOff")?.addEventListener("click", () => {
    setPlan("free");
    emit("project");
    toast("Modo Premium desactivado. Se vuelve a mostrar la marca de agua.", "");
  });
  $("#btnPremium")?.addEventListener("click", openPremiumModal);
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-premium]")) openPremiumModal();
  });
  on("premium", updateRibbon);
  updateRibbon();
}

export function updateRibbon() {
  const ribbon = $("#premiumRibbon");
  if (!ribbon) return;
  const plan = getPlan();
  ribbon.hidden = plan === "free";
  const label = ribbon.querySelector("span");
  if (label) label.textContent = `✦ Plan ${PLAN_NAMES[plan] || "Premium"} activo (local)`;
}

function payButton(plan, label, currentPlan) {
  const disabled = currentPlan === plan ? "disabled" : "";
  return `<button class="btn primary wide" style="margin-top:10px" data-pay="${plan}" ${disabled}>
    ${currentPlan === plan ? "Plan actual" : label}
  </button>`;
}

export function openPremiumModal() {
  const prices = getPrices();
  const plan = getPlan();
  const money = getMonetization();
  const method = getPaymentMethod();
  const reward = rewardActive() ? `Tienes un desbloqueo por anuncio activo: ${rewardMinutesLeft()} min sin marca de agua.` : "";
  const manual = !!(money.bankDetails || money.walletDetails || money.whatsapp);

  openModal(`
    <h2>Hazte Premium</h2>
    <p class="modal-sub">Elige un plan y paga en el proveedor configurado. Los precios se pueden editar desde el panel de administración.</p>

    <div class="plan-grid">
      <div class="plan-card">
        <h3>Gratis</h3>
        <div class="plan-price">US$0 <small>/ siempre</small></div>
        <ul>
          <li>Editor completo</li>
          <li>Exportación 720p y 1080p</li>
          <li>Marca de agua JC VIDEO PRO</li>
          <li>Filtros base y velocidad hasta 2×</li>
        </ul>
        ${plan !== "free" ? `<button class="btn ghost wide" style="margin-top:10px" data-plan="free">Volver a Gratis</button>` : ""}
      </div>

      <div class="plan-card featured">
        <span class="plan-tag">POPULAR</span>
        <h3>Premium</h3>
        <div class="plan-price">US$${prices.premium.toFixed(2)} <small>/ mes</small></div>
        <ul>
          <li>Sin marca de agua</li>
          <li>Exportación hasta 4K</li>
          <li>Filtros Neón, Cyber y Sueño</li>
          <li>Velocidad hasta 4×</li>
          <li>Más capacidad de proyectos</li>
        </ul>
        ${payButton("premium", "Pagar Premium", plan)}
        ${plan === "premium" ? "" : `<button class="btn tiny ghost wide" style="margin-top:6px" data-plan="premium">Activar demo local</button>`}
      </div>

      <div class="plan-card">
        <h3>Profesional</h3>
        <div class="plan-price">US$${prices.pro.toFixed(2)} <small>/ mes</small></div>
        <ul>
          <li>Todo lo de Premium</li>
          <li>Acceso anticipado a funciones IA</li>
          <li>Soporte prioritario</li>
          <li>Anual: US$${prices.annual.toFixed(2)} (2 meses gratis)</li>
        </ul>
        ${payButton("pro", "Pagar Profesional", plan)}
        <button class="btn ghost wide" style="margin-top:6px" data-pay="annual">Pagar plan anual (US$${prices.annual.toFixed(2)})</button>
        ${plan === "pro" ? "" : `<button class="btn tiny ghost wide" style="margin-top:6px" data-plan="pro">Activar demo local</button>`}
      </div>
    </div>

    ${method ? `<p class="mini-help">Método de pago mostrado por el administrador: <b>${escapeHtml(method)}</b>.</p>` : ""}

    ${manual ? `
      <div class="pay-manual">
        <h3>Transferencia o pago manual</h3>
        ${money.bankDetails ? `<div class="pay-detail"><b>Datos bancarios / alias:</b><span>${escapeHtml(money.bankDetails)}</span></div>` : ""}
        ${money.walletDetails ? `<div class="pay-detail"><b>Billetera / Binance Pay:</b><span>${escapeHtml(money.walletDetails)}</span></div>` : ""}
        ${money.whatsapp ? `<button class="btn primary" data-whatsapp>Enviar comprobante por WhatsApp</button>` : ""}
      </div>` : ""}

    <p class="premium-note">
      <b>Pago y activación:</b> al pulsar un botón de pago se abrirá el enlace real configurado en el panel de administración.
      Este editor no verifica pagos automáticamente: después de pagar, envía el comprobante por WhatsApp para que el administrador active tu plan.
      ${reward ? `<br>${escapeHtml(reward)}` : ""}
      Los botones «demo local» solo cambian el plan en este navegador y no cobran nada; son para pruebas.
    </p>
  `, { wide: true });

  const modal = $("#modal");
  const onClick = (e) => {
    const payBtn = e.target.closest("[data-pay]");
    if (payBtn && !payBtn.disabled) {
      const key = payBtn.dataset.pay;
      const url = getPaymentUrl(key);
      if (!url) {
        toast("El administrador aún no configuró este enlace de pago. Puedes usar transferencia o WhatsApp.", "err", 6000);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      toast("Pago abierto en otra pestaña. Al completarlo, envía el comprobante por WhatsApp.", "ok", 7000);
      return;
    }

    const waBtn = e.target.closest("[data-whatsapp]");
    if (waBtn) {
      const url = whatsappUrl(money.whatsapp, `Hola, quiero contratar JC VIDEO PRO. Ya realicé o quiero realizar el pago del plan. Mi comprobante es:`);
      if (!url) { toast("El administrador no configuró un número de WhatsApp.", "err"); return; }
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const btn = e.target.closest("[data-plan]");
    if (!btn || btn.disabled) return;
    const next = btn.dataset.plan;
    setPlan(next);
    modal.removeEventListener("click", onClick);
    closeModal(true);
    emit("project");
    emit("selection");
    toast(next === "free" ? "Plan Gratis activo." : `Plan ${PLAN_NAMES[next]} activo en este navegador (demo).`, "ok");
  };
  modal.addEventListener("click", onClick);
}
