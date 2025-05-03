/// <reference path="./types.ts" />

let isRecording: boolean = false;
let lastHighlightedElement: HTMLElement | null = null;
let isControlPressed: boolean = false;
let isTooltipFixed: boolean = false;
let isAltPressed: boolean = false;
let selectedTable: HTMLElement | null = null;
let lastHighlightedTable: HTMLElement | null = null;

// Add near the top of the file with other state variables
enum TableLoopState {
  INACTIVE,
  SELECTING,
  ACTIVE,
}

// Replace the boolean state with enum
let tableLoopState: TableLoopState = TableLoopState.INACTIVE;

chrome.storage.local.get(
  ["isRecording"],
  (result: Partial<Types.StorageData>) => {
    if (isRecording && result.isRecording) return;
    isRecording = result.isRecording || false;
    if (isRecording) {
      console.log("Initializing listeners due to existing recording state");
      initializeListeners();
    }
  }
);

function getUniqueSelector(element: HTMLElement): string {
  const root = element.getRootNode() as HTMLElement;
  if (!element || element === root) return "";

  /* ── 1. Unique id ─────────────────────────────── */
  const id = element.getAttribute("id");
  if (id && root.querySelectorAll(`#${CSS.escape(id)}`).length === 1) {
    return `#${CSS.escape(id)}`;
  }

  /* ── 2. Tag + class combo ─────────────────────── */
  const tag = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).map(CSS.escape);
  let selector = classes.length ? `${tag}.${classes.join(".")}` : tag;

  /* ── 3. Add :nth‑of‑type if still not unique ──── */
  if (root.querySelectorAll(selector).length !== 1) {
    const parent = element.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (sib) => sib.tagName === element.tagName
      );
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(element) + 1; // 1‑based
        selector += `:nth-of-type(${index})`;
      }
    }
  }

  if (root.querySelectorAll(selector).length === 1) {
    return selector; // unique → done
  }

  /* ── 4. Prepend ancestor’s selector recursively ─ */
  const parentSel = getUniqueSelector(element.parentElement!);
  return parentSel ? `${parentSel} > ${selector}` : selector;
}

function isInteractiveClick(event: MouseEvent): boolean {
  const target = event.target as HTMLElement;

  const tag = target.tagName.toLowerCase();

  if (tag === "button" || tag === "a" || tag === "input") return true;
  if (
    target.getAttribute("role") === "button" ||
    target.getAttribute("role") === "link"
  )
    return true;
  if (target.getAttribute("onclick")) return true;

  const hasClickCursor = getComputedStyle(target).cursor === "pointer";
  const isFocusable = target.tabIndex >= 0;

  return hasClickCursor || isFocusable;
}

function shouldIgnoreElement(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.classList.contains("ignore-recorder")) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function handleClick(event: MouseEvent): void {
  if (!isRecording) return;
  const target = event.target as HTMLElement;
  if (shouldIgnoreElement(target)) return;

  // Handle table selection mode
  if (tableLoopState === TableLoopState.SELECTING) {
    const tableElement = findTableElement(target);
    if (tableElement) {
      selectedTable = tableElement;
      tableLoopState = TableLoopState.ACTIVE;
      // Send TableLoopStart action
      recordAction({
        type: "tableLoopStart",
        selector: getUniqueSelector(tableElement),
        timestamp: Date.now(),
      });
      updateTableLoopButton();
      return;
    }
  }

  // For general clicks (when not in SELECTING state)
  if (isInteractiveClick(event)) {
    recordAction({
      type: "click",
      selector: getUniqueSelector(target),
      timestamp: Date.now(),
    });
  }
}

function handleInput(event: Event): void {
  if (!isRecording) return;
  const target = event.target as HTMLInputElement;

  // Skip if inputting in extension UI
  if (shouldIgnoreElement(target)) return;

  const selector: string = getUniqueSelector(target);
  recordAction(
    {
      type: "input",
      selector,
      value: target.value,
      timestamp: Date.now(),
    },
    true
  );
}

function recordAction(
  action: Types.Action,
  shouldUpdateLast: boolean = false
): void {
  chrome.storage.local.get(
    ["actions"],
    (result: Partial<Types.StorageData>) => {
      const actions: Types.Action[] = result.actions || [];
      while (shouldUpdateLast && actions.length > 0) {
        const lastAction = actions[actions.length - 1];
        if (
          lastAction.type === action.type &&
          lastAction.selector === action.selector
        ) {
          actions.pop();
        } else {
          break;
        }
      }
      actions.push(action);
      chrome.storage.local.set({ actions });
    }
  );
}

async function initializeListeners(): Promise<void> {
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);

  await createRecorderTooltip();
  await createStationaryTooltip(); // This will be the only place creating the stationary tooltip
}

// Add this function
function removeStationaryTooltip(): void {
  const stationaryTooltip = document.querySelector("#stationary-tooltip");
  if (stationaryTooltip) {
    stationaryTooltip.remove();
  }
}

// Update removeListeners function
function removeListeners(): void {
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
  removeRecorderTooltip();
  removeStationaryTooltip(); // Add this line
}

function checkRecordingState(): void {
  chrome.storage.local.get(
    ["isRecording"],
    (result: Partial<Types.StorageData>) => {
      if (isRecording && result.isRecording) return;
      isRecording = result.isRecording || false;

      console.log("checkRecordingState...");
      if (isRecording) {
        initializeListeners();
      }
    }
  );
}

let recorderTooltip: HTMLDivElement | null = null;

async function createRecorderTooltip(): Promise<void> {
  // Check if tooltip already exists
  if (recorderTooltip || document.querySelector("#recorder-tooltip")) {
    return;
  }

  try {
    // Fetch the tooltip HTML
    const response = await fetch(chrome.runtime.getURL("tooltip.html"));
    const html = await response.text();

    // Create temporary container to parse HTML
    const template = document.createElement("div");
    template.innerHTML = html;

    // Get the tooltip element
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
  // Remove any existing tooltips first
  const existingTooltips = document.querySelectorAll("#stationary-tooltip");
  existingTooltips.forEach((tooltip) => tooltip.remove());
  console.warn("CREATING STATIONARY TOOLTIP");
  try {
    // Fetch the tooltip HTML
    const response = await fetch(
      chrome.runtime.getURL("stationaryTooltip.html")
    );
    const html = await response.text();

    // Create temporary container to parse HTML
    const template = document.createElement("div");
    template.innerHTML = html;

    // Get the stationary tooltip element
    const stationaryTooltip = template.querySelector(
      "#stationary-tooltip"
    ) as HTMLDivElement;
    if (!stationaryTooltip)
      throw new Error("Stationary tooltip element not found");

    // Add it to the document
    document.body.appendChild(stationaryTooltip);

    // Set up the button click handler
    const toggleButton = stationaryTooltip.querySelector(
      "#toggle-table-loop"
    ) as HTMLButtonElement;
    if (!toggleButton) return;

    toggleButton.addEventListener("click", () => {
      switch (tableLoopState) {
        case TableLoopState.INACTIVE:
          tableLoopState = TableLoopState.SELECTING;
          break;
        case TableLoopState.SELECTING:
          tableLoopState = TableLoopState.INACTIVE;
          break;
        case TableLoopState.ACTIVE:
          // Send TableLoopEnd action before resetting
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

    // Initialize button state
    updateTableLoopButton();
  } catch (error) {
    console.error("Failed to create stationary tooltip:", error);
  }
}

function removeRecorderTooltip() {
  if (recorderTooltip) {
    document.removeEventListener("mousemove", updateTooltipPosition);
    // Remove any existing highlights
    if (lastHighlightedElement) {
      lastHighlightedElement.classList.remove("recorder-highlight");
      lastHighlightedElement = null;
    }
    recorderTooltip.remove();
    recorderTooltip = null;
  }
}

function isHighlightableElement(element: HTMLElement): boolean {
  // Skip extension UI elements
  if (shouldIgnoreElement(element)) return false;

  // Skip containers with multiple children
  if (element.children.length > 0) return false;

  // Only highlight elements with text content
  const text = element.textContent?.trim();
  return !!text;
}

function findTableElement(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (
      current.tagName === "TABLE" ||
      current.getAttribute("role") === "table" ||
      current.classList.contains("table")
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function updateTooltipPosition(e: MouseEvent) {
  if (!isRecording) return;

  // Handle tooltip position
  if (recorderTooltip && !isTooltipFixed) {
    recorderTooltip.style.left = `${e.clientX + 10}px`;
    recorderTooltip.style.top = `${e.clientY + 10}px`;
  }

  const target = e.target as HTMLElement;

  // Remove previous highlights
  if (lastHighlightedElement) {
    lastHighlightedElement.classList.remove("recorder-highlight");
    lastHighlightedElement = null;
  }
  if (lastHighlightedTable) {
    lastHighlightedTable.classList.remove("recorder-highlight-table");
    lastHighlightedTable = null;
  }

  // Handle table highlighting during SELECTING state or when Alt is pressed
  if (tableLoopState === TableLoopState.SELECTING || isAltPressed) {
    const tableElement = findTableElement(target);
    if (tableElement) {
      tableElement.classList.add("recorder-highlight-table");
      lastHighlightedTable = tableElement;
    }
  }
  // Normal element highlighting when not in SELECTING state
  else if (isHighlightableElement(target)) {
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

    recordAction(
      {
        type: "label",
        selector: getUniqueSelector(target),
        value: target.textContent?.trim() || "",
        label,
        timestamp: Date.now(),
      },
      false
    );
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
    case TableLoopState.ACTIVE:
      toggleButton.style.background = "#28a745";
      toggleButton.textContent = "TableLoop (Active)";
      break;
  }
}

const releaseTooltip = () => {
  isControlPressed = false;

  unfixTooltip();
};

document.addEventListener("keyup", (e: KeyboardEvent) => {
  if (e.key === "Control") {
    if (isControlPressed) {
      releaseTooltip();
    } else {
      isControlPressed = true;
    }
  }
});

document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Alt") {
    isAltPressed = true;
    e.preventDefault();
  }
});

document.addEventListener("keyup", (e: KeyboardEvent) => {
  if (e.key === "Alt") {
    isAltPressed = false;
    if (lastHighlightedTable) {
      lastHighlightedTable.classList.remove("recorder-highlight-table");
      lastHighlightedTable = null;
    }
    // If we have both table and next button, record the actions
    if (selectedTable) {
      recordAction(
        {
          type: "tableLoopStart",
          selector: getUniqueSelector(selectedTable),
          timestamp: Date.now(),
        },
        false
      );
      selectedTable = null;
    }
  }
});

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", checkRecordingState)
  : checkRecordingState();

chrome.runtime.onMessage.addListener(
  (
    message: Types.MessageCommand,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: Types.Action[]) => void
  ): boolean | undefined => {
    if (message.command === "start") {
      isRecording = true;
      console.log("Starting to record actions...");
      initializeListeners();
    } else if (message.command === "stop") {
      isRecording = false;
      removeListeners();
    } else if (message.command === "getActions") {
      chrome.storage.local.get(
        ["actions"],
        (result: Partial<Types.StorageData>) => {
          sendResponse(result.actions || []);
        }
      );
      return true;
    }
  }
);

// // Make sure storage listener is working
// chrome.storage.onChanged.addListener((changes: Types.StorageChanges): void => {
//   if (changes.isRecording) {
//     isRecording = changes.isRecording.newValue;
//     console.log("Recording state changed:", isRecording);
//     if (isRecording) {
//       initializeListeners();
//     } else {
//       removeListeners();
//     }
//   }
// });
