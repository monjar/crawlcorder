type Action = {
  type: "click" | "input";
  selector: string;
  value?: string;
  timestamp: number;
};

let isRecording = false;

function getUniqueSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === "string") {
    return "." + el.className.trim().split(/\s+/).join(".");
  }
  return el.tagName.toLowerCase();
}

function handleClick(event: MouseEvent) {
  if (!isRecording) return;
  const target = event.target as HTMLElement;
  const selector = getUniqueSelector(target);
  recordAction({ type: "click", selector, timestamp: Date.now() });
}

function handleInput(event: Event) {
  if (!isRecording) return;
  const target = event.target as HTMLInputElement;
  const selector = getUniqueSelector(target);
  recordAction({
    type: "input",
    selector,
    value: target.value,
    timestamp: Date.now(),
  });
}

function recordAction(action: Action) {
  chrome.storage.local.get(["actions"], (result) => {
    const actions: Action[] = result.actions || [];
    actions.push(action);
    chrome.storage.local.set({ actions });
  });
}

// Initialize event listeners
function initializeListeners() {
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
}

// Remove event listeners
function removeListeners() {
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
}

// Check recording state immediately when script loads
function checkRecordingState() {
  chrome.storage.local.get(['isRecording'], (result) => {
    isRecording = result.isRecording || false;
    if (isRecording) {
      initializeListeners();
    }
  });
}

// Run state check when page loads
document.readyState === 'loading' 
  ? document.addEventListener('DOMContentLoaded', checkRecordingState)
  : checkRecordingState();

// Message listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.command === "start") {
    isRecording = true;
    initializeListeners();
    chrome.storage.local.set({ actions: [] });
  } else if (message.command === "stop") {
    isRecording = false;
    removeListeners();
  } else if (message.command === "getActions") {
    chrome.storage.local.get(["actions"], (result) => {
      sendResponse(result.actions || []);
    });
    return true;
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.isRecording) {
    isRecording = changes.isRecording.newValue;
    if (isRecording) {
      initializeListeners();
    } else {
      removeListeners();
    }
  }
});
