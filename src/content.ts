/// <reference path="./types.ts" />

let isRecording: boolean = false;
let lastHighlightedElement: HTMLElement | null = null;
let isControlPressed: boolean = false;
let isTooltipFixed: boolean = false;
let isAltPressed: boolean = false;
let selectedTable: HTMLElement | null = null;
let lastHighlightedTable: HTMLElement | null = null;

chrome.storage.local.get(
  ["isRecording"],
  (result: Partial<Types.StorageData>) => {
    isRecording = result.isRecording || false;
    if (isRecording) {
      console.log("Initializing listeners due to existing recording state");
      initializeListeners();
    }
  }
);

function getUniqueSelector(el: HTMLElement): string {
  // Base case - if element has ID, it's already unique
  if (el.id) {
    return `#${el.id}`;
  }

  // Get the path segments from element to root
  const segments: string[] = [];
  let currentEl: HTMLElement | null = el;

  while (currentEl && currentEl !== document.body) {
    // Start with the element tag
    let segment = currentEl.tagName.toLowerCase();

    // Add class names if they exist
    if (currentEl.className && typeof currentEl.className === "string") {
      segment += "." + currentEl.className.trim().split(/\s+/).join(".");
    }

    // Add position among siblings of same type
    const siblings = Array.from(currentEl.parentElement?.children || []);
    const similarSiblings = siblings.filter(
      (sibling) =>
        sibling.tagName === currentEl?.tagName &&
        sibling.className === currentEl?.className
    );

    if (similarSiblings.length > 1) {
      const index = similarSiblings.indexOf(currentEl) + 1;
      segment += `:nth-of-type(${index})`;
    }

    segments.unshift(segment);
    currentEl = currentEl.parentElement;
  }

  // Join all segments with > to ensure direct child relationship
  return segments.join(" > ");
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
    if (current.classList.contains('ignore-recorder')) {
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

  if (isAltPressed) {
    const tableElement = findTableElement(target);
    if (tableElement) {
      selectedTable = tableElement;
      // Wait for possible next button selection
      return;
    }
    // If we already have a table and this is a clickable element
    else if (selectedTable && isInteractiveClick(event)) {
      recordAction({
        type: "tableLoop",
        selector: getUniqueSelector(selectedTable),
        timestamp: Date.now()
      }, false);
      recordAction({
        type: "tablePaginationNext",
        selector: getUniqueSelector(target),
        timestamp: Date.now()
      }, false);
      selectedTable = null;
      isAltPressed = false;
    }
  } else if (isInteractiveClick(event)) {
    recordAction({ 
      type: "click", 
      selector: getUniqueSelector(target), 
      timestamp: Date.now() 
    }, false);
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

function initializeListeners(): void {
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
  createRecorderTooltip();
}

function removeListeners(): void {
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
  removeRecorderTooltip();
}

function checkRecordingState(): void {
  chrome.storage.local.get(
    ["isRecording"],
    (result: Partial<Types.StorageData>) => {
      isRecording = result.isRecording || false;
      if (isRecording) {
        initializeListeners();
      }
    }
  );
}

let recorderTooltip: HTMLDivElement | null = null;

async function createRecorderTooltip(): Promise<void> {
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

  // Skip these elements
  const skipTags = ["BUTTON", "INPUT", "A", "TEXTAREA", "SELECT"];
  if (skipTags.includes(element.tagName)) return false;

  // Skip elements with interactive roles
  if (
    element.getAttribute("role") === "button" ||
    element.getAttribute("role") === "link"
  )
    return false;

  // Skip containers with multiple children
  if (element.children.length > 0) return false;

  // Only highlight elements with text content
  const text = element.textContent?.trim();
  return !!text;
}

function findTableElement(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (current.tagName === 'TABLE' || 
        current.getAttribute('role') === 'table' ||
        current.classList.contains('table')) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function updateTooltipPosition(e: MouseEvent) {
  if (!isRecording) return;
  
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

  // Handle table highlighting when Alt is pressed
  if (isAltPressed) {
    const tableElement = findTableElement(target);
    if (tableElement) {
      tableElement.classList.add("recorder-highlight-table");
      lastHighlightedTable = tableElement;
    }
  }
  // Normal element highlighting when not in table selection mode
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

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Alt') {
    isAltPressed = true;
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e: KeyboardEvent) => {
  if (e.key === 'Alt') {
    isAltPressed = false;
    if (lastHighlightedTable) {
      lastHighlightedTable.classList.remove("recorder-highlight-table");
      lastHighlightedTable = null;
    }
    // If we have both table and next button, record the actions
    if (selectedTable) {
      recordAction({
        type: "tableLoop",
        selector: getUniqueSelector(selectedTable),
        timestamp: Date.now()
      }, false);
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

// Make sure storage listener is working
chrome.storage.onChanged.addListener((changes: Types.StorageChanges): void => {
  if (changes.isRecording) {
    isRecording = changes.isRecording.newValue;
    console.log("Recording state changed:", isRecording);
    if (isRecording) {
      initializeListeners();
    } else {
      removeListeners();
    }
  }
});

