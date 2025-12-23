export const VAT_RATE = 0.1; // 공통 VAT 비율

export const EMAILJS_CONFIG = {
  serviceId: "service_8iw3ovj",
  templateId: "template_iaid1xl",
  publicKey: "dUvt2iF9ciN8bvf6r",
};

export const PACKING_SETTINGS = {
  packingPricePerKg: 400,
  basePackingPrice: 2000,
};

export function formatPrice(value) {
  return Number(value || 0).toLocaleString();
}

export function calcPackingCost(totalWeightKg) {
  if (totalWeightKg === 0) return 0;
  const { packingPricePerKg, basePackingPrice } = PACKING_SETTINGS;
  const raw = totalWeightKg * packingPricePerKg;
  return Math.max(Math.round(raw), basePackingPrice);
}

export function calcShippingCost(totalWeightKg) {
  if (totalWeightKg === 0) return 0;

  if (totalWeightKg <= 10) return 4000;
  if (totalWeightKg <= 20) return 6000;
  if (totalWeightKg <= 30) return 8000;
  return 8000 + Math.ceil((totalWeightKg - 30) / 10) * 3000;
}

export function initEmailJS() {
  if (typeof window === "undefined") return;
  if (window.emailjs && EMAILJS_CONFIG.publicKey) {
    window.emailjs.init({
      publicKey: EMAILJS_CONFIG.publicKey,
    });
  }
}

function resolveElement(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

function resetModalScroll(modal, bodySelector) {
  const body = bodySelector ? modal?.querySelector(bodySelector) : null;
  if (!body) return;
  body.scrollTop = 0;
  if (typeof body.scrollTo === "function") {
    body.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
  requestAnimationFrame(() => {
    body.scrollTop = 0;
  });
  setTimeout(() => {
    body.scrollTop = 0;
  }, 0);
}

export function openModal(modal, { focusTarget = null, bodySelector = ".modal-body", resetScroll = true } = {}) {
  if (typeof document === "undefined") return;
  document.activeElement?.blur();
  const modalEl = resolveElement(modal);
  modalEl?.classList.remove("hidden");
  const focusEl = resolveElement(focusTarget);
  focusEl?.focus();
  if (resetScroll) resetModalScroll(modalEl, bodySelector);
}

export function closeModal(modal, { bodySelector = ".modal-body", resetScroll = true } = {}) {
  if (typeof document === "undefined") return;
  document.activeElement?.blur();
  const modalEl = resolveElement(modal);
  if (resetScroll) resetModalScroll(modalEl, bodySelector);
  modalEl?.classList.add("hidden");
}

export function getCustomerInfo({
  nameSelector = "#customerName",
  phoneSelector = "#customerPhone",
  emailSelector = "#customerEmail",
  memoSelector = "#customerMemo",
} = {}) {
  return {
    name: document.querySelector(nameSelector)?.value.trim() || "",
    phone: document.querySelector(phoneSelector)?.value.trim() || "",
    email: document.querySelector(emailSelector)?.value.trim() || "",
    memo: document.querySelector(memoSelector)?.value.trim() || "",
  };
}

export function validateCustomerInfo(customer) {
  if (!customer?.name || !customer?.phone || !customer?.email) {
    return "이름, 연락처, 이메일을 입력해주세요.";
  }
  return "";
}

export function isConsentChecked(selector = "#privacyConsent") {
  const el = document.querySelector(selector);
  return el ? el.checked : true;
}

export function updateSendButtonEnabled({
  buttonSelector = "#sendQuoteBtn",
  customer = getCustomerInfo(),
  hasItems = false,
  onFinalStep = false,
  hasConsent = isConsentChecked(),
  sending = false,
} = {}) {
  const btn = document.querySelector(buttonSelector);
  if (!btn) return;
  const hasRequired = Boolean(customer.name && customer.phone && customer.email);
  btn.disabled = !(hasRequired && hasItems && onFinalStep && hasConsent) || sending;
}

export function getEmailJSInstance(showInfoModal) {
  if (!EMAILJS_CONFIG.serviceId || !EMAILJS_CONFIG.templateId || !EMAILJS_CONFIG.publicKey) {
    showInfoModal?.("EmailJS 설정(서비스ID/템플릿ID/publicKey)을 입력해주세요.");
    return null;
  }
  const emailjsInstance = typeof window !== "undefined" ? window.emailjs : null;
  if (!emailjsInstance) {
    showInfoModal?.("EmailJS 스크립트가 로드되지 않았습니다.");
    return null;
  }
  return emailjsInstance;
}
