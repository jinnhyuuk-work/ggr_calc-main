import { VAT_RATE, EMAILJS_CONFIG, initEmailJS } from "./shared.js";

const TOP_TYPES = [
  { id: "solid", name: "솔리드 상판", basePrice: 200000 },
  { id: "engineered", name: "엔지니어드 스톤", basePrice: 260000 },
  { id: "stainless", name: "스테인리스 상판", basePrice: 230000 },
];

const TOP_OPTIONS = [
  { id: "sink_cut", name: "싱크 타공", price: 30000 },
  { id: "faucet_hole", name: "수전 타공", price: 10000 },
  { id: "cooktop_cut", name: "쿡탑 타공", price: 20000 },
  { id: "edge_finish", name: "엣지 마감", price: 15000 },
];

let selectedTopType = "";
let currentPhase = 1; // 1: 상판 선택/입력, 2: 고객정보
const state = { items: [] };
let sendingEmail = false;
let orderCompleted = false;

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
  return { typeId, shape, width, length, length2, thickness, options };
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
  const { typeId, shape, width, length, length2, thickness, options } = input;
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
  const shapeFee = needsSecond ? 30000 : 0;
  const materialCost = base + optionPrice + shapeFee;
  const subtotal = materialCost;
  const vat = Math.round(subtotal * VAT_RATE);
  const total = Math.round(subtotal + vat);

  return {
    materialCost,
    processingCost: optionPrice + shapeFee,
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

function renderTopTypeCards() {
  const container = $("#topTypeCards");
  if (!container) return;
  container.innerHTML = "";
  TOP_TYPES.forEach((t) => {
    const label = document.createElement("label");
    label.className = `material-card${selectedTopType === t.id ? " selected" : ""}`;
    label.innerHTML = `
      <input type="radio" name="topType" value="${t.id}" ${selectedTopType === t.id ? "checked" : ""} />
      <div class="material-visual"></div>
      <div class="name">${t.name}</div>
      <div class="price">기본가 ${formatPrice(t.basePrice)}원</div>
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
    label.className = "material-card";
    label.innerHTML = `
      <input type="checkbox" value="${opt.id}" />
      <div class="material-visual"></div>
      <div class="name">${opt.name}</div>
      <div class="price">+${formatPrice(opt.price)}원</div>
    `;
    container.appendChild(label);
  });
  container.addEventListener("change", (e) => {
    const input = e.target.closest("input[type='checkbox']");
    if (!input) return;
    input.closest(".material-card")?.classList.toggle("selected", input.checked);
    refreshTopEstimate();
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
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.typeName}</td>
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
    const baseCost = Math.max(0, item.materialCost - item.processingCost);
    detailRow.innerHTML = `
      <td colspan="4">
        <div class="sub-detail">
          <div class="detail-line">사이즈 ${item.displaySize} · 옵션 ${item.optionsLabel}</div>
          <div class="detail-line">상판비 ${baseCost.toLocaleString()}원 · 가공비 ${item.processingCost.toLocaleString()}원 · VAT ${item.vat.toLocaleString()}원</div>
        </div>
      </td>
    `;
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
              `<p class="item-line">${idx + 1}. ${item.typeName} x${item.quantity} · 크기 ${
                item.displaySize
              } · 옵션 ${item.optionsLabel} · 금액 ${item.total.toLocaleString()}원</p>`
          )
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
    shape: input.shape,
    width: input.width,
    length: input.length,
    length2: input.length2,
    thickness: input.thickness,
    options: input.options,
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
    el.closest(".material-card")?.classList.remove("selected");
  });
  updateSelectedTopTypeCard();
  refreshTopEstimate();
  updateTopPreview(readTopInputs(), null);
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

  if (!type || !hasSize || !detail) {
    colorEl.style.background = "#ddd";
    colorEl.style.width = "120px";
    colorEl.style.height = "120px";
    textEl.textContent = "상판과 사이즈를 선택하면 미리보기가 표시됩니다.";
    return;
  }

  const swatchMap = {
    solid: "linear-gradient(135deg, #f5f5f5 0%, #d9d9d9 100%)",
    engineered: "linear-gradient(135deg, #f2f7ff 0%, #d6e4ff 100%)",
    stainless: "linear-gradient(135deg, #f0f0f0 0%, #c7c7c7 100%)",
  };
  colorEl.style.background = swatchMap[type.id] || "#ddd";

  const dominantLength = needsSecond ? Math.max(input.length || 0, input.length2 || 0) : input.length;
  const { w, h } = getPreviewDimensions(input.width, dominantLength, 180, 40);
  colorEl.style.width = `${w}px`;
  colorEl.style.height = `${h}px`;

  textEl.textContent = needsSecond
    ? `${type.name} / ${input.width}×${input.length} & ${input.width}×${input.length2}×${input.thickness}mm`
    : `${type.name} / ${input.width}×${input.length}×${input.thickness}mm`;
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
  });
  state.items[idx] = { ...item, quantity, total: detail.total * quantity, subtotal: detail.subtotal * quantity, vat: detail.vat * quantity, materialCost: detail.materialCost * quantity };
  renderTable();
  renderSummary();
}

function showInfoModal(message) {
  const modal = $("#infoModal");
  const msgEl = $("#infoMessage");
  if (msgEl) msgEl.textContent = message;
  modal?.classList.remove("hidden");
}

function closeInfoModal() {
  $("#infoModal")?.classList.add("hidden");
}

function updateStepVisibility() {
  const step1 = $("#step1");
  const step2 = $("#step2");
  const step3 = $("#step3");
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

  if (orderCompleted) {
    [step1, step2, step3, step5, actionCard, summaryCard].forEach((el) =>
      el?.classList.add("hidden-step")
    );
    navActions?.classList.add("hidden-step");
    orderComplete?.classList.remove("hidden-step");
    return;
  }

  [step1, step2, step3, actionCard].forEach((el) => {
    el?.classList.toggle("hidden-step", !showPhase1);
  });
  step5?.classList.toggle("hidden-step", !showPhase2);

  if (navPrev) {
    navPrev.classList.toggle("hidden-step", currentPhase === 1);
    navPrev.style.display = currentPhase === 1 ? "none" : "";
  }
  if (sendBtn) {
    sendBtn.classList.toggle("hidden-step", !showPhase2);
    sendBtn.style.display = showPhase2 ? "" : "none";
  }
  if (backToCenterBtn) {
    backToCenterBtn.classList.toggle("hidden-step", !showPhase1);
    backToCenterBtn.style.display = showPhase1 ? "" : "none";
  }
  if (navNext) {
    navNext.classList.toggle("hidden-step", showPhase2);
    navNext.style.display = showPhase2 ? "none" : "";
  }
}

function goToNextStep() {
  if (currentPhase === 1) {
    if (state.items.length === 0) {
      showInfoModal("상판을 담아주세요.");
      return;
    }
    currentPhase = 2;
    updateStepVisibility();
  }
}

function goToPrevStep() {
  if (currentPhase === 1) return;
  currentPhase = 1;
  updateStepVisibility();
}

function resetOrderCompleteUI() {
  orderCompleted = false;
  const orderComplete = $("#orderComplete");
  const navActions = document.querySelector(".nav-actions");
  ["step1", "step2", "step3", "step5", "stepFinal"].forEach((id) =>
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
  const onFinalStep = currentPhase === 2;
  btn.disabled = !(hasRequired && hasItems && onFinalStep) || sendingEmail;
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
        } | 옵션 ${item.optionsLabel} | 금액 ${item.total.toLocaleString()}원`
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
}

function initTop() {
  renderTopTypeCards();
  renderOptions();
  renderTable();
  renderSummary();
  updateSelectedTopTypeCard();
  resetOrderCompleteUI();
  initEmailJS();
  const priceEl = $("#topEstimateText");
  if (priceEl) priceEl.textContent = "상판 타입을 선택해주세요.";

  $("#calcTopBtn").addEventListener("click", addTopItem);
  $("#openTopTypeModal").addEventListener("click", openTopTypeModal);
  $("#closeTopTypeModal").addEventListener("click", closeTopTypeModal);
  $("#topTypeModalBackdrop")?.addEventListener("click", closeTopTypeModal);
  $("#nextStepsBtn")?.addEventListener("click", goToNextStep);
  $("#prevStepsBtn")?.addEventListener("click", goToPrevStep);
  $("#backToCenterBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
  $("#sendQuoteBtn")?.addEventListener("click", sendQuote);
  $("#closeInfoModal")?.addEventListener("click", closeInfoModal);
  $("#infoModalBackdrop")?.addEventListener("click", closeInfoModal);

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
  updateAddButtonState();
  updateStepVisibility();
  updateSendButtonEnabled();
  updateTopPreview(readTopInputs(), null);
}

function openTopTypeModal() {
  $("#topTypeModal")?.classList.remove("hidden");
}

function closeTopTypeModal() {
  $("#topTypeModal")?.classList.add("hidden");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTop);
} else {
  initTop();
}
