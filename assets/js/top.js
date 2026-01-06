import {
  EMAILJS_CONFIG,
  initEmailJS,
  openModal,
  closeModal,
  getCustomerInfo,
  validateCustomerInfo,
  updateSendButtonEnabled as updateSendButtonEnabledShared,
  isConsentChecked,
  getEmailJSInstance,
  updateSizeErrors,
  renderEstimateTable,
  createServiceModalController,
  renderSelectedCard,
  renderSelectedAddonChips,
  updateServiceSummaryChip,
  buildEstimateDetailLines,
} from "./shared.js";
import { TOP_PROCESSING_SERVICES, TOP_TYPES, TOP_OPTIONS, TOP_ADDON_ITEMS } from "./data/top-data.js";

class BaseService {
  constructor(cfg) {
    this.id = cfg.id;
    this.label = cfg.label;
    this.type = cfg.type || "simple";
    this.pricePerHole = cfg.pricePerHole;
    this.pricePerMeter = cfg.pricePerMeter;
    this.pricePerCorner = cfg.pricePerCorner;
    this.swatch = cfg.swatch;
    this.description = cfg.description;
  }
  hasDetail() {
    return this.type === "detail";
  }
  defaultDetail() {
    return null;
  }
  normalizeDetail(detail) {
    return detail || this.defaultDetail();
  }
  validateDetail(detail) {
    return { ok: true, detail: this.normalizeDetail(detail), message: "" };
  }
  getCount(detail) {
    return 1;
  }
  formatDetail(detail, { includeNote = false } = {}) {
    if (!this.hasDetail()) return "세부 설정 없음";
    const note = includeNote && detail?.note ? ` (메모: ${detail.note})` : "";
    return `세부 옵션 저장됨${note}`;
  }
  calcProcessingCost(quantity, detail) {
    let unitCost = 0;
    if (this.pricePerHole) {
      unitCost = this.pricePerHole * this.getCount(detail);
    } else if (this.pricePerMeter) {
      unitCost = this.pricePerMeter;
    } else if (this.pricePerCorner) {
      unitCost = this.pricePerCorner;
    }
    return unitCost * quantity;
  }
}

function formatHoleDetail(detail, { includeNote = false, short = false } = {}) {
  if (!detail) return short ? "세부 옵션을 설정해주세요." : "세부 옵션 미입력";
  const holes = Array.isArray(detail.holes) ? detail.holes : [];
  if (holes.length === 0) {
    return short ? "세부 옵션을 설정해주세요." : "세부 옵션 미입력";
  }
  const count = holes.length || detail.count || 0;
  const positions = holes
    .filter((h) => h && (h.distance || h.verticalDistance))
    .map((h) => {
      const edgeLabel = h.edge === "right" ? "우" : "좌";
      const verticalLabel = h.verticalRef === "bottom" ? "하" : "상";
      const vert = h.verticalDistance ? `${verticalLabel} ${h.verticalDistance}mm` : "";
      const horiz = h.distance ? `${edgeLabel} ${h.distance}mm` : "";
      return [horiz, vert].filter(Boolean).join(" / ");
    })
    .join(", ");
  const noteText = includeNote && detail.note ? ` · 메모: ${detail.note}` : "";
  const suffix = positions ? ` · ${positions}` : "";
  return `${count}개${suffix}${noteText}`;
}

class HoleService extends BaseService {
  constructor(cfg) {
    super({ ...cfg, type: "detail" });
  }
  defaultDetail() {
    return { holes: [], note: "" };
  }
  normalizeDetail(detail) {
    if (!detail || !Array.isArray(detail.holes)) return this.defaultDetail();
    const holes = detail.holes;
    return {
      holes: holes.map((h) => ({
        edge: h.edge === "right" ? "right" : "left",
        distance: Number(h.distance),
        verticalRef: h.verticalRef === "bottom" ? "bottom" : "top",
        verticalDistance: Number(h.verticalDistance),
      })),
      note: detail.note || "",
    };
  }
  validateDetail(detail) {
    const normalized = this.normalizeDetail(detail);
    const validHoles = (normalized.holes || []).filter(
      (h) =>
        h &&
        Number.isFinite(Number(h.distance)) &&
        Number(h.distance) > 0 &&
        Number.isFinite(Number(h.verticalDistance)) &&
        Number(h.verticalDistance) > 0
    );
    if (validHoles.length === 0) {
      return {
        ok: false,
        message: `${this.label}의 가로·세로 위치를 1개 이상 입력해주세요.`,
        detail: normalized,
      };
    }
    return {
      ok: true,
      detail: {
        holes: validHoles,
        note: normalized.note?.trim() || "",
      },
      message: "",
    };
  }
  getCount(detail) {
    const normalized = this.normalizeDetail(detail);
    const holes = Array.isArray(normalized.holes) ? normalized.holes.length : 0;
    const fallback = normalized.count || 0;
    return Math.max(0, holes || fallback || 0);
  }
  formatDetail(detail, { includeNote = false, short = false } = {}) {
    return formatHoleDetail(detail, { includeNote, short });
  }
}

function buildServiceModels(configs) {
  const models = {};
  Object.values(configs).forEach((cfg) => {
    if (cfg.type === "detail" || cfg.pricePerHole) {
      models[cfg.id] = new HoleService(cfg);
    } else {
      models[cfg.id] = new BaseService(cfg);
    }
  });
  return models;
}

const SERVICES = buildServiceModels(TOP_PROCESSING_SERVICES);

function cloneServiceDetails(details) {
  return JSON.parse(JSON.stringify(details || {}));
}

function getDefaultServiceDetail(serviceId) {
  const srv = SERVICES[serviceId];
  if (!srv) return { note: "" };
  if (srv.hasDetail()) return { holes: [], note: "" };
  return cloneServiceDetails(srv.defaultDetail ? srv.defaultDetail() : { note: "" });
}

function calcServiceProcessingCost({ services = [], serviceDetails = {}, quantity = 1 }) {
  let processingCost = 0;
  services.forEach((id) => {
    const srv = SERVICES[id];
    if (!srv) return;
    const detail = serviceDetails?.[id];
    processingCost += srv.calcProcessingCost(quantity, detail);
  });
  return { processingCost };
}

function formatServiceDetail(serviceId, detail, { includeNote = false } = {}) {
  const srv = SERVICES[serviceId];
  const name = srv?.label || serviceId;
  if (!srv) return name;
  if (!srv.hasDetail()) return name;
  return `${name} (${srv.formatDetail(detail, { includeNote })})`;
}

function formatServiceList(services, serviceDetails = {}, opts = {}) {
  if (!services || services.length === 0) return "-";
  return services
    .map((id) => formatServiceDetail(id, serviceDetails[id], opts))
    .filter(Boolean)
    .join(", ");
}

function formatServiceSummaryText(serviceId, detail) {
  const srv = SERVICES[serviceId];
  if (!srv) return "세부 옵션을 설정해주세요.";
  if (!srv.hasDetail()) return "세부 옵션 없음";
  const formatted = srv.formatDetail(detail, { short: true });
  return formatted || "세부 옵션을 설정해주세요.";
}

let selectedTopType = "";
const TOP_CATEGORIES = Array.from(new Set(TOP_TYPES.map((t) => t.category || "기타")));
let selectedTopCategory = TOP_CATEGORIES[0] || "기타";
let currentPhase = 1; // 1: 상판/가공, 2: 부자재, 3: 고객정보
const state = { items: [], serviceDetails: {}, addons: [] };
let sendingEmail = false;
let orderCompleted = false;
const DEFAULT_TOP_THICKNESSES = [12, 24, 30, 40, 50];
const TOP_CUSTOM_WIDTH_MAX = 800;
const TOP_CUSTOM_LENGTH_MAX = 3000;
const TOP_CATEGORY_DESC = {
  인조대리석: "가성비 좋은 기본 상판 소재입니다.",
  하이막스: "내구성과 균일한 표면감이 장점인 프리미엄 상판입니다.",
};

function getPreviewDimensions(width, length, maxPx = 160, minPx = 40) {
  if (!width || !length) return { w: 120, h: 120 };
  const scale = Math.min(maxPx / Math.max(width, length), 1);
  return {
    w: Math.max(minPx, width * scale),
    h: Math.max(minPx, length * scale),
  };
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatPrice(n) {
  return Number(n || 0).toLocaleString();
}

function descriptionHTML(desc) {
  return desc ? `<div class="description">${desc}</div>` : "";
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readTopInputs() {
  const typeId = selectedTopType;
  const shape = $("#kitchenShape")?.value || "";
  const width = Number($("#topWidth")?.value || 0);
  const length = Number($("#topLength")?.value || 0);
  const length2 = Number($("#topLength2")?.value || 0);
  const thickness = Number($("#topThickness")?.value || 0);
  const options = Array.from(document.querySelectorAll("#topOptionCards input:checked")).map(
    (el) => el.value
  );
  const services = Array.from(document.querySelectorAll("#topServiceCards input:checked")).map(
    (el) => el.value
  );
  const serviceDetails = cloneServiceDetails(state.serviceDetails);
  return { typeId, shape, width, length, length2, thickness, options, services, serviceDetails };
}

function validateTopInputs({ typeId, shape, width, length, length2, thickness }) {
  if (!typeId) return "상판 타입을 선택해주세요.";
  if (!shape) return "주방 형태를 선택해주세요.";
  if (!width) return "폭을 입력해주세요.";
  if (!length) return "길이를 입력해주세요.";
  const needsSecond = shape === "l" || shape === "rl";
  if (needsSecond && !length2) return "ㄱ자 형태일 때 길이2를 입력해주세요.";
  if (!thickness) return "두께를 입력해주세요.";
  const type = TOP_TYPES.find((t) => t.id === typeId);
  if (type?.minWidth && width < type.minWidth) return `폭은 최소 ${type.minWidth}mm 입니다.`;
  if (type?.minLength && length < type.minLength) return `길이는 최소 ${type.minLength}mm 입니다.`;
  if (needsSecond) {
    if (type?.minLength && length2 < type.minLength) return `길이2는 최소 ${type.minLength}mm 입니다.`;
  }
  return null;
}

function isTopCustomSize({ width, length, length2 = 0, shape }) {
  if (width > TOP_CUSTOM_WIDTH_MAX) return true;
  if (length > TOP_CUSTOM_LENGTH_MAX) return true;
  const needsSecond = shape === "l" || shape === "rl";
  if (needsSecond && length2 > TOP_CUSTOM_LENGTH_MAX) return true;
  return false;
}

function calcTopDetail(input) {
  const { typeId, shape, width, length, length2, thickness, options, services = [], serviceDetails = {} } = input;
  const type = TOP_TYPES.find((t) => t.id === typeId);
  const err = validateTopInputs(input);
  if (!type || err) return { error: err || "필수 정보를 입력해주세요." };

  const isCustomPrice = isTopCustomSize({ width, length, length2, shape });

  const needsSecond = shape === "l" || shape === "rl";
  const areaM2 =
    needsSecond
      ? (width / 1000) * (length / 1000) + (width / 1000) * (length2 / 1000)
      : (width / 1000) * (length / 1000);
  const base = type.basePrice + areaM2 * 120000;
  const optionPrice = options.reduce((sum, id) => {
    const opt = TOP_OPTIONS.find((o) => o.id === id);
    return sum + (opt?.price || 0);
  }, 0);
  const { processingCost: serviceProcessingCost } = calcServiceProcessingCost({
    services,
    serviceDetails,
    quantity: 1,
  });
  const shapeFee = needsSecond ? 30000 : 0;
  const processingCost = optionPrice + shapeFee + serviceProcessingCost;
  const materialCost = isCustomPrice ? 0 : base + processingCost;
  const appliedProcessingCost = isCustomPrice ? 0 : processingCost;
  const subtotal = materialCost;
  const vat = 0;
  const total = Math.round(subtotal);

  return {
    materialCost,
    processingCost,
    subtotal,
    vat,
    total,
    displaySize:
      needsSecond
        ? `${width}×${length} / ${width}×${length2}×${thickness}mm`
        : `${width}×${length}×${thickness}mm`,
    optionsLabel:
      options.length === 0
        ? "-"
        : options
            .map((id) => TOP_OPTIONS.find((o) => o.id === id)?.name || id)
            .join(", "),
    servicesLabel: formatServiceList(services, serviceDetails, { includeNote: true }),
    serviceDetails,
    services,
    isCustomPrice,
    processingCost: appliedProcessingCost,
  };
}

function calcAddonDetail(price) {
  const subtotal = price;
  const vat = 0;
  const total = subtotal;
  return {
    materialCost: price,
    processingCost: 0,
    subtotal,
    vat,
    total,
  };
}

function updateSelectedTopTypeCard() {
  const type = TOP_TYPES.find((t) => t.id === selectedTopType);
  renderSelectedCard({
    cardId: "#selectedTopTypeCard",
    emptyTitle: "선택된 상판 없음",
    emptyMeta: "상판을 선택해주세요.",
    swatch: type?.swatch,
    name: type ? escapeHtml(type.name) : "",
    metaLines: type ? [`기본가 ${formatPrice(type.basePrice)}원`] : [],
  });
}

function updateTopThicknessOptions(typeId) {
  const select = $("#topThickness");
  if (!select) return;
  const type = TOP_TYPES.find((t) => t.id === typeId);
  const options = type?.availableThickness?.length ? type.availableThickness : DEFAULT_TOP_THICKNESSES;
  const current = select.value;
  select.innerHTML = `<option value="">두께를 선택해주세요</option>`;
  options.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = String(t);
    opt.textContent = `${t}T`;
    select.appendChild(opt);
  });
  if (options.map(String).includes(current)) {
    select.value = current;
  } else {
    select.value = "";
  }
}

function updateTopSizePlaceholders(typeId) {
  const widthEl = $("#topWidth");
  const lengthEl = $("#topLength");
  const length2El = $("#topLength2");
  if (!widthEl || !lengthEl) return;
  const type = TOP_TYPES.find((t) => t.id === typeId);
  if (!type?.minWidth || !type?.maxWidth || !type?.minLength || !type?.maxLength) {
    widthEl.placeholder = "예: 650";
    lengthEl.placeholder = "예: 2400";
    if (length2El) length2El.placeholder = "예: 1800 (ㄱ자 추가 변)";
    return;
  }
  widthEl.placeholder = `폭 ${type.minWidth}~${type.maxWidth}mm`;
  lengthEl.placeholder = `길이 ${type.minLength}~${type.maxLength}mm`;
  if (length2El) length2El.placeholder = `길이2 ${type.minLength}~${type.maxLength}mm`;
}

function renderTopTypeTabs() {
  const tabs = $("#topTypeTabs");
  if (!tabs) return;
  tabs.innerHTML = "";
  TOP_CATEGORIES.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `material-tab${cat === selectedTopCategory ? " active" : ""}`;
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      selectedTopCategory = cat;
      // 다른 카테고리에 선택된 타입이 있으면 해제
      const inCategory = TOP_TYPES.some((t) => t.id === selectedTopType && (t.category || "기타") === cat);
      if (!inCategory) selectedTopType = "";
      renderTopTypeTabs();
      renderTopTypeCards();
      updateSelectedTopTypeCard();
      updateTopThicknessOptions(selectedTopType);
      updateTopSizePlaceholders(selectedTopType);
      renderTopCategoryDesc();
      refreshTopEstimate();
    });
    tabs.appendChild(btn);
  });
}

function renderTopCategoryDesc() {
  const descEl = $("#topTypeCategoryDesc");
  const titleEl = $("#topTypeCategoryName");
  if (!descEl || !titleEl) return;
  titleEl.textContent = selectedTopCategory || "";
  descEl.textContent = TOP_CATEGORY_DESC[selectedTopCategory] || "";
}

function renderTopTypeCards() {
  const container = $("#topTypeCards");
  if (!container) return;
  container.innerHTML = "";
  const list = TOP_TYPES.filter((t) => (t.category || "기타") === selectedTopCategory);
  list.forEach((t) => {
    const thicknessText = (t.availableThickness || DEFAULT_TOP_THICKNESSES)
      .map((v) => `${v}T`)
      .join(", ");
    const label = document.createElement("label");
    label.className = `card-base material-card${selectedTopType === t.id ? " selected" : ""}`;
    label.innerHTML = `
      <input type="radio" name="topType" value="${t.id}" ${selectedTopType === t.id ? "checked" : ""} />
      <div class="material-visual" style="background: ${t.swatch || "#ddd"}"></div>
      <div class="name">${t.name}</div>
      <div class="price">㎡당 ${formatPrice(t.basePrice)}원</div>
      <div class="size">가능 두께: ${thicknessText}</div>
      <div class="size">폭 ${t.minWidth}~${t.maxWidth}mm / 길이 ${t.minLength}~${t.maxLength}mm</div>
      ${descriptionHTML(t.description)}
    `;
    container.appendChild(label);
  });
  container.onclick = (e) => {
    const input = e.target.closest('input[name="topType"]');
    if (!input) return;
    selectedTopType = input.value;
    updateSelectedTopTypeCard();
    renderTopTypeCards();
    closeTopTypeModal();
    updateTopThicknessOptions(selectedTopType);
    updateTopSizePlaceholders(selectedTopType);
    refreshTopEstimate();
  };
}

function renderOptions() {
  const container = $("#topOptionCards");
  if (!container) return;
  container.innerHTML = "";
  TOP_OPTIONS.forEach((opt) => {
    const label = document.createElement("label");
    label.className = "card-base option-card";
    label.innerHTML = `
      <input type="checkbox" value="${opt.id}" />
      <div class="material-visual"></div>
      <div class="name">${opt.name}</div>
      <div class="price">+${formatPrice(opt.price)}원</div>
      ${descriptionHTML(opt.description)}
    `;
    container.appendChild(label);
  });
  // 초기 선택 상태 반영
  container.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.closest(".option-card")?.classList.toggle("selected", input.checked);
  });
  updateOptionHeaderSummary();
  container.addEventListener("change", (e) => {
    const input = e.target.closest("input[type='checkbox']");
    if (!input) return;
    input.closest(".option-card")?.classList.toggle("selected", input.checked);
    updateOptionHeaderSummary();
    refreshTopEstimate();
  });
}

function renderTopAddonCards() {
  const container = $("#topAddonCards");
  if (!container) return;
  container.innerHTML = "";

  TOP_ADDON_ITEMS.forEach((item) => {
    const label = document.createElement("label");
    label.className = `card-base addon-card${
      state.addons.includes(item.id) ? " selected" : ""
    }`;
    label.innerHTML = `
      <input type="checkbox" value="${item.id}" ${state.addons.includes(item.id) ? "checked" : ""} />
      <div class="material-visual"></div>
      <div class="name">${item.name}</div>
      <div class="price">${formatPrice(item.price)}원</div>
      ${descriptionHTML(item.description)}
    `;
    container.appendChild(label);
  });

  container.onchange = (e) => {
    const input = e.target.closest('input[type="checkbox"]');
    if (!input) return;
    const id = input.value;
    if (input.checked) {
      if (!state.addons.includes(id)) state.addons.push(id);
    } else {
      state.addons = state.addons.filter((x) => x !== id);
    }
    updateSelectedTopAddonsDisplay();
    $$("#topAddonCards .addon-card").forEach((card) => card.classList.remove("selected"));
    state.addons.forEach((id) => {
      const card = container.querySelector(`input[value="${id}"]`)?.closest(".addon-card");
      card?.classList.add("selected");
    });
  };
}

function updateSelectedTopAddonsDisplay() {
  renderSelectedAddonChips({
    targetId: "selectedTopAddonCard",
    addons: state.addons,
    allItems: TOP_ADDON_ITEMS,
    formatPrice,
  });
}

function updateServiceSummary(serviceId) {
  updateServiceSummaryChip({
    serviceId,
    services: SERVICES,
    serviceDetails: state.serviceDetails,
    formatSummaryText: formatServiceSummaryText,
  });
  updatePreviewSummary();
}

function updateOptionHeaderSummary() {
  const previewEl = $("#previewOptionSummary");
  if (!previewEl) return;
  const count = document.querySelectorAll("#topOptionCards input:checked").length;
  const text = count ? `옵션 ${count}개 선택` : "옵션 선택 없음";
  if (previewEl) previewEl.textContent = text;
}

function updateServiceHeaderSummary() {
  const previewEl = $("#previewServiceSummary");
  if (!previewEl) return;
  const count = document.querySelectorAll('input[name="service"]:checked').length;
  const text = count ? `가공 ${count}개 선택` : "가공 선택 없음";
  if (previewEl) previewEl.textContent = text;
}

function updatePreviewSummary() {
  updateOptionHeaderSummary();
  updateServiceHeaderSummary();
}

function initCollapsibleSections() {
  document.querySelectorAll(".step-toggle").forEach((btn) => {
    const targetId = btn.dataset.toggleTarget;
    const section = targetId ? document.getElementById(targetId) : null;
    if (!section) return;
    const isCollapsed = section.classList.contains("is-collapsed");
    btn.textContent = isCollapsed ? "열기" : "접기";
    btn.setAttribute("aria-expanded", String(!isCollapsed));
    btn.addEventListener("click", () => {
      const nowCollapsed = section.classList.toggle("is-collapsed");
      btn.textContent = nowCollapsed ? "열기" : "접기";
      btn.setAttribute("aria-expanded", String(!nowCollapsed));
    });
  });
}

function renderServiceCards() {
  const container = $("#topServiceCards");
  if (!container) return;
  container.innerHTML = "";

  Object.values(SERVICES).forEach((srv) => {
    const label = document.createElement("label");
    label.className = "card-base service-card";
    const priceText = srv.pricePerHole
      ? `개당 ${srv.pricePerHole.toLocaleString()}원`
      : srv.pricePerMeter
      ? `m당 ${srv.pricePerMeter.toLocaleString()}원`
      : srv.pricePerCorner
      ? `모서리당 ${srv.pricePerCorner.toLocaleString()}원`
      : "";
    label.innerHTML = `
      <input type="checkbox" name="service" value="${srv.id}" />
      <div class="material-visual" style="background: ${srv.swatch || "#eee"}"></div>
      <div class="name">${srv.label}</div>
      <div class="price">${priceText}</div>
      ${descriptionHTML(srv.description)}
      <div class="service-actions">
        <div class="service-detail-chip" data-service-summary="${srv.id}">
          ${srv.hasDetail() ? "세부 옵션을 설정해주세요." : "추가 설정 없음"}
        </div>
      </div>
    `;
    container.appendChild(label);
  });

  Object.keys(SERVICES).forEach((id) => updateServiceSummary(id));
  updatePreviewSummary();

  container.addEventListener("change", (e) => {
    if (e.target.name === "service") {
      const serviceId = e.target.value;
      const srv = SERVICES[serviceId];
      const card = e.target.closest(".service-card");
      if (e.target.checked) {
        card?.classList.add("selected");
        if (srv?.hasDetail()) {
          openServiceModal(serviceId, e.target, "change");
        } else {
          state.serviceDetails[serviceId] = srv?.defaultDetail() || null;
          updateServiceSummary(serviceId);
          refreshTopEstimate();
        }
        updateServiceHeaderSummary();
      } else {
        if (srv?.hasDetail()) {
          e.target.checked = true;
          openServiceModal(serviceId, e.target, "edit");
          return;
        }
        card?.classList.remove("selected");
        delete state.serviceDetails[serviceId];
        updateServiceSummary(serviceId);
        refreshTopEstimate();
        updateServiceHeaderSummary();
      }
    }
  });

  container.addEventListener("click", (e) => {
    const card = e.target.closest(".service-card");
    if (!card) return;
    const checkbox = card.querySelector('input[name="service"]');
    if (!checkbox) return;
    const serviceId = checkbox.value;
    const srv = SERVICES[serviceId];
    if (!srv?.hasDetail()) return;
    e.preventDefault();
    e.stopPropagation();
    const wasChecked = checkbox.checked;
    if (!checkbox.checked) {
      checkbox.checked = true;
      card.classList.add("selected");
      updateServiceSummary(serviceId);
      refreshTopEstimate();
      updateAddButtonState();
    }
    openServiceModal(serviceId, checkbox, wasChecked ? "edit" : "change");
  });
}

function renderTable() {
  renderEstimateTable({
    items: state.items,
    getName: (item) => {
      const isAddon = item.type === "addon";
      const addonInfo = isAddon ? TOP_ADDON_ITEMS.find((a) => a.id === item.addonId) : null;
      return escapeHtml(isAddon ? addonInfo?.name || "부자재" : item.typeName);
    },
    getTotalText: (item) => (item.isCustomPrice ? "상담 안내" : `${item.total.toLocaleString()}원`),
    getDetailLines: (item) => {
      const isAddon = item.type === "addon";
      const addonInfo = isAddon ? TOP_ADDON_ITEMS.find((a) => a.id === item.addonId) : null;
      if (isAddon) {
        return [
          `부자재 ${escapeHtml(addonInfo?.name || "부자재")}`,
          `상품가 ${item.materialCost.toLocaleString()}원`,
        ];
      }
      const baseCost = Math.max(0, item.materialCost - item.processingCost);
      const servicesText = formatServiceList(item.services, item.serviceDetails, { includeNote: true });
      const baseLines = buildEstimateDetailLines({
        sizeText: escapeHtml(item.displaySize),
        optionsText: escapeHtml(item.optionsLabel),
        servicesText: escapeHtml(servicesText || "-"),
        materialLabel: "상판비",
        materialCost: item.isCustomPrice ? null : baseCost,
        processingCost: item.processingCost,
      });
      if (item.isCustomPrice) {
        baseLines.splice(3, 0, "상판비 상담 안내");
      }
      return baseLines;
    },
    onQuantityChange: (id, value) => updateItemQuantity(id, value),
    onDelete: (id) => {
      state.items = state.items.filter((it) => it.id !== id);
      renderTable();
      renderSummary();
      updateStepVisibility();
    },
  });
}

function renderSummary() {
  const materialsTotal = state.items.reduce((sum, it) => sum + it.subtotal, 0);
  const grandTotal = state.items.reduce((sum, it) => sum + it.total, 0);
  const hasCustom = state.items.some((item) => item.isCustomPrice);
  const suffix = hasCustom ? "(상담 필요 품목 미포함)" : "";
  const grandEl = $("#grandTotal");
  if (grandEl) grandEl.textContent = `${grandTotal.toLocaleString()}${suffix}`;
  const naverUnits = Math.ceil(grandTotal / 1000) || 0;
  const naverEl = $("#naverUnits");
  if (naverEl) naverEl.textContent = `${naverUnits}${suffix}`;
  updateSendButtonEnabled();
}

function renderOrderCompleteDetails() {
  const container = $("#orderCompleteDetails");
  if (!container) return;
  const customer = getCustomerInfo();
  const materialsTotal = state.items.reduce((sum, it) => sum + it.subtotal, 0);
  const grandTotal = state.items.reduce((sum, it) => sum + it.total, 0);

  const itemsHtml =
    state.items.length === 0
      ? '<p class="item-line">담긴 항목이 없습니다.</p>'
      : state.items
          .map((item, idx) => {
            const servicesText = formatServiceList(item.services, item.serviceDetails, { includeNote: true });
            const amountText = item.isCustomPrice ? "상담 안내" : `${item.total.toLocaleString()}원`;
            return `<p class="item-line">${idx + 1}. ${item.type === "addon" ? "부자재" : "상판"} ${escapeHtml(item.typeName)} x${item.quantity}${
              item.type === "addon"
                ? ""
                : ` · 크기 ${escapeHtml(item.displaySize)} · 옵션 ${escapeHtml(item.optionsLabel)} · 가공 ${escapeHtml(servicesText || "-")}`
            } · 금액 ${amountText}</p>`;
          })
          .join("");

  container.innerHTML = `
    <div class="complete-section">
      <h4>고객 정보</h4>
      <p>이름: ${escapeHtml(customer.name || "-")}</p>
      <p>연락처: ${escapeHtml(customer.phone || "-")}</p>
      <p>이메일: ${escapeHtml(customer.email || "-")}</p>
      <p>요청사항: ${escapeHtml(customer.memo || "-")}</p>
    </div>
    <div class="complete-section">
      <h4>주문 품목</h4>
      ${itemsHtml}
    </div>
    <div class="complete-section">
      <h4>합계</h4>
      <p>예상 결제금액: ${grandTotal.toLocaleString()}원${
        state.items.some((item) => item.isCustomPrice) ? "(상담 필요 품목 미포함)" : ""
      }</p>
    </div>
  `;
}

function updateAddButtonState() {
  const btn = $("#calcTopBtn");
  if (!btn) return;
  const input = readTopInputs();
  const err = validateTopInputs(input);
  btn.disabled = Boolean(err);
}

function refreshTopEstimate() {
  const priceEl = $("#topEstimateText");
  const input = readTopInputs();
  const type = TOP_TYPES.find((t) => t.id === input.typeId);
  const needsSecond = input.shape === "l" || input.shape === "rl";
  updateSizeErrors({
    widthId: "topWidth",
    lengthId: "topLength",
    length2Id: "topLength2",
    widthErrorId: "topWidthError",
    lengthErrorId: "topLengthError",
    length2ErrorId: "topLength2Error",
    widthMin: type?.minWidth,
    widthMax: null,
    lengthMin: type?.minLength,
    lengthMax: null,
    length2Min: type?.minLength,
    length2Max: null,
    enableLength2: needsSecond,
  });
  const detail = calcTopDetail(input);
  if (detail.error) {
    priceEl.textContent = detail.error;
    updateAddButtonState();
    updateTopPreview(input, null);
    return;
  }
  if (detail.isCustomPrice) {
    priceEl.textContent = "금액: 상담 안내";
    updateAddButtonState();
    updateTopPreview(input, detail);
    return;
  }
  const baseCost = Math.max(0, detail.materialCost - detail.processingCost);
  priceEl.textContent = `금액: ${formatPrice(detail.total)}원 (상판비 ${formatPrice(
    baseCost
  )} + 가공비 ${formatPrice(detail.processingCost)})`;
  updateAddButtonState();
  updateTopPreview(input, detail);
}

function addTopItem() {
  const input = readTopInputs();
  const detail = calcTopDetail(input);
  if (detail.error) {
    showInfoModal(detail.error);
    updateAddButtonState();
    return;
  }
  const type = TOP_TYPES.find((t) => t.id === input.typeId);
  state.items.push({
    id: crypto.randomUUID(),
    typeId: input.typeId,
    typeName: type?.name || "상판",
    type: "top",
    shape: input.shape,
    width: input.width,
    length: input.length,
    length2: input.length2,
    thickness: input.thickness,
    options: input.options,
    services: input.services,
    serviceDetails: cloneServiceDetails(input.serviceDetails),
    quantity: 1,
    ...detail,
  });
  renderTable();
  renderSummary();
  $("#topEstimateText").textContent = "금액: 0원";
  resetSelections();
  updateStepVisibility();
}

function resetSelections() {
  selectedTopType = "";
  selectedTopCategory = TOP_CATEGORIES[0] || "기타";
  state.addons = [];
  document.querySelectorAll('input[name="topType"]').forEach((el) => {
    el.checked = false;
    el.closest(".material-card")?.classList.remove("selected");
  });
  $("#kitchenShape").value = "";
  $("#topWidth").value = "";
  $("#topLength").value = "";
  $("#topLength2").value = "";
  $("#topThickness").value = "";
  document.querySelectorAll("#topOptionCards input[type='checkbox']").forEach((el) => {
    el.checked = false;
    el.closest(".option-card")?.classList.remove("selected");
  });
  document.querySelectorAll("#topServiceCards input[type='checkbox']").forEach((el) => {
    el.checked = false;
    el.closest(".service-card")?.classList.remove("selected");
  });
  document.querySelectorAll("#topAddonCards input[type='checkbox']").forEach((el) => {
    el.checked = false;
    el.closest(".addon-card")?.classList.remove("selected");
  });
  state.serviceDetails = {};
  Object.keys(SERVICES).forEach((id) => updateServiceSummary(id));
  updateOptionHeaderSummary();
  updateSelectedTopTypeCard();
  updateSelectedTopAddonsDisplay();
  refreshTopEstimate();
  updateTopPreview(readTopInputs(), null);
}

function addTopAddonItems() {
  if (state.addons.length === 0) {
    showInfoModal("부자재를 선택해주세요.");
    return;
  }
  const existingAddonIds = state.items.filter((it) => it.type === "addon").map((it) => it.addonId);
  const duplicateIds = state.addons.filter((id) => existingAddonIds.includes(id));
  const newIds = state.addons.filter((id) => !existingAddonIds.includes(id));

  if (duplicateIds.length > 0 && newIds.length === 0) {
    const names = duplicateIds.map((id) => TOP_ADDON_ITEMS.find((a) => a.id === id)?.name || id).join(", ");
    showInfoModal(`이미 담겨있는 부자재입니다: ${names}`);
    return;
  }

  if (duplicateIds.length > 0) {
    const names = duplicateIds.map((id) => TOP_ADDON_ITEMS.find((a) => a.id === id)?.name || id).join(", ");
    showInfoModal(`이미 담겨있는 부자재는 제외하고 추가합니다: ${names}`);
  }

  newIds.forEach((id) => {
    const addon = TOP_ADDON_ITEMS.find((a) => a.id === id);
    if (!addon) return;
    const detail = calcAddonDetail(addon.price);
    state.items.push({
      id: crypto.randomUUID(),
      type: "addon",
      addonId: id,
      typeName: addon.name,
      quantity: 1,
      materialCost: detail.materialCost,
      processingCost: detail.processingCost,
      subtotal: detail.subtotal,
      vat: detail.vat,
      total: detail.total,
      displaySize: "-",
      optionsLabel: "-",
      servicesLabel: "-",
      serviceDetails: {},
      services: [],
    });
  });
  state.addons = [];
  renderTopAddonCards();
  updateSelectedTopAddonsDisplay();
  renderTable();
  renderSummary();
}

function updateLength2Visibility() {
  const shape = $("#kitchenShape")?.value;
  const row = $("#topLength2Row");
  if (!row) return;
  const needsSecond = shape === "l" || shape === "rl";
  row.classList.toggle("hidden-step", !needsSecond);
}

function updateTopPreview(input, detail) {
  const colorEl = $("#topPreviewColor");
  const textEl = $("#topPreviewText");
  if (!colorEl || !textEl) return;

  const type = TOP_TYPES.find((t) => t.id === input.typeId);
  const needsSecond = input.shape === "l" || input.shape === "rl";
  const hasSize =
    input.width && input.length && input.thickness && (!needsSecond || input.length2);

  // reset shape container
  colorEl.innerHTML = "";
  colorEl.classList.remove("l-shape-preview");
  colorEl.style.clipPath = "none";

  if (!type || !hasSize || !detail) {
    colorEl.style.background = "#ddd";
    colorEl.style.width = "120px";
    colorEl.style.height = "120px";
    colorEl.style.setProperty("--cutout-alpha", "0");
    colorEl.style.setProperty("--cutout-w", "0px");
    colorEl.style.setProperty("--cutout-h", "0px");
    colorEl.style.clipPath = "none";
    textEl.textContent = "상판과 사이즈를 선택하면 미리보기가 표시됩니다.";
    return;
  }

  const swatchMap = {
    solid: "linear-gradient(135deg, #f5f5f5 0%, #d9d9d9 100%)",
    engineered: "linear-gradient(135deg, #f2f7ff 0%, #d6e4ff 100%)",
    stainless: "linear-gradient(135deg, #f0f0f0 0%, #c7c7c7 100%)",
  };
  const swatch = type.swatch || swatchMap[type.id] || "#ddd";

  if (needsSecond) {
    const maxPx = 180;
    const minPx = 40;
    const overallWidthMm = input.length;
    const overallHeightMm = Math.max(input.width, input.length2);
    const scale = Math.min(maxPx / Math.max(overallWidthMm, overallHeightMm), 1);
    const widthPx = Math.max(12, input.width * scale);
    const lengthPx = Math.max(minPx, input.length * scale);
    const length2Px = Math.max(minPx, input.length2 * scale);
    const overallPxW = Math.max(minPx, overallWidthMm * scale);
    const overallPxH = Math.max(widthPx, length2Px);
    const isL = input.shape === "l"; // ㄱ자 (세로 오른쪽), 역ㄱ자 (세로 왼쪽)

    colorEl.classList.add("l-shape-preview");
    colorEl.style.background = swatch;
    colorEl.style.width = `${overallPxW}px`;
    colorEl.style.height = `${overallPxH}px`;

    if (isL) {
      // ㄱ자: 세로가 오른쪽
      colorEl.style.clipPath = `polygon(
        0px 0px,
        ${overallPxW}px 0px,
        ${overallPxW}px ${length2Px}px,
        ${overallPxW - widthPx}px ${length2Px}px,
        ${overallPxW - widthPx}px ${widthPx}px,
        0px ${widthPx}px
      )`;
    } else {
      // 역ㄱ자: 세로가 왼쪽
      colorEl.style.clipPath = `polygon(
        ${overallPxW}px 0px,
        0px 0px,
        0px ${length2Px}px,
        ${widthPx}px ${length2Px}px,
        ${widthPx}px ${widthPx}px,
        ${overallPxW}px ${widthPx}px
      )`;
    }

    const cutoutW = Math.max(0, overallPxW - widthPx);
    const cutoutH = Math.max(0, length2Px - widthPx);
    const cutoutX = isL ? 0 : widthPx;
    const cutoutY = widthPx;
    const cutoutAlpha = cutoutW > 0 && cutoutH > 0 ? 1 : 0;
    colorEl.style.setProperty("--cutout-x", `${cutoutX}px`);
    colorEl.style.setProperty("--cutout-y", `${cutoutY}px`);
    colorEl.style.setProperty("--cutout-w", `${cutoutW}px`);
    colorEl.style.setProperty("--cutout-h", `${cutoutH}px`);
    colorEl.style.setProperty("--cutout-alpha", String(cutoutAlpha));

  } else {
    colorEl.style.background = swatch;
    colorEl.style.clipPath = "none";
    colorEl.style.setProperty("--cutout-alpha", "0");
    colorEl.style.setProperty("--cutout-w", "0px");
    colorEl.style.setProperty("--cutout-h", "0px");

    const { w, h } = getPreviewDimensions(input.length, input.width, 180, 40);
    colorEl.style.width = `${w}px`;
    colorEl.style.height = `${h}px`;
  }

  textEl.textContent = needsSecond
    ? `${type.name} / ${input.width}×${input.length} & ${input.width}×${input.length2}×${input.thickness}mm`
    : `${type.name} / ${input.width}×${input.length}×${input.thickness}mm`;
}

const serviceModalController = createServiceModalController({
  modalId: "#topServiceModal",
  titleId: "#topServiceModalTitle",
  bodyId: "#topServiceModalBody",
  errorId: "#topServiceModalError",
  noteId: "topServiceNote",
  focusTarget: "#topServiceModalTitle",
  services: SERVICES,
  state,
  getDefaultServiceDetail,
  cloneServiceDetails,
  updateServiceSummary,
  openModal,
  closeModal,
  onRevertSelection: () => {
    refreshTopEstimate();
    updateAddButtonState();
  },
  onAfterSave: () => {
    refreshTopEstimate();
    updateAddButtonState();
  },
  onAfterRemove: () => {
    refreshTopEstimate();
    updateAddButtonState();
  },
});

function openServiceModal(serviceId, triggerCheckbox, mode = "change") {
  serviceModalController.open(serviceId, triggerCheckbox, mode);
}

function closeServiceModal(revertSelection = true) {
  serviceModalController.close(revertSelection);
}

function saveServiceModal() {
  serviceModalController.save();
}

function removeServiceModal() {
  serviceModalController.remove();
}

function updateItemQuantity(id, quantity) {
  const idx = state.items.findIndex((it) => it.id === id);
  if (idx === -1) return;
  const item = state.items[idx];
  const detail = calcTopDetail({
    typeId: item.typeId,
    shape: item.shape,
    width: item.width,
    length: item.length,
    length2: item.length2,
    thickness: item.thickness,
    options: item.options,
    services: item.services,
    serviceDetails: item.serviceDetails,
  });
  state.items[idx] = {
    ...item,
    quantity,
    total: detail.total * quantity,
    subtotal: detail.subtotal * quantity,
    vat: detail.vat * quantity,
    materialCost: detail.materialCost * quantity,
    processingCost: detail.processingCost * quantity,
    servicesLabel: detail.servicesLabel,
  };
  renderTable();
  renderSummary();
}

function showInfoModal(message) {
  const modal = $("#infoModal");
  const msgEl = $("#infoMessage");
  if (msgEl) msgEl.textContent = message;
  openModal(modal, { focusTarget: "#infoModalTitle" });
}

function closeInfoModal() {
  closeModal("#infoModal");
}

function updateStepVisibility() {
  const step1 = $("#step1");
  const step2 = $("#step2");
  const stepPreview = $("#stepPreview");
  const step3Options = $("#step3Options");
  const step3Services = $("#step3Services");
  const step4 = $("#step4");
  const step5 = $("#step5");
  const actionCard = document.querySelector(".action-card");
  const navPrev = $("#prevStepsBtn");
  const navNext = $("#nextStepsBtn");
  const backToCenterBtn = $("#backToCenterBtn");
  const sendBtn = $("#sendQuoteBtn");
  const summaryCard = $("#stepFinal");
  const orderComplete = $("#orderComplete");
  const navActions = document.querySelector(".nav-actions");

  const showPhase1 = currentPhase === 1;
  const showPhase2 = currentPhase === 2;
  const showPhase3 = currentPhase === 3;

  if (orderCompleted) {
    [
      step1,
      step2,
      stepPreview,
      step3Options,
      step3Services,
      step4,
      step5,
      actionCard,
      summaryCard,
    ].forEach((el) => el?.classList.add("hidden-step"));
    navActions?.classList.add("hidden-step");
    orderComplete?.classList.remove("hidden-step");
    return;
  }

  [step1, step2, stepPreview, step3Options, step3Services, actionCard].forEach((el) => {
    el?.classList.toggle("hidden-step", !showPhase1);
  });
  step4?.classList.toggle("hidden-step", !showPhase2);
  step5?.classList.toggle("hidden-step", !showPhase3);

  if (navPrev) {
    navPrev.classList.toggle("hidden-step", currentPhase === 1);
    navPrev.style.display = currentPhase === 1 ? "none" : "";
  }
  if (sendBtn) {
    sendBtn.classList.toggle("hidden-step", !showPhase3);
    sendBtn.style.display = showPhase3 ? "" : "none";
  }
  if (backToCenterBtn) {
    backToCenterBtn.classList.toggle("hidden-step", !showPhase1);
    backToCenterBtn.style.display = showPhase1 ? "" : "none";
  }
  if (navNext) {
    navNext.classList.toggle("hidden-step", showPhase3);
    navNext.style.display = showPhase3 ? "none" : "";
  }
}

function goToNextStep() {
  if (currentPhase === 1) {
    if (state.items.length === 0) {
      showInfoModal("상판을 담아주세요.");
      return;
    }
    currentPhase = 2;
    updateStepVisibility(document.getElementById("step4"));
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (currentPhase === 2) {
    const hasItem = state.items.length > 0;
    if (!hasItem) {
      showInfoModal("상판이나 부자재 중 하나 이상 담아주세요.");
      return;
    }
    currentPhase = 3;
    updateStepVisibility(document.getElementById("step5"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function goToPrevStep() {
  if (currentPhase === 1) return;
  currentPhase -= 1;
  updateStepVisibility();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetOrderCompleteUI() {
  orderCompleted = false;
  const orderComplete = $("#orderComplete");
  const navActions = document.querySelector(".nav-actions");
  ["step1", "step2", "stepPreview", "step3Options", "step3Services", "step4", "step5", "stepFinal"].forEach(
    (id) => document.getElementById(id)?.classList.remove("hidden-step")
  );
  navActions?.classList.remove("hidden-step");
  orderComplete?.classList.add("hidden-step");
}

function showOrderComplete() {
  renderOrderCompleteDetails();
  orderCompleted = true;
  updateStepVisibility();
}

function updateSendButtonEnabled() {
  const customer = getCustomerInfo();
  updateSendButtonEnabledShared({
    customer,
    hasItems: state.items.length > 0,
    onFinalStep: currentPhase === 3,
    hasConsent: isConsentChecked(),
    sending: sendingEmail,
  });
}

function buildEmailContent() {
  const customer = getCustomerInfo();
  const materialsTotal = state.items.reduce((sum, it) => sum + it.subtotal, 0);
  const grandTotal = state.items.reduce((sum, it) => sum + it.total, 0);

  const lines = [];
  lines.push("[고객 정보]");
  lines.push(`이름: ${customer.name || "-"}`);
  lines.push(`연락처: ${customer.phone || "-"}`);
  lines.push(`이메일: ${customer.email || "-"}`);
  lines.push(`요청사항: ${customer.memo || "-"}`);
  lines.push("");
  lines.push("[주문 내역]");

  if (state.items.length === 0) {
    lines.push("담긴 항목 없음");
  } else {
    state.items.forEach((item, idx) => {
      const servicesText = formatServiceList(item.services, item.serviceDetails, { includeNote: true });
      const amountText = item.isCustomPrice ? "상담 안내" : `${item.total.toLocaleString()}원`;
      lines.push(
        `${idx + 1}. ${item.typeName} x${item.quantity} | 크기 ${
          item.displaySize
        } | 옵션 ${item.optionsLabel} | 가공 ${servicesText || "-"} | 금액 ${amountText}`
      );
    });
  }

  lines.push("");
  lines.push("[합계]");
  lines.push(`상판 금액 합계: ${materialsTotal.toLocaleString()}원`);
  const hasCustom = state.items.some((item) => item.isCustomPrice);
  const suffix = hasCustom ? "(상담 필요 품목 미포함)" : "";
  lines.push(`예상 결제금액: ${grandTotal.toLocaleString()}원${suffix}`);

  const subject = `[GGR 상판 견적요청] ${customer.name || "고객명"} (${customer.phone || "연락처"})`;
  return {
    subject,
    body: lines.join("\n"),
    lines,
  };
}

async function sendQuote() {
  if (state.items.length === 0) {
    showInfoModal("담긴 항목이 없습니다. 상판을 담아주세요.");
    return;
  }
  const customer = getCustomerInfo();
  const customerError = validateCustomerInfo(customer);
  if (customerError) {
    showInfoModal(customerError);
    return;
  }
  const emailjsInstance = getEmailJSInstance(showInfoModal);
  if (!emailjsInstance) return;

  sendingEmail = true;
  updateSendButtonEnabled();

  const { subject, body, lines } = buildEmailContent();
  const templateParams = {
    subject,
    message: body,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_email: customer.email,
    customer_memo: customer.memo || "-",
    order_lines: lines.join("\n"),
  };

  try {
    await emailjsInstance.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateId,
      templateParams
    );
    showOrderComplete();
  } catch (err) {
    console.error(err);
    const detail = err?.text || err?.message || "";
    showInfoModal(
      detail
        ? `주문 전송 중 오류가 발생했습니다.\n${detail}`
        : "주문 전송 중 오류가 발생했습니다. 다시 시도해주세요."
    );
  } finally {
    sendingEmail = false;
    updateSendButtonEnabled();
  }
}

function resetFlow() {
  resetOrderCompleteUI();
  sendingEmail = false;
  orderCompleted = false;
  state.items = [];
  state.addons = [];
  ["#customerName", "#customerPhone", "#customerEmail", "#customerMemo"].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) el.value = "";
  });
  renderTable();
  renderSummary();
  resetSelections();
  currentPhase = 1;
  updateStepVisibility();
  updateSendButtonEnabled();
  renderTopAddonCards();
  updateSelectedTopAddonsDisplay();
  const consentEl = document.getElementById("privacyConsent");
  if (consentEl) consentEl.checked = false;
}

function initTop() {
  renderTopTypeTabs();
  renderTopTypeCards();
  renderOptions();
  renderTopAddonCards();
  renderServiceCards();
  initCollapsibleSections();
  renderTable();
  renderSummary();
  updateSelectedTopTypeCard();
  updateSelectedTopAddonsDisplay();
  updateTopThicknessOptions(selectedTopType);
  updateTopSizePlaceholders(selectedTopType);
  renderTopCategoryDesc();
  resetOrderCompleteUI();
  initEmailJS();
  updatePreviewSummary();
  const priceEl = $("#topEstimateText");
  if (priceEl) priceEl.textContent = "상판 타입을 선택해주세요.";

  $("#calcTopBtn").addEventListener("click", addTopItem);
  $("#openTopTypeModal").addEventListener("click", openTopTypeModal);
  $("#closeTopTypeModal").addEventListener("click", closeTopTypeModal);
  $("#topTypeModalBackdrop")?.addEventListener("click", closeTopTypeModal);
  $("#openTopAddonModal")?.addEventListener("click", openTopAddonModal);
  $("#closeTopAddonModal")?.addEventListener("click", closeTopAddonModal);
  $("#topAddonModalBackdrop")?.addEventListener("click", closeTopAddonModal);
  $("#addTopAddonBtn")?.addEventListener("click", addTopAddonItems);
  $("#nextStepsBtn")?.addEventListener("click", goToNextStep);
  $("#prevStepsBtn")?.addEventListener("click", goToPrevStep);
  $("#backToCenterBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
  $("#sendQuoteBtn")?.addEventListener("click", sendQuote);
  $("#closeInfoModal")?.addEventListener("click", closeInfoModal);
  $("#infoModalBackdrop")?.addEventListener("click", closeInfoModal);
  $("#saveTopServiceModal")?.addEventListener("click", saveServiceModal);
  $("#removeTopServiceModal")?.addEventListener("click", removeServiceModal);
  $("#cancelTopServiceModal")?.addEventListener("click", () => closeServiceModal(true));
  $("#topServiceModalBackdrop")?.addEventListener("click", () => closeServiceModal(true));

  ["topWidth", "topLength", "topLength2", "topThickness", "kitchenShape"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("input", refreshTopEstimate);
    el?.addEventListener("change", refreshTopEstimate);
  });
  $("#kitchenShape")?.addEventListener("change", updateLength2Visibility);
  updateLength2Visibility();
  ["#customerName", "#customerPhone", "#customerEmail"].forEach((sel) => {
    const el = document.querySelector(sel);
    el?.addEventListener("input", updateSendButtonEnabled);
  });
  $("#resetFlowBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
  document.getElementById("privacyConsent")?.addEventListener("change", updateSendButtonEnabled);
  updateAddButtonState();
  updateStepVisibility();
  updateSendButtonEnabled();
  updateTopPreview(readTopInputs(), null);
}

function openTopTypeModal() {
  openModal("#topTypeModal", { focusTarget: "#topTypeModalTitle" });
}

function closeTopTypeModal() {
  closeModal("#topTypeModal");
}

function openTopAddonModal() {
  openModal("#topAddonModal", { focusTarget: "#topAddonModalTitle" });
}

function closeTopAddonModal() {
  closeModal("#topAddonModal");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTop);
} else {
  initTop();
}
