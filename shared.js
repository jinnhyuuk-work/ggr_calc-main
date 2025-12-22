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

const IFRAME_MESSAGE_TYPE = "GGR_IFRAME_SIZE";
const PARENT_ORIGIN = "https://ggr.kr";

function calcDocHeight() {
  const de = document.documentElement;
  const b = document.body;
  return Math.max(
    de.scrollHeight, de.offsetHeight,
    b ? b.scrollHeight : 0,
    b ? b.offsetHeight : 0
  );
}

function createHeightSender() {
  let lastHeight = 0;
  let scheduled = false;

  const sendHeight = () => {
    scheduled = false;
    const height = calcDocHeight();
    if (height === lastHeight) return;
    lastHeight = height;
    window.parent?.postMessage(
      { type: IFRAME_MESSAGE_TYPE, height },
      PARENT_ORIGIN
    );
  };

  return () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sendHeight);
  };
}

if (typeof window !== "undefined") {
  const scheduleSendHeight = createHeightSender();

  window.addEventListener("load", scheduleSendHeight);
  window.addEventListener("resize", scheduleSendHeight);

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => scheduleSendHeight());
    ro.observe(document.documentElement);
  }

  setTimeout(scheduleSendHeight, 300);
  setTimeout(scheduleSendHeight, 1000);
}
