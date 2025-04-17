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
    const similarSiblings = siblings.filter(sibling => 
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


function handleClick(event: MouseEvent): void {
  if (!isRecording) return;
  const target = event.target as HTMLElement;
  const selector: string = getUniqueSelector(target);
  recordAction({ type: "click", selector, timestamp: Date.now() }, false);
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
  }, true);
}

function recordAction(action: Types.Action, shouldUpdateLast: boolean=false): void {
  chrome.storage.local.get(
    ["actions"],
    (result: Partial<Types.StorageData>) => {
      const actions: Types.Action[] = result.actions || [];
      while(shouldUpdateLast && actions.length > 0) {
        const lastAction = actions[actions.length - 1];
        if (lastAction.type === action.type && lastAction.selector === action.selector) {
          actions.pop();
        }
        else {
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
    console.log("Recording state changed:", isRecording);
    if (isRecording) {
      initializeListeners();
    } else {
      removeListeners();
    }
  }
});
