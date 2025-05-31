/// <reference path="./types.ts" />
/// <reference path="./state.ts" />
/// <reference path="./selectors.ts" />
/// <reference path="./actionRecorder.ts" />

let recorderTooltip: HTMLDivElement | null = null;

async function createRecorderTooltip(): Promise<void> {
  if (recorderTooltip || document.querySelector("#recorder-tooltip")) return;
  try {
    const response = await fetch(chrome.runtime.getURL("tooltip.html"));
    const html = await response.text();
    const template = document.createElement("div");
    template.innerHTML = html;
    recorderTooltip = template.querySelector(
      "#recorder-tooltip"
    ) as HTMLDivElement;
    if (!recorderTooltip) throw new Error("Tooltip element not found");
    document.body.appendChild(recorderTooltip);
    document.addEventListener("mousemove", updateTooltipPosition);
  } catch (error) {
    console.error("Failed to create tooltip:", error);
  }
}

async function createStationaryTooltip(): Promise<void> {
  // Remove existing stationary tooltips
  const existing = document.querySelectorAll("#stationary-tooltip");
  existing.forEach((el) => el.remove());
  try {
    const response = await fetch(
      chrome.runtime.getURL("stationaryTooltip.html")
    );
    const html = await response.text();
    const template = document.createElement("div");
    template.innerHTML = html;
    const stationaryTooltip = template.querySelector(
      "#stationary-tooltip"
    ) as HTMLDivElement;
    if (!stationaryTooltip)
      throw new Error("Stationary tooltip element not found");
    document.body.appendChild(stationaryTooltip);

    const toggleButton = stationaryTooltip.querySelector(
      "#toggle-table-loop"
    ) as HTMLButtonElement;
    if (!toggleButton) return;

    // Toggle button click handler for table loop actions
    toggleButton.addEventListener("click", () => {
      switch (tableLoopState) {
        case TableLoopState.INACTIVE:
          tableLoopState = TableLoopState.SELECTING;
          break;
        case TableLoopState.SELECTING:
          tableLoopState = TableLoopState.INACTIVE;
          break;
        case TableLoopState.SELECTING_NEXT_BUTTON:
          tableLoopState = TableLoopState.INACTIVE;
          break;
        case TableLoopState.ACTIVE:
          if (selectedTable) {
            recordAction({
              type: "tableLoopEnd",
              selector: getUniqueSelector(selectedTable),
              timestamp: Date.now(),
            });
          }
          tableLoopState = TableLoopState.INACTIVE;
          selectedTable = null;
          break;
      }
      updateTableLoopButton();
    });
    updateTableLoopButton();
  } catch (error) {
    console.error("Failed to create stationary tooltip:", error);
  }
}

function removeRecorderTooltip(): void {
  if (recorderTooltip) {
    document.removeEventListener("mousemove", updateTooltipPosition);
    if (lastHighlightedElement) {
      lastHighlightedElement.classList.remove("recorder-highlight");
      lastHighlightedElement = null;
    }
    recorderTooltip.remove();
    recorderTooltip = null;
  }
}

function removeStationaryTooltip(): void {
  const tip = document.querySelector("#stationary-tooltip");
  if (tip) tip.remove();
}

function updateTooltipPosition(e: MouseEvent): void {
  if (!isRecording) return;
  if (recorderTooltip && !isTooltipFixed) {
    recorderTooltip.style.left = `${e.clientX + 10}px`;
    recorderTooltip.style.top = `${e.clientY + 10}px`;
  }
  const target = e.target as HTMLElement;

  if (lastHighlightedElement) {
    lastHighlightedElement.classList.remove("recorder-highlight");
    lastHighlightedElement = null;
  }
  if (lastHighlightedTable) {
    lastHighlightedTable.classList.remove("recorder-highlight-table");
    lastHighlightedTable = null;
  }

  if (tableLoopState === TableLoopState.SELECTING || isAltPressed) {
    const tableElement = findTableElement(target);
    if (tableElement) {
      tableElement.classList.add("recorder-highlight-table");
      lastHighlightedTable = tableElement;
    }
  } else if (isHighlightableElement(target)) {
    target.classList.add("recorder-highlight");
    lastHighlightedElement = target;
    if (isControlPressed) {
      fixTooltip(target);
    }
  }
}

function fixTooltip(target: HTMLElement): void {
  if (!recorderTooltip) return;
  isTooltipFixed = true;
  recorderTooltip.classList.add("fixed");
  const labelContainer = recorderTooltip.querySelector(
    ".label-container"
  ) as HTMLElement;
  labelContainer.style.display = "flex";
  setupLabelHandlers(target);
}

function unfixTooltip(): void {
  if (!recorderTooltip) return;
  isTooltipFixed = false;
  recorderTooltip.classList.remove("fixed");
  const labelContainer = recorderTooltip.querySelector(
    ".label-container"
  ) as HTMLElement;
  labelContainer.style.display = "none";
}

function setupLabelHandlers(target: HTMLElement): void {
  if (!recorderTooltip) return;
  const labelSelect = recorderTooltip.querySelector(
    "#label-select"
  ) as HTMLSelectElement;
  const customLabel = recorderTooltip.querySelector(
    "#custom-label"
  ) as HTMLInputElement;
  const saveButton = recorderTooltip.querySelector(
    "#save-label"
  ) as HTMLButtonElement;
  labelSelect.addEventListener("change", () => {
    if (labelSelect.value === "custom") {
      customLabel.style.display = "block";
      customLabel.focus();
    } else {
      customLabel.style.display = "none";
    }
  });
  saveButton.addEventListener("click", () => {
    const label =
      labelSelect.value === "custom" ? customLabel.value : labelSelect.value;
    if (!label) return;
    recordAction({
      type: "label",
      selector: getUniqueSelector(target),
      value: target.textContent?.trim() || "",
      label,
      timestamp: Date.now(),
    });
    isControlPressed = false;
    unfixTooltip();
  });
}

function updateTableLoopButton(): void {
  const toggleButton = document.querySelector(
    "#toggle-table-loop"
  ) as HTMLButtonElement;
  if (!toggleButton) return;
  switch (tableLoopState) {
    case TableLoopState.INACTIVE:
      toggleButton.style.background = "#007bff";
      toggleButton.textContent = "TableLoop";
      break;
    case TableLoopState.SELECTING:
      toggleButton.style.background = "#ffc107";
      toggleButton.textContent = "Select Table...";
      break;
    case TableLoopState.SELECTING_NEXT_BUTTON:
      toggleButton.style.background = "#ff6b35";
      toggleButton.textContent = "Select Next Button...";
      break;
    case TableLoopState.ACTIVE:
      toggleButton.style.background = "#28a745";
      toggleButton.textContent = "TableLoop (Active)";
      break;
  }
}
