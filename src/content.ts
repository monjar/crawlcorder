/// <reference path="./types.ts" />


let isRecording: boolean = false;

chrome.storage.local.get(['isRecording'], (result: Partial<Types.StorageData>) => {
  isRecording = result.isRecording || false;
  if (isRecording) {
    console.log('Initializing listeners due to existing recording state');
    initializeListeners();
  }
});

function getUniqueSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === "string") {
    return "." + el.className.trim().split(/\s+/).join(".");
  }
  return el.tagName.toLowerCase();
}

function handleClick(event: MouseEvent): void {
  if (!isRecording) return;
  const target = event.target as HTMLElement;
  const selector: string = getUniqueSelector(target);
  recordAction({ type: "click", selector, timestamp: Date.now() });
}

function handleInput(event: Event): void {
  if (!isRecording) return;
  const target = event.target as HTMLInputElement;
  const selector: string = getUniqueSelector(target);
  recordAction({
    type: "input",
    selector,
    value: target.value,
    timestamp: Date.now(),
  });
}

function recordAction(action: Types.Action): void {
  chrome.storage.local.get(
    ["actions"],
    (result: Partial<Types.StorageData>) => {
      const actions: Types.Action[] = result.actions || [];
      actions.push(action);
      chrome.storage.local.set({ actions });
    }
  );
}

function initializeListeners(): void {
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
}

function removeListeners(): void {
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
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

document.readyState === 'loading' 
  ? document.addEventListener('DOMContentLoaded', checkRecordingState)
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
    console.log("Recording state changed:", isRecording); // Add logging
    if (isRecording) {
      initializeListeners();
    } else {
      removeListeners();
    }
  }
});
