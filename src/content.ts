type Action = {
  type: 'click' | 'input';
  selector: string;
  value?: string;
  timestamp: number;
};

let isRecording = false;
const actions: Action[] = [];

function getUniqueSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).join('.');
    return `.${classes}`;
  }
  return el.tagName.toLowerCase();
}

function handleClick(event: MouseEvent) {
  if (!isRecording) return;
  const target = event.target as HTMLElement;
  const selector = getUniqueSelector(target);
  actions.push({
    type: 'click',
    selector,
    timestamp: Date.now()
  });
  saveActions();
}

function handleInput(event: Event) {
  if (!isRecording) return;
  const target = event.target as HTMLInputElement;
  const selector = getUniqueSelector(target);
  actions.push({
    type: 'input',
    selector,
    value: target.value,
    timestamp: Date.now()
  });
  saveActions();
}

function saveActions() {
  chrome.storage.local.set({ actions });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.command === 'start') {
    isRecording = true;
    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleInput, true);
    actions.length = 0;
  } else if (message.command === 'stop') {
    isRecording = false;
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('input', handleInput, true);
  } else if (message.command === 'getActions') {
    chrome.storage.local.get(['actions'], (data) => {
      sendResponse(data.actions || []);
    });
    return true;
  }
});