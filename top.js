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

function formatPrice(n) {
  return Number(n || 0).toLocaleString();
}

function validateTopInputs({ typeId, shape, width, length, thickness }) {
  if (!typeId) return "상판 타입을 선택해주세요.";
  if (!shape) return "주방 형태를 선택해주세요.";
  if (!width) return "폭을 입력해주세요.";
  if (!length) return "길이를 입력해주세요.";
  if (!thickness) return "두께를 입력해주세요.";
  return null;
}

function updateTopButtonState() {
  const btn = document.getElementById("calcTopBtn");
  if (!btn) return;
  const typeId = selectedTopType;
  const shape = document.getElementById("kitchenShape").value;
  const width = Number(document.getElementById("topWidth").value);
  const length = Number(document.getElementById("topLength").value);
  const thickness = Number(document.getElementById("topThickness").value);
  const err = validateTopInputs({ typeId, shape, width, length, thickness });
  btn.disabled = Boolean(err);
}

function renderTopTypeCards() {
  const container = document.getElementById("topTypeCards");
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
  container.addEventListener("click", (e) => {
    const input = e.target.closest('input[name="topType"]');
    if (!input) return;
    selectedTopType = input.value;
    updateSelectedTopTypeCard();
    renderTopTypeCards();
    closeTopTypeModal();
    refreshTopEstimate();
  });
}

function updateSelectedTopTypeCard() {
  const card = document.getElementById("selectedTopTypeCard");
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

function renderOptions() {
  const container = document.getElementById("topOptionCards");
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

function refreshTopEstimate() {
  const typeId = selectedTopType;
  const shape = document.getElementById("kitchenShape").value;
  const width = Number(document.getElementById("topWidth").value);
  const length = Number(document.getElementById("topLength").value);
  const thickness = Number(document.getElementById("topThickness").value);
  const options = Array.from(document.querySelectorAll("#topOptionCards input:checked")).map(
    (el) => el.value
  );

  const type = TOP_TYPES.find((t) => t.id === typeId);
  const err = validateTopInputs({ typeId, shape, width, length, thickness });
  if (err || !type) {
    document.getElementById("topEstimateText").textContent = err || "필수 정보를 입력해주세요.";
    updateTopButtonState();
    return;
  }

  const areaM2 = (width / 1000) * (length / 1000);
  const base = type.basePrice + areaM2 * 120000;
  const optionPrice = options.reduce((sum, id) => {
    const opt = TOP_OPTIONS.find((o) => o.id === id);
    return sum + (opt?.price || 0);
  }, 0);
  const shapeFee = shape === "l" ? 30000 : 0;
  const total = Math.round(base + optionPrice + shapeFee);

  document.getElementById("topEstimateText").textContent = `금액(예상): ${formatPrice(total)}원`;
  document.getElementById("summaryType").textContent = type.name;
  document.getElementById("summarySize").textContent = `${width}×${length}×${thickness}mm`;
  document.getElementById("summaryOptions").textContent =
    options.length === 0 ? "-" : options.join(", ");
  document.getElementById("summaryTotal").textContent = formatPrice(total);
  updateTopButtonState();
}

function calcTopEstimate() {
  refreshTopEstimate();
}

function openTopTypeModal() {
  document.getElementById("topTypeModal")?.classList.remove("hidden");
}

function closeTopTypeModal() {
  document.getElementById("topTypeModal")?.classList.add("hidden");
}

function initTop() {
  renderTopTypeCards();
  renderOptions();
  document.getElementById("calcTopBtn").addEventListener("click", calcTopEstimate);
  document.getElementById("openTopTypeModal").addEventListener("click", openTopTypeModal);
  document.getElementById("closeTopTypeModal").addEventListener("click", closeTopTypeModal);
  document.getElementById("topTypeModalBackdrop")?.addEventListener("click", closeTopTypeModal);
  updateSelectedTopTypeCard();
  const priceEl = document.getElementById("topEstimateText");
  if (priceEl) priceEl.textContent = "상판 타입을 선택해주세요.";
  ["topWidth", "topLength", "topThickness", "kitchenShape"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("input", refreshTopEstimate);
    el?.addEventListener("change", refreshTopEstimate);
  });
  updateTopButtonState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTop);
} else {
  initTop();
}
