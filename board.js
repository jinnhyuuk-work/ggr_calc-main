import {
  MATERIALS,
  BOARD_PROCESSING_SERVICES,
  ADDON_ITEMS,
  MATERIAL_CATEGORIES_DESC,
} from "./data.js";
import { VAT_RATE, calcPackingCost, calcShippingCost, initEmailJS, EMAILJS_CONFIG } from "./shared.js";

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
  const count = holes.length || detail.count || 1;
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
    return {
      holes: [{ edge: "left", distance: 100, verticalRef: "top", verticalDistance: 100 }],
      note: "",
    };
  }
  normalizeDetail(detail) {
    if (!detail || !Array.isArray(detail.holes)) return this.defaultDetail();
    const holes =
      detail.holes.length > 0
        ? detail.holes
        : [{ edge: "left", distance: 100, verticalRef: "top", verticalDistance: 100 }];
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
    const fallback = normalized.count || 1;
    return Math.max(1, holes || fallback || 1);
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

const SERVICES = buildServiceModels(BOARD_PROCESSING_SERVICES);

function getPricePerM2(material, thickness) {
  if (material.pricePerM2ByThickness) {
    if (thickness && material.pricePerM2ByThickness[thickness]) {
      return material.pricePerM2ByThickness[thickness];
    }
    const firstAvailable = material.availableThickness?.find(
      (t) => material.pricePerM2ByThickness[t]
    );
    if (firstAvailable !== undefined) {
      return material.pricePerM2ByThickness[firstAvailable];
    }
    const firstPrice = Object.values(material.pricePerM2ByThickness)[0];
    if (firstPrice) return firstPrice;
  }
  return material.pricePerM2;
}

// 1) 합판 금액 계산
function calcMaterialCost({ materialId, width, length, quantity, thickness }) {
  const material = MATERIALS[materialId];
  const areaM2 = (width / 1000) * (length / 1000); // mm → m
  const pricePerM2 = getPricePerM2(material, thickness);

  const materialCost = areaM2 * pricePerM2 * quantity;
  return { areaM2, materialCost };
}

function getPreviewDimensions(width, length, maxPx = 160, minPx = 40) {
  if (!width || !length) return { w: 120, h: 120 };
  const scale = Math.min(maxPx / Math.max(width, length), 1);
  return {
    w: Math.max(minPx, width * scale),
    h: Math.max(minPx, length * scale),
  };
}

function getHoleCountForService(serviceId, serviceDetails) {
  const srv = SERVICES[serviceId];
  if (!srv) return 1;
  return srv.getCount(serviceDetails?.[serviceId]);
}

// 2) 가공비 계산
function calcProcessingCost({
  materialId,
  width,
  length,
  quantity,
  services = [],
  serviceDetails = {},
}) {
  let processingCost = 0;

  services.forEach((id) => {
    const srv = SERVICES[id];
    if (!srv) return;
    const detail = serviceDetails?.[id];
    processingCost += srv.calcProcessingCost(quantity, detail);
  });

  return { processingCost };
}

// 3) 무게 계산
function calcWeightKg({ materialId, width, length, thickness, quantity }) {
  const material = MATERIALS[materialId];
  const areaM2 = (width / 1000) * (length / 1000);
  const thicknessM = thickness / 1000;

  const volumeM3 = areaM2 * thicknessM * quantity;
  const weightKg = volumeM3 * material.density;
  return { weightKg };
}

// 6) 한 아이템 전체 계산 (합판비 + 가공비 + 무게 + VAT 전까지)
function calcItemDetail(input) {
  const {
    materialId,
    width,
    length,
    thickness,
    quantity,
    services = [],
    serviceDetails = {},
  } = input;

  const { areaM2, materialCost } = calcMaterialCost({
    materialId,
    width,
    length,
    quantity,
    thickness,
  });

  const { processingCost } = calcProcessingCost({
    materialId,
    width,
    length,
    quantity,
    services,
    serviceDetails,
  });

  const { weightKg } = calcWeightKg({
    materialId,
    width,
    length,
    thickness,
    quantity,
  });

  const subtotal = materialCost + processingCost; // VAT 전 금액
  const vat = Math.round(subtotal * VAT_RATE);
  const total = Math.round(subtotal + vat);

  return {
    areaM2,
    materialCost,
    processingCost,
    subtotal,
    vat,
    total,
    weightKg,
  };
}

function calcAddonDetail(price) {
  const subtotal = price;
  const vat = Math.round(subtotal * VAT_RATE);
  const total = subtotal + vat;
  return {
    materialCost: price,
    processingCost: 0,
    subtotal,
    vat,
    total,
    weightKg: 0,
  };
}

// 7) 주문 전체 합계 계산
function calcOrderSummary(items) {
  const materialsTotal = items
    .filter((i) => i.type !== "addon")
    .reduce((s, i) => s + i.materialCost, 0);
  const processingTotal = items.reduce((s, i) => s + i.processingCost, 0);
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const vat = items.reduce((s, i) => s + i.vat, 0);
  const totalWeight = items.reduce((s, i) => s + i.weightKg, 0);

  const packingCost = calcPackingCost(totalWeight);
  const shippingCost = calcShippingCost(totalWeight);

  const grandTotal = subtotal + packingCost + shippingCost + vat;

  return {
    materialsTotal,
    processingTotal,
    subtotal,
    vat,
    totalWeight,
    packingCost,
    shippingCost,
    grandTotal,
  };
}

function getCustomerInfo() {
  return {
    name: $("#customerName")?.value.trim() || "",
    phone: $("#customerPhone")?.value.trim() || "",
    email: $("#customerEmail")?.value.trim() || "",
    memo: $("#customerMemo")?.value.trim() || "",
  };
}
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const WIDTH_MIN = 100;
const WIDTH_MAX = 800;
const LENGTH_MIN = 200;
const LENGTH_MAX = 2400;

const state = {
  items: [], // {id, materialId, thickness, width, length, quantity, services, ...계산 결과}
  addons: [],
  serviceDetails: {}, // 현재 선택된 가공별 세부 옵션
};
let currentPhase = 1; // 1: 합판/가공, 2: 부자재, 3: 고객 정보
let sendingEmail = false;
let orderCompleted = false;
const EXTRA_CATEGORIES = ["LX SMR PET", "LX Texture PET", "LX PET", "Hansol PET", "Original PET", "LPM"];
const categories = Array.from(
  new Set(
    [...Object.values(MATERIALS).map((m) => m.category || "기타"), ...EXTRA_CATEGORIES].filter(
      (cat) => cat !== "집성목" && cat !== "MDF"
    )
  )
);
let selectedCategory = categories[0];
let selectedMaterialId = "";
let serviceModalDraft = null;
let serviceModalContext = { serviceId: null, triggerCheckbox: null, mode: null };

function cloneServiceDetails(details) {
  return JSON.parse(JSON.stringify(details || {}));
}

function getDefaultServiceDetail(serviceId) {
  const srv = SERVICES[serviceId];
  if (!srv) return { note: "" };
  const detail = srv.defaultDetail ? srv.defaultDetail() : { note: "" };
  return cloneServiceDetails(detail);
}

function descriptionHTML(desc) {
  return desc ? `<div class="description">${desc}</div>` : "";
}

function formatHingeDetail(detail, { short = false, includeNote = false } = {}) {
  return formatHoleDetail(detail, { short, includeNote });
}

function formatHandleDetail(detail, { includeNote = false } = {}) {
  return formatHoleDetail(detail, { includeNote });
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

function updateServiceSummary(serviceId) {
  const summaryEl = document.querySelector(`[data-service-summary="${serviceId}"]`);
  if (!summaryEl) return;
  const srv = SERVICES[serviceId];
  if (!srv) {
    summaryEl.textContent = "세부 옵션을 설정해주세요.";
    return;
  }
  const detail = state.serviceDetails[serviceId];
  summaryEl.textContent = detail
    ? formatServiceSummaryText(serviceId, detail)
    : srv.hasDetail()
    ? "세부 옵션을 설정해주세요."
    : "추가 설정 없음";
}

function renderServiceCards() {
  const container = $("#serviceCards");
  if (!container) return;
  container.innerHTML = "";

  Object.values(SERVICES).forEach((srv) => {
    const label = document.createElement("label");
    label.className = "card-base service-card";
    const priceText = srv.pricePerMeter
      ? `m당 ${srv.pricePerMeter.toLocaleString()}원`
      : srv.pricePerCorner
      ? `모서리당 ${srv.pricePerCorner.toLocaleString()}원`
      : srv.pricePerHole
      ? `개당 ${srv.pricePerHole.toLocaleString()}원`
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
        <button type="button" class="service-detail-btn" data-service="${srv.id}" ${
          srv.hasDetail() ? "" : 'style="display:none;"'
        }>세부 설정</button>
      </div>
    `;
    container.appendChild(label);
  });

  Object.keys(SERVICES).forEach((id) => updateServiceSummary(id));

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
          autoCalculatePrice();
        }
      } else {
        card?.classList.remove("selected");
        delete state.serviceDetails[serviceId];
        updateServiceSummary(serviceId);
        autoCalculatePrice();
      }
    }
  });

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".service-detail-btn");
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const serviceId = btn.dataset.service;
      const srv = SERVICES[serviceId];
      if (!srv?.hasDetail()) return;
      const checkbox = container.querySelector(`input[value="${serviceId}"]`);
      const wasChecked = checkbox?.checked;
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        checkbox.closest(".service-card")?.classList.add("selected");
      }
      openServiceModal(serviceId, checkbox, wasChecked ? "edit" : "change");
    }
  });
}

function renderMaterialTabs() {
  const tabs = $("#materialTabs");
  tabs.innerHTML = "";
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `material-tab${cat === selectedCategory ? " active" : ""}`;
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      selectedCategory = cat;
      // 선택된 소재가 다른 카테고리에 있을 경우 선택 해제
      const inCategory = Object.values(MATERIALS).some(
        (m) => m.id === selectedMaterialId && (m.category || "기타") === cat
      );
      if (!inCategory) selectedMaterialId = "";
      renderMaterialTabs();
      renderMaterialCards();
      if (selectedMaterialId) updateThicknessOptions(selectedMaterialId);
      renderCategoryDesc();
    });
    tabs.appendChild(btn);
  });
  renderCategoryDesc();
}

function renderMaterialCards() {
  const container = $("#materialCards");
  container.innerHTML = "";

  const list = Object.values(MATERIALS).filter(
    (mat) => (mat.category || "기타") === selectedCategory
  );

  list.forEach((mat) => {
    const label = document.createElement("label");
    label.className = `card-base material-card${
      selectedMaterialId === mat.id ? " selected" : ""
    }`;
    label.innerHTML = `
      <input type="radio" name="material" value="${mat.id}" ${
        selectedMaterialId === mat.id ? "checked" : ""
      } />
      <div class="material-visual" style="background: ${mat.swatch || "#ddd"}"></div>
      <div class="name">${mat.name}</div>
      <div class="price">㎡당 ${getPricePerM2(mat).toLocaleString()}원</div>
      <div class="size">가능 두께: ${(mat.availableThickness || [])
        .map((t) => `${t}T`)
        .join(", ")}</div>
      <div class="size">폭 ${mat.minWidth}~${mat.maxWidth}mm / 길이 ${mat.minLength}~${mat.maxLength}mm</div>
      ${descriptionHTML(mat.description)}
    `;
    container.appendChild(label);
  });

  container.onclick = (e) => {
    const input = e.target.closest('input[name="material"]');
    if (!input) return;
    const prevMaterialId = selectedMaterialId;
    selectedMaterialId = input.value;
    if (prevMaterialId && prevMaterialId !== selectedMaterialId) {
      resetServiceOptions();
    }
    updateThicknessOptions(selectedMaterialId);
    updateSelectedMaterialLabel();
    updateSizePlaceholders(MATERIALS[selectedMaterialId]);
    updatePreview();
    $$(".material-card").forEach((card) => card.classList.remove("selected"));
    input.closest(".material-card")?.classList.add("selected");
    closeMaterialModal();
  };
  if (selectedMaterialId) updateThicknessOptions(selectedMaterialId);
  updateSelectedMaterialLabel();
}

function renderCategoryDesc() {
  const descEl = document.getElementById("materialCategoryDesc");
  const titleEl = document.getElementById("materialCategoryName");
  if (!descEl || !titleEl) return;
  const desc = MATERIAL_CATEGORIES_DESC[selectedCategory] || "";
  titleEl.textContent = selectedCategory || "";
  descEl.textContent = desc;
}

function renderAddonCards() {
  const container = $("#addonCards");
  if (!container) return;
  container.innerHTML = "";

  ADDON_ITEMS.forEach((item) => {
    const label = document.createElement("label");
    label.className = `card-base addon-card${
      state.addons.includes(item.id) ? " selected" : ""
    }`;
    label.innerHTML = `
      <input type="checkbox" value="${item.id}" ${state.addons.includes(item.id) ? "checked" : ""} />
      <div class="material-visual"></div>
      <div class="name">${item.name}</div>
      <div class="price">${item.price.toLocaleString()}원</div>
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
    updateSelectedAddonsDisplay();
    $$("#addonCards .addon-card").forEach((card) => card.classList.remove("selected"));
    state.addons.forEach((id) => {
      const card = container.querySelector(`input[value="${id}"]`)?.closest(".addon-card");
      card?.classList.add("selected");
    });
  };
}

function updateSelectedAddonsDisplay() {
  const target = $("#selectedAddonCard");
  if (!target) return;
  if (state.addons.length === 0) {
    target.innerHTML = `<div class="placeholder">선택된 부자재 없음</div>`;
    return;
  }
  const chips = state.addons
    .map((id) => ADDON_ITEMS.find((i) => i.id === id))
    .filter(Boolean)
    .map(
      (item) => `
        <div class="addon-chip">
          <div class="material-visual" style="background:#ddd;"></div>
          <div class="info">
            <div class="name">${item.name}</div>
            <div class="meta">${item.price.toLocaleString()}원</div>
          </div>
        </div>
      `
    )
    .join("");
  target.innerHTML = chips;
}

function updateAddItemState() {
  const btn = $("#addItemBtn");
  if (!btn) return;
  const input = readCurrentInputs();
  const err = validateInputs(input);
  btn.disabled = Boolean(err);
}

function readCurrentInputs() {
  const selected = document.querySelector('input[name="material"]:checked');
  const materialId = selected ? selected.value : "";
  const thickness = Number($("#thicknessSelect").value);
  const width = Number($("#widthInput").value);
  const length = Number($("#lengthInput").value);
  const quantity = Number($("#qtyInput")?.value || 1);

  const services = Array.from(document.querySelectorAll('input[name="service"]:checked')).map(
    (el) => el.value
  );

  const serviceDetails = cloneServiceDetails(state.serviceDetails);

  return { materialId, thickness, width, length, quantity, services, serviceDetails };
}

// 입력값 검증
function validateInputs(input) {
  const { materialId, thickness, width, length, quantity } = input;
  const mat = MATERIALS[materialId];

  if (!materialId) return "합판을 선택해주세요.";
  if (!thickness) return "두께를 선택해주세요.";
  if (!width) return "폭을 입력해주세요.";
  const widthMin = mat?.minWidth ?? WIDTH_MIN;
  const widthMax = mat?.maxWidth ?? WIDTH_MAX;
  if (width < widthMin || width > widthMax)
    return `폭은 ${widthMin} ~ ${widthMax}mm 사이여야 합니다.`;
  if (!length) return "길이를 입력해주세요.";
  const lengthMin = mat?.minLength ?? LENGTH_MIN;
  const lengthMax = mat?.maxLength ?? LENGTH_MAX;
  if (length < lengthMin || length > lengthMax)
    return `길이는 ${lengthMin} ~ ${lengthMax}mm 사이여야 합니다.`;
  if (!quantity || quantity <= 0) return "수량은 1개 이상이어야 합니다.";

  const material = mat;
  if (!material.availableThickness?.includes(thickness)) {
    return `선택한 합판은 ${material.availableThickness.join(", ")}T만 가능합니다.`;
  }
  return null;
}

// 버튼: 합판담기
const addItemBtn = $("#addItemBtn");
if (addItemBtn) {
  addItemBtn.addEventListener("click", () => {
    const input = readCurrentInputs();
    const err = validateInputs(input);
    if (err) {
      $("#itemPriceDisplay").textContent = err;
      updateAddItemState();
      return;
    }

    const detail = calcItemDetail(input);
    const itemServiceDetails = cloneServiceDetails(input.serviceDetails);

    state.items.push({
      id: crypto.randomUUID(),
      ...input,
      serviceDetails: itemServiceDetails,
      ...detail,
    });

    renderTable();
    renderSummary();
    $("#itemPriceDisplay").textContent = "금액: 0원";
    resetStepsAfterAdd();
  });
}

const addAddonBtn = document.getElementById("addAddonBtn");
if (addAddonBtn) {
  addAddonBtn.addEventListener("click", () => {
    if (state.addons.length === 0) {
      showInfoModal("부자재를 선택해주세요.");
      return;
    }
    const existingAddonIds = state.items
      .filter((it) => it.type === "addon")
      .map((it) => it.addonId);

    const duplicateIds = state.addons.filter((id) => existingAddonIds.includes(id));
    const newIds = state.addons.filter((id) => !existingAddonIds.includes(id));

    if (duplicateIds.length > 0 && newIds.length === 0) {
      const names = duplicateIds
        .map((id) => ADDON_ITEMS.find((a) => a.id === id)?.name || id)
        .join(", ");
      showInfoModal(`이미 담겨있는 부자재입니다: ${names}`);
      return;
    }

    if (duplicateIds.length > 0) {
      const names = duplicateIds
        .map((id) => ADDON_ITEMS.find((a) => a.id === id)?.name || id)
        .join(", ");
      showInfoModal(`이미 담겨있는 부자재는 제외하고 추가합니다: ${names}`);
    }

    newIds.forEach((id) => {
      const addon = ADDON_ITEMS.find((a) => a.id === id);
      if (!addon) return;
      const detail = calcAddonDetail(addon.price);
      state.items.push({
        id: crypto.randomUUID(),
        type: "addon",
        addonId: id,
        quantity: 1,
        materialCost: detail.materialCost,
        processingCost: detail.processingCost,
        subtotal: detail.subtotal,
        vat: detail.vat,
        total: detail.total,
        weightKg: 0,
      });
    });
    state.addons = [];
    renderAddonCards();
    updateSelectedAddonsDisplay();
    renderTable();
    renderSummary();
  });
}

function resetStepsAfterAdd() {
  selectedMaterialId = "";

  // 재질 선택 초기화
  document.querySelectorAll('input[name="material"]').forEach((input) => {
    input.checked = false;
    input.closest(".material-card")?.classList.remove("selected");
  });
  updateSelectedMaterialLabel();
  updateSizePlaceholders(null);

  // 두께 선택 초기화
  const thicknessSelect = $("#thicknessSelect");
  if (thicknessSelect) {
    thicknessSelect.innerHTML = `<option value="">합판을 선택해주세요</option>`;
  }

  // 사이즈 입력 초기화
  const widthEl = $("#widthInput");
  const lengthEl = $("#lengthInput");
  if (widthEl) widthEl.value = "";
  if (lengthEl) lengthEl.value = "";

  // 가공 서비스 초기화
  document.querySelectorAll('input[name="service"]').forEach((input) => {
    input.checked = false;
    input.closest(".service-card")?.classList.remove("selected");
  });
  state.serviceDetails = {};
  Object.keys(SERVICES).forEach((id) => updateServiceSummary(id));

  $("#itemPriceDisplay").textContent = "금액: 0원";

  validateSizeFields();
  updatePreview();
  updateModalCardPreviews();
  updateAddItemState();
}

function showInfoModal(message) {
  const modal = document.getElementById("infoModal");
  const msgEl = document.getElementById("infoMessage");
  if (msgEl) msgEl.textContent = message;
  modal?.classList.remove("hidden");
}

function closeInfoModal() {
  document.getElementById("infoModal")?.classList.add("hidden");
}

function updateStepVisibility(scrollTarget) {
  if (!orderCompleted) {
    resetOrderCompleteUI();
  }
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const step3 = document.getElementById("step3");
  const actionCard = document.querySelector(".action-card");
  const step4 = document.getElementById("step4");
  const step5 = document.getElementById("step5");
  const summaryCard = document.getElementById("stepFinal");
  const sendBtn = document.getElementById("sendQuoteBtn");
  const nextBtn = document.getElementById("nextStepsBtn");
  const backToCenterBtn = document.getElementById("backToCenterBtn");
  const orderComplete = document.getElementById("orderComplete");
  const navActions = document.querySelector(".nav-actions");

  const showPhase1 = currentPhase === 1;
  const showPhase2 = currentPhase === 2;
  const showPhase3 = currentPhase === 3;

  if (orderCompleted) {
    [step1, step2, step3, step4, step5, actionCard].forEach((el) => el?.classList.add("hidden-step"));
    navActions?.classList.add("hidden-step");
    sendBtn?.classList.add("hidden-step");
    nextBtn?.classList.add("hidden-step");
    orderComplete?.classList.remove("hidden-step");
    summaryCard?.classList.add("order-complete-visible");
    summaryCard?.classList.add("hidden-step");
    return;
  }

  [step1, step2, step3, actionCard].forEach((el) => {
    if (el) el.classList.toggle("hidden-step", !showPhase1);
  });
  if (step4) step4.classList.toggle("hidden-step", !showPhase2);
  if (step5) step5.classList.toggle("hidden-step", !showPhase3 || orderCompleted);
  if (summaryCard) summaryCard.classList.remove("hidden-step");
  if (sendBtn) sendBtn.classList.toggle("hidden-step", !showPhase3 || orderCompleted);
  if (nextBtn) {
    nextBtn.classList.toggle("hidden-step", showPhase3 || orderCompleted);
    nextBtn.style.display = showPhase3 || orderCompleted ? "none" : "";
  }
  if (backToCenterBtn) {
    backToCenterBtn.classList.toggle("hidden-step", !showPhase1 || orderCompleted);
    backToCenterBtn.style.display = showPhase1 && !orderCompleted ? "" : "none";
  }
  if (!orderCompleted) {
    if (orderComplete) orderComplete.classList.add("hidden-step");
    summaryCard?.classList.remove("order-complete-visible");
    navActions?.classList.remove("hidden-step");
  }
  updateSendButtonEnabled();

  const prevBtn = document.getElementById("prevStepsBtn");
  if (prevBtn) {
    prevBtn.classList.toggle("hidden-step", currentPhase === 1);
    prevBtn.style.display = currentPhase === 1 ? "none" : "";
  }

  if (scrollTarget) {
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function goToNextStep() {
  if (currentPhase === 1) {
    currentPhase = 2;
    updateStepVisibility(document.getElementById("step4"));
    return;
  }
  if (currentPhase === 2) {
    const hasMaterial = state.items.some((it) => it.type !== "addon");
    const hasAddon = state.items.some((it) => it.type === "addon");
    if (!hasMaterial && !hasAddon) {
      showInfoModal("합판이나 부자재 중 하나 이상 담아주세요.");
      return;
    }
    currentPhase = 3;
    updateStepVisibility(document.getElementById("step5"));
    return;
  }
}

function goToPrevStep() {
  if (currentPhase === 1) return;
  currentPhase -= 1;
  if (currentPhase === 2) {
    updateStepVisibility(document.getElementById("step4"));
    return;
  }
  updateStepVisibility(document.getElementById("step1"));
}

function renderTable() {
  const tbody = $("#estimateTable tbody");
  tbody.innerHTML = "";
  const emptyBanner = $("#estimateEmpty");

  if (state.items.length === 0) {
    if (emptyBanner) emptyBanner.style.display = "block";
    return;
  }
  if (emptyBanner) emptyBanner.style.display = "none";

  state.items.forEach((item) => {
    const tr = document.createElement("tr");

    const isAddon = item.type === "addon";
    const addonInfo = isAddon ? ADDON_ITEMS.find((a) => a.id === item.addonId) : null;

    const materialName = isAddon
      ? addonInfo?.name || "부자재"
      : MATERIALS[item.materialId].name;
    const sizeText = isAddon
      ? "-"
      : `${item.thickness}T / ${item.width}×${item.length}mm`;
    const servicesText = isAddon ? "-" : formatServiceList(item.services, item.serviceDetails);

    tr.innerHTML = `
      <td>${materialName}</td>
      <td>
        <input
          type="number"
          class="qty-input"
          data-id="${item.id}"
          value="${item.quantity}"
          min="1"
        />
      </td>
      <td>
        <div>총: ${item.total.toLocaleString()}원</div>
      </td>
      <td><button data-id="${item.id}" class="deleteBtn">삭제</button></td>
    `;

    tbody.appendChild(tr);

    const detailRow = document.createElement("tr");
    detailRow.className = "detail-row";
    if (isAddon) {
      detailRow.innerHTML = `
        <td colspan="4">
          <div class="sub-detail">
            <div class="detail-line">부자재 ${materialName}</div>
            <div class="detail-line">상품가 ${item.materialCost.toLocaleString()}원 · VAT ${item.vat.toLocaleString()}원</div>
          </div>
        </td>
      `;
    } else {
      detailRow.innerHTML = `
        <td colspan="4">
          <div class="sub-detail">
            <div class="detail-line">주문크기 ${sizeText} · 가공 ${servicesText}</div>
          <div class="detail-line">합판비 ${item.materialCost.toLocaleString()}원 · 가공비 ${item.processingCost.toLocaleString()}원 · VAT ${item.vat.toLocaleString()}원</div>
          </div>
        </td>
      `;
    }
    tbody.appendChild(detailRow);
  });

  // 수량 변경
  $$("#estimateTable .qty-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      const value = Math.max(1, Number(e.target.value) || 1);
      updateItemQuantity(id, value);
    });
  });

  $$("#estimateTable .deleteBtn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      state.items = state.items.filter((it) => it.id !== id);
      renderTable();
      renderSummary();
    });
  });
}

function updateItemQuantity(id, quantity) {
  const idx = state.items.findIndex((it) => it.id === id);
  if (idx === -1) return;
  const item = state.items[idx];
  if (item.type === "addon") {
    const addon = ADDON_ITEMS.find((a) => a.id === item.addonId);
    if (!addon) return;
    const detail = calcAddonDetail(addon.price * quantity);
    state.items[idx] = { ...item, quantity, ...detail };
  } else {
    const detail = calcItemDetail({
      materialId: item.materialId,
      width: item.width,
      length: item.length,
      thickness: item.thickness,
      quantity,
      services: item.services,
      serviceDetails: item.serviceDetails,
    });
    state.items[idx] = { ...item, quantity, ...detail };
  }
  renderTable();
  renderSummary();
}
function renderSummary() {
  const summary = calcOrderSummary(state.items);

  const materialsTotalEl = $("#materialsTotal");
  if (materialsTotalEl) materialsTotalEl.textContent = summary.materialsTotal.toLocaleString();
  $("#packingCost").textContent = summary.packingCost.toLocaleString();
  $("#grandTotal").textContent = summary.grandTotal.toLocaleString();

  // 필요하면 VAT/배송비도 화면에 추가
  const vatEl = document.getElementById("vatTotal");
  const shippingEl = document.getElementById("shippingCost");
  if (vatEl) vatEl.textContent = summary.vat.toLocaleString();
  if (shippingEl) shippingEl.textContent = summary.shippingCost.toLocaleString();

  const naverUnits = Math.ceil(summary.grandTotal / 1000);
  $("#naverUnits").textContent = naverUnits;
  updateSendButtonEnabled();
}

function buildEmailContent() {
  const customer = getCustomerInfo();
  const summary = calcOrderSummary(state.items);

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
      const isAddon = item.type === "addon";
      const addonInfo = isAddon ? ADDON_ITEMS.find((a) => a.id === item.addonId) : null;
      const materialName = isAddon
        ? addonInfo?.name || "부자재"
        : MATERIALS[item.materialId].name;
      const sizeText = isAddon ? "-" : `${item.thickness}T / ${item.width}×${item.length}mm`;
      const servicesText = isAddon
        ? "-"
        : formatServiceList(item.services, item.serviceDetails, { includeNote: true });
      lines.push(
        `${idx + 1}. ${materialName} x${item.quantity} | 크기 ${sizeText} | 가공 ${servicesText} | 금액 ${item.total.toLocaleString()}원`
      );
    });
  }

  lines.push("");
  lines.push("[합계]");
  lines.push(`합판비: ${summary.materialsTotal.toLocaleString()}원`);
  lines.push(`포장비: ${summary.packingCost.toLocaleString()}원`);
  lines.push(`총결제금액: ${summary.grandTotal.toLocaleString()}원`);
  lines.push(`예상무게: ${summary.totalWeight.toFixed(2)}kg`);

  const subject = `[GGR 견적요청] ${customer.name || "고객명"} (${customer.phone || "연락처"})`;
  return {
    subject,
    body: lines.join("\n"),
    lines,
  };
}

function updateSendButtonEnabled() {
  const btn = $("#sendQuoteBtn");
  if (!btn) return;
  const customer = getCustomerInfo();
  const hasRequired = Boolean(customer.name && customer.phone && customer.email);
  const hasItems = state.items.length > 0;
  const onFinalStep = currentPhase === 3;
  btn.disabled = !(hasRequired && hasItems && onFinalStep) || sendingEmail;
}

function resetOrderCompleteUI() {
  orderCompleted = false;
  const navActions = document.querySelector(".nav-actions");
  const completeEl = document.getElementById("orderComplete");
  const summaryCard = document.getElementById("stepFinal");
  const customerStep = document.getElementById("step5");
  const actionCard = document.querySelector(".action-card");
  ["step1", "step2", "step3", "step4"].forEach((id) =>
    document.getElementById(id)?.classList.remove("hidden-step")
  );
  actionCard?.classList.remove("hidden-step");
  navActions?.classList.remove("hidden-step");
  completeEl?.classList.add("hidden-step");
  summaryCard?.classList.remove("order-complete-visible");
  summaryCard?.classList.remove("hidden-step");
  customerStep?.classList.add("hidden-step"); // 시작 시 고객정보 스텝 노출 방지
}

function showOrderComplete() {
  const navActions = document.querySelector(".nav-actions");
  const completeEl = document.getElementById("orderComplete");
  const customerStep = document.getElementById("step5");
  const summaryCard = document.getElementById("stepFinal");
  renderOrderCompleteDetails();
  orderCompleted = true;
  if (navActions) navActions.classList.add("hidden-step");
  if (customerStep) customerStep.classList.add("hidden-step");
  if (completeEl) completeEl.classList.remove("hidden-step");
  summaryCard?.classList.add("order-complete-visible");
  summaryCard?.classList.add("hidden-step");
}

function resetFlow() {
  sendingEmail = false;
  orderCompleted = false;
  state.items = [];
  state.addons = [];
  const customerFields = ["#customerName", "#customerPhone", "#customerEmail", "#customerMemo"];
  customerFields.forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) el.value = "";
  });
  renderTable();
  renderSummary();
  selectedMaterialId = "";
  resetStepsAfterAdd();
  currentPhase = 1;
  updateStepVisibility(document.getElementById("step1"));
  const navActions = document.querySelector(".nav-actions");
  const completeEl = document.getElementById("orderComplete");
  if (navActions) navActions.classList.remove("hidden-step");
  if (completeEl) completeEl.classList.add("hidden-step");
  document.getElementById("step5")?.classList.add("hidden-step");
  const summaryCard = document.getElementById("stepFinal");
  summaryCard?.classList.remove("order-complete-visible");
  summaryCard?.classList.remove("hidden-step");
  updateSendButtonEnabled();
}

function renderOrderCompleteDetails() {
  const container = document.getElementById("orderCompleteDetails");
  if (!container) return;
  const customer = getCustomerInfo();
  const summary = calcOrderSummary(state.items);

  const itemsHtml =
    state.items.length === 0
      ? "<p class=\"item-line\">담긴 항목이 없습니다.</p>"
      : state.items
          .map((item, idx) => {
            const isAddon = item.type === "addon";
            const addonInfo = isAddon ? ADDON_ITEMS.find((a) => a.id === item.addonId) : null;
            const materialName = isAddon
              ? addonInfo?.name || "부자재"
              : MATERIALS[item.materialId].name;
            const sizeText = isAddon ? "-" : `${item.thickness}T / ${item.width}×${item.length}mm`;
            const servicesText = isAddon
              ? "-"
              : formatServiceList(item.services, item.serviceDetails, { includeNote: true });
            return `<p class="item-line">${idx + 1}. ${materialName} x${item.quantity} · 크기 ${sizeText} · 가공 ${servicesText} · 금액 ${item.total.toLocaleString()}원</p>`;
          })
          .join("");

  container.innerHTML = `
    <div class="complete-section">
      <h4>고객 정보</h4>
      <p>이름: ${customer.name || "-"}</p>
      <p>연락처: ${customer.phone || "-"}</p>
      <p>이메일: ${customer.email || "-"}</p>
      <p>요청사항: ${customer.memo || "-"}</p>
    </div>
    <div class="complete-section">
      <h4>주문 품목</h4>
      ${itemsHtml}
    </div>
    <div class="complete-section">
      <h4>합계</h4>
      <p>총결제금액: ${summary.grandTotal.toLocaleString()}원</p>
      <p>합판비: ${summary.materialsTotal.toLocaleString()}원</p>
      <p>포장비: ${summary.packingCost.toLocaleString()}원</p>
      <p>예상무게: ${summary.totalWeight.toFixed(2)}kg</p>
    </div>
  `;
}

async function sendQuote() {
  if (state.items.length === 0) {
    showInfoModal("담긴 항목이 없습니다. 주문을 담아주세요.");
    return;
  }
  const customer = getCustomerInfo();
  if (!customer.name || !customer.phone || !customer.email) {
    showInfoModal("이름, 연락처, 이메일을 입력해주세요.");
    return;
  }
  if (!EMAILJS_CONFIG.serviceId || !EMAILJS_CONFIG.templateId || !EMAILJS_CONFIG.publicKey) {
    showInfoModal("EmailJS 설정(서비스ID/템플릿ID/publicKey)을 입력해주세요.");
    return;
  }
  const emailjsInstance = window.emailjs;
  if (!emailjsInstance) {
    showInfoModal("EmailJS 스크립트가 로드되지 않았습니다.");
    return;
  }

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

function updateThicknessOptions(materialId) {
  const select = $("#thicknessSelect");
  select.innerHTML = `<option value="">두께를 선택하세요</option>`;
  if (!materialId) return;
  const mat = MATERIALS[materialId];
  (mat.availableThickness || []).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = `${t}T`;
    select.appendChild(opt);
  });
  // 자동 선택 제거: 사용자가 직접 선택하도록 유지
  autoCalculatePrice();
}

function validateSizeFields() {
  const widthEl = $("#widthInput");
  const lengthEl = $("#lengthInput");
  const widthErrEl = $("#widthError");
  const lengthErrEl = $("#lengthError");
  const calcBtn = $("#calcItemBtn");
  const addBtn = $("#addItemBtn");

  const widthVal = Number(widthEl.value);
  const lengthVal = Number(lengthEl.value);
  const mat = MATERIALS[selectedMaterialId];

  let widthValid = true;
  let lengthValid = true;

  const widthMin = mat?.minWidth ?? WIDTH_MIN;
  const widthMax = mat?.maxWidth ?? WIDTH_MAX;
  const lengthMin = mat?.minLength ?? LENGTH_MIN;
  const lengthMax = mat?.maxLength ?? LENGTH_MAX;

  const widthHint = `폭: ${widthMin}~${widthMax}mm`;
  const lengthHint = `길이: ${lengthMin}~${lengthMax}mm`;

  widthErrEl.textContent = "";
  lengthErrEl.textContent = "";
  widthErrEl.classList.remove("error");
  lengthErrEl.classList.remove("error");
  widthEl.classList.remove("input-error");
  lengthEl.classList.remove("input-error");

  if (widthEl.value && (widthVal < widthMin || widthVal > widthMax)) {
    widthValid = false;
    widthErrEl.textContent = `${widthHint} 범위로 입력해주세요.`;
    widthErrEl.classList.add("error");
    widthEl.classList.add("input-error");
  }

  if (lengthEl.value && (lengthVal < lengthMin || lengthVal > lengthMax)) {
    lengthValid = false;
    lengthErrEl.textContent = `${lengthHint} 범위로 입력해주세요.`;
    lengthErrEl.classList.add("error");
    lengthEl.classList.add("input-error");
  }

  const disable = !widthValid || !lengthValid;
  if (calcBtn) calcBtn.disabled = disable;
  updateAddItemState();
}

function autoCalculatePrice() {
  const input = readCurrentInputs();
  const err = validateInputs(input);
  if (err) {
    $("#itemPriceDisplay").textContent = err;
    updateAddItemState();
    return;
  }
  const detail = calcItemDetail(input);
  $("#itemPriceDisplay").textContent =
    `금액(부가세 포함): ${detail.total.toLocaleString()}원 ` +
    `(합판비 ${detail.materialCost.toLocaleString()} + 가공비 ${detail.processingCost.toLocaleString()})`;
  updateAddItemState();
}

function updatePreview() {
  const colorEl = $("#previewColor");
  const textEl = $("#previewText");
  if (!colorEl || !textEl) return;

  const input = readCurrentInputs();
  const mat = MATERIALS[input.materialId];
  if (!mat || !input.width || !input.length || !input.thickness) {
    colorEl.style.background = "#ddd";
    colorEl.style.width = "120px";
    colorEl.style.height = "120px";
    textEl.textContent = "합판과 사이즈를 선택하면 미리보기가 표시됩니다.";
    clearPreviewHoles();
    return;
  }
  colorEl.style.background = mat.swatch || "#ddd";
  const { w, h } = getPreviewDimensions(input.width, input.length, 180, 40);
  colorEl.style.width = `${w}px`;
  colorEl.style.height = `${h}px`;
  textEl.textContent = `${mat.name} / ${input.thickness}T / ${input.width}×${input.length}mm`;
  renderPreviewHoles(input);
}

function clearPreviewHoles() {
  const colorEl = $("#previewColor");
  if (!colorEl) return;
  colorEl.querySelectorAll(".hole-dot").forEach((el) => el.remove());
}

function resetServiceOptions() {
  const hasSelectedService = document.querySelector('input[name="service"]:checked');
  const hasDetails = state.serviceDetails && Object.keys(state.serviceDetails).length > 0;
  if (!hasSelectedService && !hasDetails) return;

  document.querySelectorAll('input[name="service"]').forEach((input) => {
    input.checked = false;
    input.closest(".service-card")?.classList.remove("selected");
  });
  state.serviceDetails = {};
  Object.keys(SERVICES).forEach((id) => updateServiceSummary(id));
  clearPreviewHoles();
  autoCalculatePrice();
  updateAddItemState();
}

function renderPreviewHoles(input) {
  const colorEl = $("#previewColor");
  if (!colorEl) return;
  clearPreviewHoles();
  const hasHinge = input?.services?.includes("hinge_hole");
  const hasHandle = input?.services?.includes("handle_hole");
  if (!hasHinge && !hasHandle) return;
  if (!input.width || !input.length) return;
  const hingeHoles =
    hasHinge && Array.isArray(input.serviceDetails?.hinge_hole?.holes)
      ? input.serviceDetails.hinge_hole.holes
      : [];
  const handleHoles =
    hasHandle && Array.isArray(input.serviceDetails?.handle_hole?.holes)
      ? input.serviceDetails.handle_hole.holes
      : [];
  const holes = [
    ...hingeHoles.map((h) => ({ ...h, _type: "hinge" })),
    ...handleHoles.map((h) => ({ ...h, _type: "handle" })),
  ];
  if (holes.length === 0) return;

  const rect = colorEl.getBoundingClientRect();
  const pxW = rect.width;
  const pxH = rect.height;
  if (!pxW || !pxH) return;
  const scaleX = pxW / input.width;
  const scaleY = pxH / input.length;
  const scale = Math.min(scaleX, scaleY);

  holes.forEach((h) => {
    const distX = Number(h.distance);
    const distY = Number(h.verticalDistance);
    if (!Number.isFinite(distX) || !Number.isFinite(distY) || distX <= 0 || distY <= 0) return;
    const x = h.edge === "right" ? pxW - distX * scaleX : distX * scaleX;
    const y = h.verticalRef === "bottom" ? pxH - distY * scaleY : distY * scaleY;
    const diameterMm = h._type === "handle" ? 15 : 35;
    const sizePx = diameterMm * scale;
    const dot = document.createElement("div");
    dot.className = `hole-dot${h._type === "handle" ? " handle-hole" : ""}`;
    dot.style.width = `${sizePx}px`;
    dot.style.height = `${sizePx}px`;
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    colorEl.appendChild(dot);
  });
}

function updateSelectedMaterialLabel() {
  const cardEl = $("#selectedMaterialCard");
  if (!cardEl) return;

  const fallbackSelected = document.querySelector('input[name="material"]:checked');
  const matId = selectedMaterialId || fallbackSelected?.value;
  if (matId && !selectedMaterialId) {
    selectedMaterialId = matId;
  }
  const mat = MATERIALS[matId];
  if (!mat) {
    cardEl.innerHTML = `
      <div class="material-visual placeholder-visual"></div>
      <div class="info">
        <div class="placeholder">선택된 합판 없음</div>
        <div class="meta">합판을 선택해주세요.</div>
      </div>
    `;
    return;
  }

  cardEl.innerHTML = `
    <div class="material-visual" style="background: ${mat.swatch || "#ddd"}"></div>
    <div class="info">
      <div class="name">${mat.name}</div>
      <div class="meta">가능 두께: ${(mat.availableThickness || [])
        .map((t) => `${t}T`)
        .join(", ")}</div>
      <div class="meta">폭 ${mat.minWidth}~${mat.maxWidth}mm / 길이 ${mat.minLength}~${mat.maxLength}mm</div>
    </div>
  `;
}

function setServiceModalError(message) {
  const errEl = $("#serviceModalError");
  if (errEl) errEl.textContent = message || "";
}

function renderHoleModal(serviceId) {
  const body = $("#serviceModalBody");
  const srv = SERVICES[serviceId];
  if (!body || !srv) return;
  const normalized = srv.normalizeDetail(serviceModalDraft);
  const holes =
    Array.isArray(normalized?.holes) && normalized.holes.length > 0
      ? normalized.holes
      : srv.defaultDetail().holes;
  serviceModalDraft = { ...normalized, holes: holes.map((h) => ({ ...h })) };

  const rowsHtml = holes
    .map(
      (hole, idx) => `
        <div class="service-row">
          <div class="service-row-header">
            <span>${srv.label} ${idx + 1}</span>
            ${
              holes.length > 1
                ? `<button type="button" class="ghost-btn remove-hole" data-index="${idx}">삭제</button>`
                : ""
            }
          </div>
          <div class="service-field-grid">
            <div>
              <label>측면</label>
              <select class="service-input" data-field="edge" data-index="${idx}">
                <option value="left"${hole.edge === "left" ? " selected" : ""}>왼쪽</option>
                <option value="right"${hole.edge === "right" ? " selected" : ""}>오른쪽</option>
              </select>
            </div>
            <div>
              <label>가로(mm)</label>
              <input
                type="number"
                class="service-input"
                data-field="distance"
                data-index="${idx}"
                value="${hole.distance ?? ""}"
                min="1"
              />
            </div>
            <div>
              <label>세로 기준</label>
              <select class="service-input" data-field="verticalRef" data-index="${idx}">
                <option value="top"${hole.verticalRef === "top" ? " selected" : ""}>상단 기준</option>
                <option value="bottom"${hole.verticalRef === "bottom" ? " selected" : ""}>하단 기준</option>
              </select>
            </div>
            <div>
              <label>세로(mm)</label>
              <input
                type="number"
                class="service-input"
                data-field="verticalDistance"
                data-index="${idx}"
                value="${hole.verticalDistance ?? ""}"
                min="1"
              />
            </div>
          </div>
        </div>
      `
    )
    .join("");

  body.innerHTML = `
    <p class="service-option-tip">${srv.label} 위치를 원의 중심 기준으로 입력해주세요. 여러 개를 추가할 수 있습니다.</p>
    ${rowsHtml}
    <div class="service-actions">
      <button type="button" class="secondary-btn" data-add-hole>위치 추가</button>
    </div>
    <div>
      <label>추가 메모 (선택)</label>
      <textarea class="service-textarea" id="serviceNote">${serviceModalDraft?.note || ""}</textarea>
    </div>
  `;

  body.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.index);
      const field = e.target.dataset.field;
      if (Number.isNaN(idx) || !field) return;
      if (!serviceModalDraft.holes[idx]) {
        serviceModalDraft.holes[idx] = { edge: "left", distance: 100, verticalRef: "top", verticalDistance: 100 };
      }
      if (field === "edge") serviceModalDraft.holes[idx].edge = e.target.value === "right" ? "right" : "left";
      if (field === "distance") serviceModalDraft.holes[idx].distance = Number(e.target.value);
      if (field === "verticalRef")
        serviceModalDraft.holes[idx].verticalRef = e.target.value === "bottom" ? "bottom" : "top";
      if (field === "verticalDistance") serviceModalDraft.holes[idx].verticalDistance = Number(e.target.value);
    });
  });

  const noteEl = body.querySelector("#serviceNote");
  if (noteEl) {
    noteEl.addEventListener("input", (e) => {
      serviceModalDraft.note = e.target.value;
    });
  }

  const addBtn = body.querySelector("[data-add-hole]");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      serviceModalDraft.holes.push({
        edge: "left",
        distance: 100,
        verticalRef: "top",
        verticalDistance: 100,
      });
      renderHoleModal(serviceId);
    });
  }

  body.querySelectorAll(".remove-hole").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.target.dataset.index);
      if (Number.isNaN(idx)) return;
      serviceModalDraft.holes.splice(idx, 1);
      if (serviceModalDraft.holes.length === 0) {
        serviceModalDraft.holes.push({
          edge: "left",
          distance: 100,
          verticalRef: "top",
          verticalDistance: 100,
        });
      }
      renderHoleModal(serviceId);
    });
  });
}

function renderServiceModalContent(serviceId) {
  const titleEl = $("#serviceModalTitle");
  const srv = SERVICES[serviceId];
  if (titleEl) titleEl.textContent = srv?.label || "가공 옵션 설정";
  setServiceModalError("");
  if (!serviceModalDraft) {
    serviceModalDraft = getDefaultServiceDetail(serviceId);
  }
  if (srv?.hasDetail()) {
    renderHoleModal(serviceId);
    return;
  }
  const body = $("#serviceModalBody");
  if (body) {
    body.innerHTML = `<p class="service-option-tip">선택한 가공의 세부 설정을 입력해주세요.</p>`;
  }
}

function openServiceModal(serviceId, triggerCheckbox, mode = "change") {
  const srv = SERVICES[serviceId];
  if (!srv?.hasDetail()) return;
  serviceModalContext = { serviceId, triggerCheckbox, mode };
  serviceModalDraft = cloneServiceDetails(state.serviceDetails[serviceId]) || getDefaultServiceDetail(serviceId);
  renderServiceModalContent(serviceId);
  $("#serviceModal")?.classList.remove("hidden");
}

function closeServiceModal(revertSelection = true) {
  $("#serviceModal")?.classList.add("hidden");
  setServiceModalError("");
  if (revertSelection && serviceModalContext.mode === "change" && serviceModalContext.triggerCheckbox) {
    serviceModalContext.triggerCheckbox.checked = false;
    serviceModalContext.triggerCheckbox.closest(".service-card")?.classList.remove("selected");
    delete state.serviceDetails[serviceModalContext.serviceId];
    updateServiceSummary(serviceModalContext.serviceId);
    autoCalculatePrice();
    updateAddItemState();
  }
  serviceModalDraft = null;
  serviceModalContext = { serviceId: null, triggerCheckbox: null, mode: null };
  updatePreview();
}

function saveServiceModal() {
  const serviceId = serviceModalContext.serviceId;
  const srv = SERVICES[serviceId];
  if (!serviceId || !srv) return;
  setServiceModalError("");
  if (srv.hasDetail()) {
    const validation = srv.validateDetail(serviceModalDraft);
    if (!validation.ok) {
      setServiceModalError(validation.message || "세부 옵션을 확인해주세요.");
      return;
    }
    state.serviceDetails[serviceId] = cloneServiceDetails(validation.detail);
  } else {
    state.serviceDetails[serviceId] = srv.normalizeDetail
      ? cloneServiceDetails(srv.normalizeDetail(serviceModalDraft))
      : null;
  }

  updateServiceSummary(serviceId);
  autoCalculatePrice();
  updateAddItemState();
  updatePreview();
  closeServiceModal(false);
}

function openMaterialModal() {
  $("#materialModal")?.classList.remove("hidden");
}

function closeMaterialModal() {
  $("#materialModal")?.classList.add("hidden");
}

function openAddonModal() {
  $("#addonModal")?.classList.remove("hidden");
}

function closeAddonModal() {
  $("#addonModal")?.classList.add("hidden");
}

function updateModalCardPreviews() {
  const selectedVisual = document.querySelector("#selectedMaterialCard .material-visual");
  if (selectedVisual) {
    selectedVisual.style.width = "";
    selectedVisual.style.height = "";
  }
}

function updateSizePlaceholders(mat) {
  const widthEl = $("#widthInput");
  const lengthEl = $("#lengthInput");
  if (!widthEl || !lengthEl) return;
  if (!mat) {
    widthEl.placeholder = "폭 100~800mm";
    lengthEl.placeholder = "길이 200~2400mm";
    return;
  }
  widthEl.placeholder = `폭 ${mat.minWidth}~${mat.maxWidth}mm`;
  lengthEl.placeholder = `길이 ${mat.minLength}~${mat.maxLength}mm`;
}

let initialized = false;

function init() {
  if (initialized) return;

  // DOM 요소가 아직 없으면 조금 뒤에 재시도
  const materialCardsEl = $("#materialCards");
  const materialTabsEl = $("#materialTabs");
  const serviceCardsEl = $("#serviceCards");
  if (!materialCardsEl || !materialTabsEl || !serviceCardsEl) {
    setTimeout(init, 50);
    return;
  }

  initialized = true;

  resetOrderCompleteUI();

  initEmailJS();

  renderMaterialTabs();
  renderMaterialCards();
  renderServiceCards();
  renderAddonCards();
  renderTable();
  renderSummary();
  validateSizeFields();
  autoCalculatePrice();
  updatePreview();
  updateModalCardPreviews();
  updateSelectedMaterialLabel();
  updateSizePlaceholders(MATERIALS[selectedMaterialId]);
  updateSelectedAddonsDisplay();
  updateAddItemState();
  updateStepVisibility();

  $("#closeInfoModal")?.addEventListener("click", closeInfoModal);
  $("#infoModalBackdrop")?.addEventListener("click", closeInfoModal);
  $("#nextStepsBtn")?.addEventListener("click", goToNextStep);
  $("#prevStepsBtn")?.addEventListener("click", goToPrevStep);

  $("#widthInput").addEventListener("input", validateSizeFields);
  $("#lengthInput").addEventListener("input", validateSizeFields);
  $("#widthInput").addEventListener("input", resetServiceOptions);
  $("#lengthInput").addEventListener("input", resetServiceOptions);
  $("#widthInput").addEventListener("input", autoCalculatePrice);
  $("#lengthInput").addEventListener("input", autoCalculatePrice);
  $("#widthInput").addEventListener("input", updatePreview);
  $("#lengthInput").addEventListener("input", updatePreview);
  $("#widthInput").addEventListener("input", () => {
    updateModalCardPreviews();
    updateSelectedMaterialLabel();
  });
  $("#lengthInput").addEventListener("input", () => {
    updateModalCardPreviews();
    updateSelectedMaterialLabel();
  });
  const qtyInputEl = $("#qtyInput");
  if (qtyInputEl) {
    qtyInputEl.addEventListener("input", () => {
      autoCalculatePrice();
      updatePreview();
    });
  }
  $("#thicknessSelect").addEventListener("change", () => {
    resetServiceOptions();
    autoCalculatePrice();
    updatePreview();
    updateSelectedMaterialLabel();
    const selected = MATERIALS[selectedMaterialId];
    updateSizePlaceholders(selected);
  });
  $("#openMaterialModal").addEventListener("click", openMaterialModal);
  $("#closeMaterialModal").addEventListener("click", closeMaterialModal);
  $("#materialModalBackdrop")?.addEventListener("click", closeMaterialModal);
  $("#openAddonModal")?.addEventListener("click", openAddonModal);
  $("#closeAddonModal")?.addEventListener("click", closeAddonModal);
  $("#addonModalBackdrop")?.addEventListener("click", closeAddonModal);
  $("#saveServiceModal")?.addEventListener("click", saveServiceModal);
  $("#cancelServiceModal")?.addEventListener("click", () => closeServiceModal(true));
  $("#serviceModalBackdrop")?.addEventListener("click", () => closeServiceModal(true));
  $("#backToCenterBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
  $("#sendQuoteBtn")?.addEventListener("click", sendQuote);
  ["#customerName", "#customerPhone", "#customerEmail"].forEach((sel) => {
    const el = document.querySelector(sel);
    el?.addEventListener("input", updateSendButtonEnabled);
  });
  $("#resetFlowBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
  document.addEventListener("change", (e) => {
    if (e.target.name === "material" || e.target.name === "service") {
      autoCalculatePrice();
      updatePreview();
      updateAddItemState();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("load", init);
} else {
  init();
}
