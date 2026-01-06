export const EMAILJS_CONFIG = {
  serviceId: "service_8iw3ovj",
  templateId: "template_iaid1xl",
  publicKey: "dUvt2iF9ciN8bvf6r",
};

export function formatPrice(value) {
  return Number(value || 0).toLocaleString();
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

export function getTieredPrice({ tiers = [], width, length, customLabel = "상담 안내" } = {}) {
  const match = tiers.find(
    (tier) => width <= tier.maxWidth && length <= tier.maxLength
  );
  if (!match) {
    return { price: 0, isCustom: true, label: customLabel };
  }
  return { price: match.price, isCustom: false, label: "" };
}

export function formatTierLabel(tiers = [], customLabel = "상담 안내") {
  const tierText = tiers
    .map(
      (tier) =>
        `${tier.maxWidth}×${tier.maxLength} 이하 ${tier.price.toLocaleString()}원`
    )
    .join(" / ");
  return `${tierText} / ${customLabel}`;
}

export function updateSizeErrors({
  widthId,
  lengthId,
  length2Id,
  widthErrorId,
  lengthErrorId,
  length2ErrorId,
  widthMin,
  widthMax,
  lengthMin,
  lengthMax,
  length2Min,
  length2Max,
  enableLength2 = false,
} = {}) {
  const widthEl = widthId ? document.getElementById(widthId) : null;
  const lengthEl = lengthId ? document.getElementById(lengthId) : null;
  const length2El = length2Id ? document.getElementById(length2Id) : null;
  const widthErrEl = widthErrorId ? document.getElementById(widthErrorId) : null;
  const lengthErrEl = lengthErrorId ? document.getElementById(lengthErrorId) : null;
  const length2ErrEl = length2ErrorId ? document.getElementById(length2ErrorId) : null;

  const clearField = (el, errEl) => {
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.remove("error");
    }
    el?.classList.remove("input-error");
  };

  clearField(widthEl, widthErrEl);
  clearField(lengthEl, lengthErrEl);
  clearField(length2El, length2ErrEl);

  let widthValid = true;
  let lengthValid = true;
  let length2Valid = true;

  if (widthEl?.value) {
    const widthVal = Number(widthEl.value);
    const minOk = !Number.isFinite(widthMin) || widthVal >= widthMin;
    const maxOk = !Number.isFinite(widthMax) || widthVal <= widthMax;
    if (!minOk || !maxOk) {
      widthValid = false;
      if (widthErrEl) {
        if (Number.isFinite(widthMin) && Number.isFinite(widthMax)) {
          widthErrEl.textContent = `폭: ${widthMin}~${widthMax}mm 범위로 입력해주세요.`;
        } else if (Number.isFinite(widthMin)) {
          widthErrEl.textContent = `폭: ${widthMin}mm 이상 입력해주세요.`;
        } else if (Number.isFinite(widthMax)) {
          widthErrEl.textContent = `폭: ${widthMax}mm 이하로 입력해주세요.`;
        }
        widthErrEl.classList.add("error");
      }
      widthEl.classList.add("input-error");
    }
  }

  if (lengthEl?.value) {
    const lengthVal = Number(lengthEl.value);
    const minOk = !Number.isFinite(lengthMin) || lengthVal >= lengthMin;
    const maxOk = !Number.isFinite(lengthMax) || lengthVal <= lengthMax;
    if (!minOk || !maxOk) {
      lengthValid = false;
      if (lengthErrEl) {
        if (Number.isFinite(lengthMin) && Number.isFinite(lengthMax)) {
          lengthErrEl.textContent = `길이: ${lengthMin}~${lengthMax}mm 범위로 입력해주세요.`;
        } else if (Number.isFinite(lengthMin)) {
          lengthErrEl.textContent = `길이: ${lengthMin}mm 이상 입력해주세요.`;
        } else if (Number.isFinite(lengthMax)) {
          lengthErrEl.textContent = `길이: ${lengthMax}mm 이하로 입력해주세요.`;
        }
        lengthErrEl.classList.add("error");
      }
      lengthEl.classList.add("input-error");
    }
  }

  if (enableLength2 && length2El?.value) {
    const length2Val = Number(length2El.value);
    const minOk = !Number.isFinite(length2Min) || length2Val >= length2Min;
    const maxOk = !Number.isFinite(length2Max) || length2Val <= length2Max;
    if (!minOk || !maxOk) {
      length2Valid = false;
      if (length2ErrEl) {
        if (Number.isFinite(length2Min) && Number.isFinite(length2Max)) {
          length2ErrEl.textContent = `길이2: ${length2Min}~${length2Max}mm 범위로 입력해주세요.`;
        } else if (Number.isFinite(length2Min)) {
          length2ErrEl.textContent = `길이2: ${length2Min}mm 이상 입력해주세요.`;
        } else if (Number.isFinite(length2Max)) {
          length2ErrEl.textContent = `길이2: ${length2Max}mm 이하로 입력해주세요.`;
        }
        length2ErrEl.classList.add("error");
      }
      length2El.classList.add("input-error");
    }
  }

  return {
    widthValid,
    lengthValid,
    length2Valid,
    valid: widthValid && lengthValid && length2Valid,
  };
}

export function bindSizeInputHandlers({
  widthId,
  lengthId,
  handlers = [],
  thicknessId,
  thicknessHandlers = [],
} = {}) {
  const widthEl = widthId ? document.getElementById(widthId) : null;
  const lengthEl = lengthId ? document.getElementById(lengthId) : null;
  handlers.forEach((fn) => {
    widthEl?.addEventListener("input", fn);
    lengthEl?.addEventListener("input", fn);
  });
  if (thicknessId) {
    const thicknessEl = document.getElementById(thicknessId);
    thicknessHandlers.forEach((fn) => thicknessEl?.addEventListener("change", fn));
  }
}

export function renderEstimateTable({
  items = [],
  tbodySelector = "#estimateTable tbody",
  emptySelector = "#estimateEmpty",
  getName,
  getTotalText,
  getDetailLines,
  onQuantityChange,
  onDelete,
} = {}) {
  const tbody = document.querySelector(tbodySelector);
  if (!tbody) return;
  const emptyBanner = emptySelector ? document.querySelector(emptySelector) : null;
  tbody.innerHTML = "";

  if (!items.length) {
    if (emptyBanner) emptyBanner.style.display = "block";
    return;
  }
  if (emptyBanner) emptyBanner.style.display = "none";

  items.forEach((item) => {
    const tr = document.createElement("tr");
    const nameText = getName ? getName(item) : "";
    const totalText = getTotalText ? getTotalText(item) : "-";
    tr.innerHTML = `
      <td>${nameText}</td>
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
        <div>총: ${totalText}</div>
      </td>
      <td><button data-id="${item.id}" class="deleteBtn">삭제</button></td>
    `;
    tbody.appendChild(tr);

    const detailLines = getDetailLines ? getDetailLines(item) : [];
    const detailRow = document.createElement("tr");
    detailRow.className = "detail-row";
    detailRow.innerHTML = `
      <td colspan="4">
        <div class="sub-detail">
          ${detailLines.map((line) => `<div class="detail-line">${line}</div>`).join("")}
        </div>
      </td>
    `;
    tbody.appendChild(detailRow);
  });

  tbody.querySelectorAll(".qty-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      const value = Math.max(1, Number(e.target.value) || 1);
      onQuantityChange?.(id, value);
    });
  });

  tbody.querySelectorAll(".deleteBtn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      onDelete?.(id);
    });
  });
}

export function createServiceModalController({
  modalId,
  titleId,
  bodyId,
  errorId,
  noteId,
  focusTarget,
  services,
  state,
  getDefaultServiceDetail,
  cloneServiceDetails,
  updateServiceSummary,
  openModal,
  closeModal,
  onRevertSelection,
  onAfterSave,
  onAfterRemove,
  onAfterClose,
} = {}) {
  let draft = null;
  let context = { serviceId: null, triggerCheckbox: null, mode: null };
  const createDefaultHole = () => ({
    edge: "left",
    distance: 100,
    verticalRef: "top",
    verticalDistance: 100,
  });

  const setError = (message = "") => {
    const errEl = errorId ? document.querySelector(errorId) : null;
    if (errEl) errEl.textContent = message || "";
  };

  const renderHoleModal = (serviceId) => {
    const body = bodyId ? document.querySelector(bodyId) : null;
    const srv = services?.[serviceId];
    if (!body || !srv) return;
    const normalized = srv.normalizeDetail(draft);
    const holes = Array.isArray(normalized?.holes) ? normalized.holes : [];
    draft = { ...normalized, holes: holes.map((h) => ({ ...h })) };

    const rowsHtml =
      holes.length > 0
        ? holes
            .map(
              (hole, idx) => `
                <div class="service-row">
                  <div class="service-row-header">
                    <span>${srv.label} ${idx + 1}</span>
                    <button type="button" class="ghost-btn remove-hole" data-index="${idx}">삭제</button>
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
            .join("")
        : `<div class="service-empty">등록된 위치가 없습니다. 아래의 "위치 추가"를 눌러주세요.</div>`;

    body.innerHTML = `
      <p class="service-option-tip">${srv.label} 위치를 원의 중심 기준으로 입력해주세요. 여러 개를 추가할 수 있습니다.</p>
      ${rowsHtml}
      <div class="service-actions">
        <button type="button" class="secondary-btn" data-add-hole>위치 추가</button>
      </div>
      <div>
        <label>추가 메모 (선택)</label>
        <textarea class="service-textarea" id="${noteId}">${draft?.note || ""}</textarea>
      </div>
    `;

    body.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const idx = Number(e.target.dataset.index);
        const field = e.target.dataset.field;
        if (Number.isNaN(idx) || !field) return;
        if (!draft.holes[idx]) {
          draft.holes[idx] = { edge: "left", distance: 100, verticalRef: "top", verticalDistance: 100 };
        }
        if (field === "edge") draft.holes[idx].edge = e.target.value === "right" ? "right" : "left";
        if (field === "distance") draft.holes[idx].distance = Number(e.target.value);
        if (field === "verticalRef")
          draft.holes[idx].verticalRef = e.target.value === "bottom" ? "bottom" : "top";
        if (field === "verticalDistance") draft.holes[idx].verticalDistance = Number(e.target.value);
      });
    });

    const noteEl = body.querySelector(`#${noteId}`);
    if (noteEl) {
      noteEl.addEventListener("input", (e) => {
        draft.note = e.target.value;
      });
    }

    const addBtn = body.querySelector("[data-add-hole]");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        draft.holes.push(createDefaultHole());
        renderHoleModal(serviceId);
      });
    }

    body.querySelectorAll(".remove-hole").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = Number(e.target.dataset.index);
        if (Number.isNaN(idx)) return;
        draft.holes.splice(idx, 1);
        renderHoleModal(serviceId);
      });
    });
  };

  const renderContent = (serviceId) => {
    const titleEl = titleId ? document.querySelector(titleId) : null;
    const srv = services?.[serviceId];
    if (titleEl) titleEl.textContent = srv?.label || "가공 옵션 설정";
    setError("");
    if (!draft) {
      draft = getDefaultServiceDetail?.(serviceId) || { note: "" };
    }
    if (srv?.hasDetail()) {
      renderHoleModal(serviceId);
      return;
    }
    const body = bodyId ? document.querySelector(bodyId) : null;
    if (body) {
      body.innerHTML = `<p class="service-option-tip">선택한 가공의 세부 설정을 입력해주세요.</p>`;
    }
  };

  const open = (serviceId, triggerCheckbox, mode = "change") => {
    const srv = services?.[serviceId];
    if (!srv?.hasDetail()) return;
    context = { serviceId, triggerCheckbox, mode };
    draft =
      cloneServiceDetails?.(state?.serviceDetails?.[serviceId]) ||
      getDefaultServiceDetail?.(serviceId) ||
      { note: "", holes: [] };
    renderContent(serviceId);
    openModal?.(modalId, { focusTarget });
  };

  const close = (revertSelection = true) => {
    closeModal?.(modalId);
    setError("");
    if (revertSelection && context.mode === "change" && context.triggerCheckbox) {
      context.triggerCheckbox.checked = false;
      context.triggerCheckbox.closest(".service-card")?.classList.remove("selected");
      if (state?.serviceDetails) {
        delete state.serviceDetails[context.serviceId];
      }
      updateServiceSummary?.(context.serviceId);
      onRevertSelection?.();
    }
    draft = null;
    context = { serviceId: null, triggerCheckbox: null, mode: null };
    onAfterClose?.();
  };

  const save = () => {
    const serviceId = context.serviceId;
    const srv = services?.[serviceId];
    if (!serviceId || !srv) return;
    setError("");
    if (srv.hasDetail()) {
      const validation = srv.validateDetail(draft);
      if (!validation.ok) {
        setError(validation.message || "세부 옵션을 확인해주세요.");
        return;
      }
      state.serviceDetails[serviceId] = cloneServiceDetails(validation.detail);
    } else {
      state.serviceDetails[serviceId] = srv.normalizeDetail
        ? cloneServiceDetails(srv.normalizeDetail(draft))
        : null;
    }
    updateServiceSummary?.(serviceId);
    onAfterSave?.();
    close(false);
  };

  const remove = () => {
    const serviceId = context.serviceId;
    if (!serviceId) return;
    if (context.triggerCheckbox) {
      context.triggerCheckbox.checked = false;
      context.triggerCheckbox.closest(".service-card")?.classList.remove("selected");
    }
    if (state?.serviceDetails) {
      delete state.serviceDetails[serviceId];
    }
    updateServiceSummary?.(serviceId);
    onAfterRemove?.();
    close(false);
  };

  return { open, close, save, remove };
}

export function renderSelectedCard({
  cardId,
  emptyTitle,
  emptyMeta,
  swatch,
  name,
  metaLines = [],
} = {}) {
  const cardEl = cardId ? document.querySelector(cardId) : null;
  if (!cardEl) return;
  if (!name) {
    cardEl.innerHTML = `
      <div class="material-visual placeholder-visual"></div>
      <div class="info">
        <div class="placeholder">${emptyTitle || ""}</div>
        <div class="meta">${emptyMeta || ""}</div>
      </div>
    `;
    return;
  }
  cardEl.innerHTML = `
    <div class="material-visual" style="background: ${swatch || "#ddd"}"></div>
    <div class="info">
      <div class="name">${name}</div>
      ${metaLines.map((line) => `<div class="meta">${line}</div>`).join("")}
    </div>
  `;
}

export function renderSelectedAddonChips({
  targetId,
  emptyText = "선택된 부자재 없음",
  addons = [],
  allItems = [],
  formatPrice,
  swatch = "#ddd",
} = {}) {
  const target = targetId ? document.getElementById(targetId) : null;
  if (!target) return;
  if (!addons.length) {
    target.innerHTML = `<div class="placeholder">${emptyText}</div>`;
    return;
  }
  const chips = addons
    .map((id) => allItems.find((i) => i.id === id))
    .filter(Boolean)
    .map(
      (item) => `
        <div class="addon-chip">
          <div class="material-visual" style="background:${swatch};"></div>
          <div class="info">
            <div class="name">${item.name}</div>
            <div class="meta">${formatPrice ? formatPrice(item.price) : item.price.toLocaleString()}원</div>
          </div>
        </div>
      `
    )
    .join("");
  target.innerHTML = chips;
}

export function updateServiceSummaryChip({
  serviceId,
  services,
  serviceDetails,
  formatSummaryText,
  emptyDetailText = "세부 옵션을 설정해주세요.",
  noDetailText = "추가 설정 없음",
  selector,
} = {}) {
  const summaryEl = document.querySelector(
    selector || `[data-service-summary="${serviceId}"]`
  );
  if (!summaryEl) return;
  const srv = services?.[serviceId];
  if (!srv) {
    summaryEl.textContent = emptyDetailText;
    return;
  }
  const detail = serviceDetails?.[serviceId];
  summaryEl.textContent = detail
    ? formatSummaryText?.(serviceId, detail) || emptyDetailText
    : srv.hasDetail()
    ? emptyDetailText
    : noDetailText;
}

export function initCollapsibleSections({
  toggleSelector = ".accordion-toggle",
  collapsedClass = "is-collapsed",
  openText = "접기",
  closedText = "열기",
} = {}) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(toggleSelector).forEach((btn) => {
    const targetId = btn.dataset.toggleTarget;
    const section = targetId ? document.getElementById(targetId) : null;
    if (!section) return;
    const openLabel = btn.dataset.openText || openText;
    const closedLabel = btn.dataset.closedText || closedText;
    const isCollapsed = section.classList.contains(collapsedClass);
    btn.textContent = isCollapsed ? closedLabel : openLabel;
    btn.setAttribute("aria-expanded", String(!isCollapsed));
    btn.addEventListener("click", () => {
      const nowCollapsed = section.classList.toggle(collapsedClass);
      btn.textContent = nowCollapsed ? closedLabel : openLabel;
      btn.setAttribute("aria-expanded", String(!nowCollapsed));
    });
  });
}

export function updatePreviewSummary({
  optionSelector,
  serviceSelector,
  optionSummarySelector = "#previewOptionSummary",
  serviceSummarySelector = "#previewServiceSummary",
  optionEmptyText = "옵션 선택 없음",
  serviceEmptyText = "가공 선택 없음",
} = {}) {
  if (typeof document === "undefined") return;
  const optionSummaryEl = document.querySelector(optionSummarySelector);
  const serviceSummaryEl = document.querySelector(serviceSummarySelector);
  if (!optionSummaryEl && !serviceSummaryEl) return;
  const optionCount = optionSelector
    ? document.querySelectorAll(optionSelector).length
    : 0;
  const serviceCount = serviceSelector
    ? document.querySelectorAll(serviceSelector).length
    : 0;
  if (optionSummaryEl) {
    optionSummaryEl.textContent = optionCount
      ? `옵션 ${optionCount}개 선택`
      : optionEmptyText;
  }
  if (serviceSummaryEl) {
    serviceSummaryEl.textContent = serviceCount
      ? `가공 ${serviceCount}개 선택`
      : serviceEmptyText;
  }
}

export function buildEstimateDetailLines({
  sizeText,
  optionsText,
  servicesText,
  materialLabel,
  materialCost,
  processingCost,
} = {}) {
  const lines = [];
  if (sizeText) lines.push(`사이즈 ${sizeText}`);
  if (optionsText) lines.push(`옵션 ${optionsText}`);
  if (servicesText) lines.push(`가공 ${servicesText}`);
  if (materialLabel && Number.isFinite(materialCost)) {
    lines.push(`${materialLabel} ${materialCost.toLocaleString()}원`);
  }
  if (Number.isFinite(processingCost)) {
    lines.push(`가공비 ${processingCost.toLocaleString()}원`);
  }
  return lines;
}
