import { VAT_RATE, EMAILJS_CONFIG, initEmailJS } from "./shared.js";
import { TOP_PROCESSING_SERVICES, TOP_TYPES, TOP_OPTIONS, TOP_ADDON_ITEMS } from "./data.js";

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

const SERVICES = buildServiceModels(TOP_PROCESSING_SERVICES);

function cloneServiceDetails(details) {
  return JSON.parse(JSON.stringify(details || {}));
}

function getDefaultServiceDetail(serviceId) {
  const srv = SERVICES[serviceId];
  if (!srv) return { note: "" };
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

function renderHoleModal(serviceId) {
  const body = $("#topServiceModalBody");
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
      <textarea class="service-textarea" id="topServiceNote">${serviceModalDraft?.note || ""}</textarea>
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

  const noteEl = body.querySelector("#topServiceNote");
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

let selectedTopType = "";
const TOP_CATEGORIES = Array.from(new Set(TOP_TYPES.map((t) => t.category || "기타")));
let selectedTopCategory = TOP_CATEGORIES[0] || "기타";
let currentPhase = 1; // 1: 상판/가공, 2: 부자재, 3: 고객정보
const state = { items: [], serviceDetails: {}, addons: [] };
let sendingEmail = false;
let orderCompleted = false;
let serviceModalDraft = null;
let serviceModalContext = { serviceId: null, triggerCheckbox: null, mode: null };

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
  return null;
}

function calcTopDetail(input) {
  const { typeId, shape, width, length, length2, thickness, options, services = [], serviceDetails = {} } = input;
  const type = TOP_TYPES.find((t) => t.id === typeId);
  const err = validateTopInputs(input);
  if (!type || err) return { error: err || "필수 정보를 입력해주세요." };

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
  const materialCost = base + processingCost;
  const subtotal = materialCost;
  const vat = Math.round(subtotal * VAT_RATE);
  const total = Math.round(subtotal + vat);

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
  };
}

function updateSelectedTopTypeCard() {
  const card = $("#selectedTopTypeCard");
  if (!card) return;
  const type = TOP_TYPES.find((t) => t.id === selectedTopType);
  if (!type) {
    card.innerHTML = `
      <div class="material-visual placeholder-visual"></div>
      <div class="info">
        <div class="placeholder">선택된 상판 없음</div>
        <div class="meta">상판을 선택해주세요.</div>
      </div>
    `;
    return;
  }
  card.innerHTML = `
    <div class="material-visual"></div>
    <div class="info">
      <div class="name">${type.name}</div>
      <div class="meta">기본가 ${formatPrice(type.basePrice)}원</div>
    </div>
  `;
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
      refreshTopEstimate();
    });
    tabs.appendChild(btn);
  });
}

function renderTopTypeCards() {
  const container = $("#topTypeCards");
  if (!container) return;
  container.innerHTML = "";
  const list = TOP_TYPES.filter((t) => (t.category || "기타") === selectedTopCategory);
  list.forEach((t) => {
    const label = document.createElement("label");
    label.className = `card-base material-card${selectedTopType === t.id ? " selected" : ""}`;
    label.innerHTML = `
      <input type="radio" name="topType" value="${t.id}" ${selectedTopType === t.id ? "checked" : ""} />
      <div class="material-visual"></div>
      <div class="name">${t.name}</div>
      <div class="price">기본가 ${formatPrice(t.basePrice)}원</div>
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
  container.addEventListener("change", (e) => {
    const input = e.target.closest("input[type='checkbox']");
    if (!input) return;
    input.closest(".option-card")?.classList.toggle("selected", input.checked);
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
  const target = $("#selectedTopAddonCard");
  if (!target) return;
  if (state.addons.length === 0) {
    target.innerHTML = `<div class="placeholder">선택된 부자재 없음</div>`;
    return;
  }
  const chips = state.addons
    .map((id) => TOP_ADDON_ITEMS.find((i) => i.id === id))
    .filter(Boolean)
    .map(
      (item) => `
        <div class="addon-chip">
          <div class="material-visual" style="background:#ddd;"></div>
          <div class="info">
            <div class="name">${item.name}</div>
            <div class="meta">${formatPrice(item.price)}원</div>
          </div>
        </div>
      `
    )
    .join("");
  target.innerHTML = chips;
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
          refreshTopEstimate();
        }
      } else {
        card?.classList.remove("selected");
        delete state.serviceDetails[serviceId];
        updateServiceSummary(serviceId);
        refreshTopEstimate();
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

function renderTable() {
  const tbody = $("#estimateTable tbody");
  const emptyBanner = $("#estimateEmpty");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (state.items.length === 0) {
    if (emptyBanner) emptyBanner.style.display = "block";
    return;
  }
  if (emptyBanner) emptyBanner.style.display = "none";

  state.items.forEach((item) => {
    const isAddon = item.type === "addon";
    const addonInfo = isAddon ? TOP_ADDON_ITEMS.find((a) => a.id === item.addonId) : null;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(isAddon ? addonInfo?.name || "부자재" : item.typeName)}</td>
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
            <div class="detail-line">부자재 ${escapeHtml(addonInfo?.name || "부자재")}</div>
            <div class="detail-line">상품가 ${item.materialCost.toLocaleString()}원 · VAT ${item.vat.toLocaleString()}원</div>
          </div>
        </td>
      `;
    } else {
      const baseCost = Math.max(0, item.materialCost - item.processingCost);
      detailRow.innerHTML = `
        <td colspan="4">
          <div class="sub-detail">
            <div class="detail-line">사이즈 ${escapeHtml(item.displaySize)} · 옵션 ${escapeHtml(item.optionsLabel)} · 가공 ${escapeHtml(item.servicesLabel || "-")}</div>
            <div class="detail-line">상판비 ${baseCost.toLocaleString()}원 · 가공비 ${item.processingCost.toLocaleString()}원 · VAT ${item.vat.toLocaleString()}원</div>
          </div>
        </td>
      `;
    }
    tbody.appendChild(detailRow);
  });

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
      updateStepVisibility();
    });
  });
}

function renderSummary() {
  const materialsTotal = state.items.reduce((sum, it) => sum + it.subtotal, 0);
  const grandTotal = state.items.reduce((sum, it) => sum + it.total, 0);
  // 상판 무게 데이터가 없으므로 포장비는 0으로 표시
  const packingCost = 0;
  const packingEl = $("#packingCost");
  if (packingEl) packingEl.textContent = packingCost.toLocaleString();

  const grandEl = $("#grandTotal");
  if (grandEl) grandEl.textContent = grandTotal.toLocaleString();
  const naverUnits = Math.ceil(grandTotal / 1000) || 0;
  const naverEl = $("#naverUnits");
  if (naverEl) naverEl.textContent = naverUnits;
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
          .map(
            (item, idx) =>
              `<p class="item-line">${idx + 1}. ${item.type === "addon" ? "부자재" : "상판"} ${escapeHtml(item.typeName)} x${item.quantity}${
                item.type === "addon"
                  ? ""
                  : ` · 크기 ${escapeHtml(item.displaySize)} · 옵션 ${escapeHtml(item.optionsLabel)} · 가공 ${escapeHtml(item.servicesLabel || "-")}`
              } · 금액 ${item.total.toLocaleString()}원</p>`
          )
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
      <p>총결제금액: ${grandTotal.toLocaleString()}원</p>
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
  const detail = calcTopDetail(input);
  if (detail.error) {
    priceEl.textContent = detail.error;
    updateAddButtonState();
    updateTopPreview(input, null);
    return;
  }
  const baseCost = Math.max(0, detail.materialCost - detail.processingCost);
  priceEl.textContent = `금액(부가세 포함): ${formatPrice(detail.total)}원 (상판비 ${formatPrice(
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
    colorEl.style.boxShadow = "inset 0 0 0 1px rgba(0,0,0,0.04)";
    colorEl.style.clipPath = "none";
    textEl.textContent = "상판과 사이즈를 선택하면 미리보기가 표시됩니다.";
    return;
  }

  const swatchMap = {
    solid: "linear-gradient(135deg, #f5f5f5 0%, #d9d9d9 100%)",
    engineered: "linear-gradient(135deg, #f2f7ff 0%, #d6e4ff 100%)",
    stainless: "linear-gradient(135deg, #f0f0f0 0%, #c7c7c7 100%)",
  };
  const swatch = swatchMap[type.id] || "#ddd";

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
    colorEl.style.boxShadow = "none";
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
  } else {
    colorEl.style.background = swatch;
    colorEl.style.boxShadow = "inset 0 0 0 1px rgba(0,0,0,0.04)";
    colorEl.style.clipPath = "none";

    const { w, h } = getPreviewDimensions(input.length, input.width, 180, 40);
    colorEl.style.width = `${w}px`;
    colorEl.style.height = `${h}px`;
  }

  textEl.textContent = needsSecond
    ? `${type.name} / ${input.width}×${input.length} & ${input.width}×${input.length2}×${input.thickness}mm`
    : `${type.name} / ${input.width}×${input.length}×${input.thickness}mm`;
}

function setServiceModalError(message = "") {
  const errEl = $("#topServiceModalError");
  if (errEl) errEl.textContent = message;
}

function renderServiceModalContent(serviceId) {
  const titleEl = $("#topServiceModalTitle");
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
  const body = $("#topServiceModalBody");
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
  $("#topServiceModal")?.classList.remove("hidden");
  $("#topServiceModalTitle")?.focus();
}

function closeServiceModal(revertSelection = true) {
  $("#topServiceModal")?.classList.add("hidden");
  setServiceModalError("");
  if (revertSelection && serviceModalContext.mode === "change" && serviceModalContext.triggerCheckbox) {
    serviceModalContext.triggerCheckbox.checked = false;
    serviceModalContext.triggerCheckbox.closest(".service-card")?.classList.remove("selected");
    delete state.serviceDetails[serviceModalContext.serviceId];
    updateServiceSummary(serviceModalContext.serviceId);
    refreshTopEstimate();
    updateAddButtonState();
  }
  serviceModalDraft = null;
  serviceModalContext = { serviceId: null, triggerCheckbox: null, mode: null };
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
  refreshTopEstimate();
  updateAddButtonState();
  closeServiceModal(false);
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
  modal?.classList.remove("hidden");
  $("#infoModalTitle")?.focus();
}

function closeInfoModal() {
  $("#infoModal")?.classList.add("hidden");
}

function updateStepVisibility() {
  const step1 = $("#step1");
  const step2 = $("#step2");
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
    [step1, step2, step3Options, step3Services, step4, step5, actionCard, summaryCard].forEach((el) =>
      el?.classList.add("hidden-step")
    );
    navActions?.classList.add("hidden-step");
    orderComplete?.classList.remove("hidden-step");
    return;
  }

  [step1, step2, step3Options, step3Services, actionCard].forEach((el) => {
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
  }
}

function goToPrevStep() {
  if (currentPhase === 1) return;
  currentPhase -= 1;
  updateStepVisibility();
}

function resetOrderCompleteUI() {
  orderCompleted = false;
  const orderComplete = $("#orderComplete");
  const navActions = document.querySelector(".nav-actions");
  ["step1", "step2", "step3Options", "step3Services", "step4", "step5", "stepFinal"].forEach((id) =>
    document.getElementById(id)?.classList.remove("hidden-step")
  );
  navActions?.classList.remove("hidden-step");
  orderComplete?.classList.add("hidden-step");
}

function showOrderComplete() {
  renderOrderCompleteDetails();
  orderCompleted = true;
  updateStepVisibility();
}

function getCustomerInfo() {
  return {
    name: $("#customerName")?.value.trim() || "",
    phone: $("#customerPhone")?.value.trim() || "",
    email: $("#customerEmail")?.value.trim() || "",
    memo: $("#customerMemo")?.value.trim() || "",
  };
}

function updateSendButtonEnabled() {
  const btn = $("#sendQuoteBtn");
  if (!btn) return;
  const customer = getCustomerInfo();
  const hasRequired = Boolean(customer.name && customer.phone && customer.email);
  const hasItems = state.items.length > 0;
  const onFinalStep = currentPhase === 3;
  const consentEl = document.getElementById("privacyConsent");
  const hasConsent = consentEl ? consentEl.checked : true;
  btn.disabled = !(hasRequired && hasItems && onFinalStep && hasConsent) || sendingEmail;
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
      lines.push(
        `${idx + 1}. ${item.typeName} x${item.quantity} | 크기 ${
          item.displaySize
        } | 옵션 ${item.optionsLabel} | 가공 ${item.servicesLabel || "-"} | 금액 ${item.total.toLocaleString()}원`
      );
    });
  }

  lines.push("");
  lines.push("[합계]");
  lines.push(`상판 금액 합계: ${materialsTotal.toLocaleString()}원`);
  lines.push(`총결제금액: ${grandTotal.toLocaleString()}원`);

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
  renderTable();
  renderSummary();
  updateSelectedTopTypeCard();
  updateSelectedTopAddonsDisplay();
  resetOrderCompleteUI();
  initEmailJS();
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
  $("#topTypeModal")?.classList.remove("hidden");
  $("#topTypeModalTitle")?.focus();
}

function closeTopTypeModal() {
  $("#topTypeModal")?.classList.add("hidden");
}

function openTopAddonModal() {
  $("#topAddonModal")?.classList.remove("hidden");
  $("#topAddonModalTitle")?.focus();
}

function closeTopAddonModal() {
  $("#topAddonModal")?.classList.add("hidden");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTop);
} else {
  initTop();
}
