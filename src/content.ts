/// <reference path="./types.ts" />

let isRecording: boolean = false;
let lastHighlightedElement: HTMLElement | null = null;

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

function handleClick(event: MouseEvent): void {
  if (!isRecording) return;
  const target = event.target as HTMLElement;
  const selector: string = getUniqueSelector(target);
  if (isInteractiveClick(event)) {
    recordAction({ type: "click", selector, timestamp: Date.now() }, false);
  }
  else{
    // if(recorderTooltip)    
  }
}

function handleInput(event: Event): void {
  if (!isRecording) return;
  const target = event.target as HTMLInputElement;
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
    const response = await fetch(chrome.runtime.getURL('tooltip.html'));
    const html = await response.text();

    // Create temporary container to parse HTML
    const template = document.createElement('div');
    template.innerHTML = html;

    // Get the tooltip element
    recorderTooltip = template.querySelector('#recorder-tooltip') as HTMLDivElement;
    if (!recorderTooltip) throw new Error('Tooltip element not found');

    document.body.appendChild(recorderTooltip);
    document.addEventListener("mousemove", updateTooltipPosition);

  } catch (error) {
    console.error('Failed to create tooltip:', error);
  }
}

function removeRecorderTooltip() {
  if (recorderTooltip) {
    document.removeEventListener("mousemove", updateTooltipPosition);
    // Remove any existing highlights
    if (lastHighlightedElement) {
      lastHighlightedElement.classList.remove('recorder-highlight');
      lastHighlightedElement = null;
    }
    recorderTooltip.remove();
    recorderTooltip = null;
  }
}

function isHighlightableElement(element: HTMLElement): boolean {
  // Skip these elements
  const skipTags = ['BUTTON', 'INPUT', 'A', 'TEXTAREA', 'SELECT'];
  if (skipTags.includes(element.tagName)) return false;
  
  // Skip elements with interactive roles
  if (element.getAttribute('role') === 'button' || 
      element.getAttribute('role') === 'link') return false;
      
  // Skip containers with multiple children
  if (element.children.length > 0) return false;
  
  // Only highlight elements with text content
  const text = element.textContent?.trim();
  return !!text;
}

function updateTooltipPosition(e: MouseEvent) {
  if (!isRecording) return;
  
  if (recorderTooltip) {
    recorderTooltip.style.left = `${e.clientX + 10}px`;
    recorderTooltip.style.top = `${e.clientY + 10}px`;
  }

  // Handle element highlighting
  const target = e.target as HTMLElement;
  
  // Remove previous highlight if exists
  if (lastHighlightedElement) {
    lastHighlightedElement.classList.remove('recorder-highlight');
    lastHighlightedElement = null;
  }
  
  // Add highlight to new element if applicable
  if (isHighlightableElement(target)) {
    target.classList.add('recorder-highlight');
    lastHighlightedElement = target;
  }
}

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
