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

export const DEFAULT_CUSTOMER_FIELDS = {
  name: "#customerName",
  phone: "#customerPhone",
  email: "#customerEmail",
  memo: "#customerMemo",
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

export function readCustomerInfo(fields = DEFAULT_CUSTOMER_FIELDS) {
  if (typeof document === "undefined") {
    return { name: "", phone: "", email: "", memo: "" };
  }
  const getVal = (sel) => document.querySelector(sel)?.value?.trim() || "";
  return {
    name: getVal(fields.name),
    phone: getVal(fields.phone),
    email: getVal(fields.email),
    memo: getVal(fields.memo),
  };
}

export function hasRequiredCustomerInfo(customer) {
  return Boolean(customer?.name && customer?.phone && customer?.email);
}

export function isConsentGiven(consentSelector = "#privacyConsent") {
  if (typeof document === "undefined") return true;
  const el = document.querySelector(consentSelector);
  if (!el) return true;
  return !!el.checked;
}

export function resetConsent(consentSelector = "#privacyConsent") {
  if (typeof document === "undefined") return;
  const el = document.querySelector(consentSelector);
  if (el) el.checked = false;
}

export function computeSendEnabled({
  customer,
  hasItems,
  onFinalStep,
  sending,
  consentSelector = "#privacyConsent",
}) {
  const hasConsent = isConsentGiven(consentSelector);
  return hasRequiredCustomerInfo(customer) && hasItems && onFinalStep && hasConsent && !sending;
}

export function initEmailJS() {
  if (typeof window === "undefined") return;
  if (window.emailjs && EMAILJS_CONFIG.publicKey) {
    window.emailjs.init({
      publicKey: EMAILJS_CONFIG.publicKey,
    });
  }
}
