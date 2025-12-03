import { MATERIALS, PROCESSING_SERVICES, PACKING_SETTINGS, ADDON_ITEMS } from "./data.js";

const VAT_RATE = 0.1; // 10% 부가세 (원하는 비율로 수정 가능)

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

// 1) 목재 금액 계산
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

// 2) 가공비 계산
function calcProcessingCost({ materialId, width, length, quantity, services }) {
  let processingCost = 0;

  if (services.includes("edge_sanding")) {
    const perimeterM = ((width + length) * 2) / 1000;
    processingCost +=
      perimeterM * PROCESSING_SERVICES.edge_sanding.pricePerMeter * quantity;
  }

  if (services.includes("round_corner")) {
    const corners = 4;
    processingCost +=
      corners * PROCESSING_SERVICES.round_corner.pricePerCorner * quantity;
  }

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

// 4) 포장비 계산
function calcPackingCost(totalWeightKg) {
  if (totalWeightKg === 0) return 0; // 아이템이 없으면 포장비 없음
  const { packingPricePerKg, basePackingPrice } = PACKING_SETTINGS;
  const raw = totalWeightKg * packingPricePerKg;
  return Math.max(Math.round(raw), basePackingPrice);
}

// 5) 배송비 계산 (예시: 무게 기준 구간제)
function calcShippingCost(totalWeightKg) {
  if (totalWeightKg === 0) return 0;

  if (totalWeightKg <= 10) return 4000;
  if (totalWeightKg <= 20) return 6000;
  if (totalWeightKg <= 30) return 8000;
  // 30kg 넘어가면 기본 + kg당 추가
  return 8000 + Math.ceil((totalWeightKg - 30) / 10) * 3000;
}

// 6) 한 아이템 전체 계산 (목재비 + 가공비 + 무게 + VAT 전까지)
function calcItemDetail(input) {
  const { materialId, width, length, thickness, quantity, services } = input;

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
  const materialsTotal = items.reduce((s, i) => s + i.materialCost, 0);
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
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const WIDTH_MIN = 100;
const WIDTH_MAX = 800;
const LENGTH_MIN = 200;
const LENGTH_MAX = 2400;

const state = {
  items: [], // {id, materialId, thickness, width, length, quantity, services, ...계산 결과}
  addons: [],
};
let stepsCollapsed = false;
const categories = Array.from(
  new Set(Object.values(MATERIALS).map((m) => m.category || "기타"))
);
let selectedCategory = categories[0];
let selectedMaterialId = "";

function renderServiceCards() {
  const container = $("#serviceCards");
  if (!container) return;
  container.innerHTML = "";

  Object.values(PROCESSING_SERVICES).forEach((srv) => {
    const label = document.createElement("label");
    label.className = "material-card";
    const priceText = srv.pricePerMeter
      ? `m당 ${srv.pricePerMeter.toLocaleString()}원`
      : srv.pricePerCorner
      ? `모서리당 ${srv.pricePerCorner.toLocaleString()}원`
      : "";
    label.innerHTML = `
      <input type="checkbox" name="service" value="${srv.id}" />
      <div class="material-visual" style="background: ${srv.swatch || "#eee"}"></div>
      <div class="name">${srv.label}</div>
      <div class="price">${priceText}</div>
      <div class="description">${srv.description || ""}</div>
    `;
    container.appendChild(label);
  });

  container.addEventListener("change", (e) => {
    if (e.target.name === "service") {
      const card = e.target.closest(".material-card");
      if (e.target.checked) card?.classList.add("selected");
      else card?.classList.remove("selected");
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
    });
    tabs.appendChild(btn);
  });
}

function renderMaterialCards() {
  const container = $("#materialCards");
  container.innerHTML = "";

  const list = Object.values(MATERIALS).filter(
    (mat) => (mat.category || "기타") === selectedCategory
  );

  list.forEach((mat) => {
    const label = document.createElement("label");
    label.className = `material-card${
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
    `;
    container.appendChild(label);
  });

  container.onclick = (e) => {
    const input = e.target.closest('input[name="material"]');
    if (!input) return;
    selectedMaterialId = input.value;
    updateThicknessOptions(selectedMaterialId);
    updateSelectedMaterialLabel();
    updatePreview();
    $$(".material-card").forEach((card) => card.classList.remove("selected"));
    input.closest(".material-card")?.classList.add("selected");
    closeMaterialModal();
  };
  if (selectedMaterialId) updateThicknessOptions(selectedMaterialId);
  updateSelectedMaterialLabel();
}

function renderAddonCards() {
  const container = $("#addonCards");
  if (!container) return;
  container.innerHTML = "";

  ADDON_ITEMS.forEach((item) => {
    const label = document.createElement("label");
    label.className = `material-card addon-card${
      state.addons.includes(item.id) ? " selected" : ""
    }`;
    label.innerHTML = `
      <input type="checkbox" value="${item.id}" ${state.addons.includes(item.id) ? "checked" : ""} />
      <div class="material-visual"></div>
      <div class="name">${item.name}</div>
      <div class="price">${item.price.toLocaleString()}원</div>
      <div class="description">${item.description || ""}</div>
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
    $$("#addonCards .material-card").forEach((card) => card.classList.remove("selected"));
    state.addons.forEach((id) => {
      const card = container.querySelector(`input[value="${id}"]`)?.closest(".material-card");
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

  return { materialId, thickness, width, length, quantity, services };
}

// 입력값 검증
function validateInputs(input) {
  const { materialId, thickness, width, length, quantity } = input;

  if (!materialId) return "목재를 선택해주세요.";
  if (!thickness) return "두께를 선택해주세요.";
  if (!width) return "폭을 입력해주세요.";
  if (width < WIDTH_MIN || width > WIDTH_MAX)
    return `폭은 ${WIDTH_MIN} ~ ${WIDTH_MAX}mm 사이여야 합니다.`;
  if (!length) return "길이를 입력해주세요.";
  if (length < LENGTH_MIN || length > LENGTH_MAX)
    return `길이는 ${LENGTH_MIN} ~ ${LENGTH_MAX}mm 사이여야 합니다.`;
  if (!quantity || quantity <= 0) return "수량은 1개 이상이어야 합니다.";

  const material = MATERIALS[materialId];
  if (!material.availableThickness?.includes(thickness)) {
    return `선택한 목재는 ${material.availableThickness.join(", ")}T만 가능합니다.`;
  }
  if (width < material.minWidth || width > material.maxWidth) {
    return `폭은 ${material.minWidth} ~ ${material.maxWidth}mm 사이여야 합니다.`;
  }
  if (length < material.minLength || length > material.maxLength) {
    return `길이는 ${material.minLength} ~ ${material.maxLength}mm 사이여야 합니다.`;
  }
  return null;
}

// 버튼: 목재담기
$("#addItemBtn").addEventListener("click", () => {
  const input = readCurrentInputs();
  const err = validateInputs(input);
  if (err) {
    showInfoModal(err);
    return;
  }

  const detail = calcItemDetail(input);

  state.items.push({
    id: crypto.randomUUID(),
    ...input,
    ...detail,
  });

  renderTable();
  renderSummary();
  $("#itemPriceDisplay").textContent = "금액: 0원";
  resetStepsAfterAdd();
});

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

  // 두께 선택 초기화
  const thicknessSelect = $("#thicknessSelect");
  if (thicknessSelect) {
    thicknessSelect.innerHTML = `<option value="">목재를 선택해주세요</option>`;
  }

  // 사이즈 입력 초기화
  const widthEl = $("#widthInput");
  const lengthEl = $("#lengthInput");
  if (widthEl) widthEl.value = "";
  if (lengthEl) lengthEl.value = "";

  // 가공 서비스 초기화
  document.querySelectorAll('input[name="service"]').forEach((input) => {
    input.checked = false;
    input.closest(".material-card")?.classList.remove("selected");
  });

  $("#itemPriceDisplay").textContent = "금액: 0원";

  validateSizeFields();
  updatePreview();
  updateModalCardPreviews();
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
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const step3 = document.getElementById("step3");
  const actionCard = document.querySelector(".action-card");
  const step4 = document.getElementById("step4");
  [step1, step2, step3, actionCard].forEach((el) => {
    if (el) el.classList.toggle("hidden-step", stepsCollapsed);
  });
  if (step4) step4.classList.toggle("hidden-step", !stepsCollapsed);
  const prevBtn = document.getElementById("prevStepsBtn");
  if (prevBtn) {
    prevBtn.classList.toggle("hidden-step", !stepsCollapsed);
    prevBtn.style.display = stepsCollapsed ? "" : "none";
  }

  if (scrollTarget) {
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function goToNextStep() {
  stepsCollapsed = true;
  const target = document.getElementById("step4") || document.getElementById("step3");
  updateStepVisibility(target);
}

function goToPrevStep() {
  stepsCollapsed = false;
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
    const servicesText = isAddon
      ? "-"
      : item.services
          .map((id) => PROCESSING_SERVICES[id]?.label || id)
          .join(", ") || "-";

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
            <div class="detail-line">목재비 ${item.materialCost.toLocaleString()}원 · 가공비 ${item.processingCost.toLocaleString()}원 · VAT ${item.vat.toLocaleString()}원</div>
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
    });
    state.items[idx] = { ...item, quantity, ...detail };
  }
  renderTable();
  renderSummary();
}
function renderSummary() {
  const summary = calcOrderSummary(state.items);

  $("#materialsTotal").textContent = summary.materialsTotal.toLocaleString();
  $("#totalWeight").textContent = summary.totalWeight.toFixed(2);
  $("#packingCost").textContent = summary.packingCost.toLocaleString();
  $("#grandTotal").textContent = summary.grandTotal.toLocaleString();

  // 필요하면 VAT/배송비도 화면에 추가
  const vatEl = document.getElementById("vatTotal");
  const shippingEl = document.getElementById("shippingCost");
  if (vatEl) vatEl.textContent = summary.vat.toLocaleString();
  if (shippingEl) shippingEl.textContent = summary.shippingCost.toLocaleString();

  const naverUnits = Math.ceil(summary.grandTotal / 1000);
  $("#naverUnits").textContent = naverUnits;
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
  // 자동 선택
  if (mat.availableThickness?.length) {
    select.value = mat.availableThickness[0];
  }
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

  let widthValid = true;
  let lengthValid = true;

  const widthHint = `폭: ${WIDTH_MIN}~${WIDTH_MAX}mm`;
  const lengthHint = `길이: ${LENGTH_MIN}~${LENGTH_MAX}mm`;

  widthErrEl.textContent = widthHint;
  lengthErrEl.textContent = lengthHint;
  widthErrEl.classList.remove("error");
  lengthErrEl.classList.remove("error");
  widthEl.classList.remove("input-error");
  lengthEl.classList.remove("input-error");

  if (widthEl.value && (widthVal < WIDTH_MIN || widthVal > WIDTH_MAX)) {
    widthValid = false;
    widthErrEl.textContent = `${widthHint} 범위로 입력해주세요.`;
    widthErrEl.classList.add("error");
    widthEl.classList.add("input-error");
  }

  if (lengthEl.value && (lengthVal < LENGTH_MIN || lengthVal > LENGTH_MAX)) {
    lengthValid = false;
    lengthErrEl.textContent = `${lengthHint} 범위로 입력해주세요.`;
    lengthErrEl.classList.add("error");
    lengthEl.classList.add("input-error");
  }

  const disable = !widthValid || !lengthValid;
  if (calcBtn) calcBtn.disabled = disable;
  addBtn.disabled = disable;
}

function autoCalculatePrice() {
  const input = readCurrentInputs();
  const err = validateInputs(input);
  if (err) {
    $("#itemPriceDisplay").textContent = err;
    return;
  }
  const detail = calcItemDetail(input);
  $("#itemPriceDisplay").textContent =
    `금액(부가세 포함): ${detail.total.toLocaleString()}원 ` +
    `(목재비 ${detail.materialCost.toLocaleString()} + 가공비 ${detail.processingCost.toLocaleString()})`;
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
    textEl.textContent = "목재와 사이즈를 선택하면 미리보기가 표시됩니다.";
    return;
  }
  colorEl.style.background = mat.swatch || "#ddd";
  const { w, h } = getPreviewDimensions(input.width, input.length, 180, 40);
  colorEl.style.width = `${w}px`;
  colorEl.style.height = `${h}px`;
  textEl.textContent = `${mat.name} / ${input.thickness}T / ${input.width}×${input.length}mm`;
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
        <div class="placeholder">선택된 목재 없음</div>
        <div class="meta">목재를 선택해주세요.</div>
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

function openMaterialModal() {
  $("#materialModal")?.classList.remove("hidden");
}

function closeMaterialModal() {
  $("#materialModal")?.classList.add("hidden");
}

function updateModalCardPreviews() {
  const selectedVisual = document.querySelector("#selectedMaterialCard .material-visual");
  if (selectedVisual) {
    selectedVisual.style.width = "";
    selectedVisual.style.height = "";
  }
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
  updateSelectedAddonsDisplay();
  updateStepVisibility();

  $("#closeInfoModal")?.addEventListener("click", closeInfoModal);
  $("#infoModalBackdrop")?.addEventListener("click", closeInfoModal);
  $("#nextStepsBtn")?.addEventListener("click", goToNextStep);
  $("#prevStepsBtn")?.addEventListener("click", goToPrevStep);

  $("#widthInput").addEventListener("input", validateSizeFields);
  $("#lengthInput").addEventListener("input", validateSizeFields);
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
    autoCalculatePrice();
    updatePreview();
    updateSelectedMaterialLabel();
  });
  $("#openMaterialModal").addEventListener("click", openMaterialModal);
  $("#closeMaterialModal").addEventListener("click", closeMaterialModal);
  $("#materialModalBackdrop")?.addEventListener("click", closeMaterialModal);
  document.addEventListener("change", (e) => {
    if (e.target.name === "material" || e.target.name === "service") {
      autoCalculatePrice();
      updatePreview();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("load", init);
} else {
  init();
}
