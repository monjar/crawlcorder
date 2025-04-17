function sendCommand(command: string) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id !== undefined) {
      chrome.tabs.sendMessage(tabs[0].id, { command });
    }
  });
}

document.getElementById('start')?.addEventListener('click', () => sendCommand('start'));
document.getElementById('stop')?.addEventListener('click', () => sendCommand('stop'));

document.getElementById('view')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id !== undefined) {
      chrome.tabs.sendMessage(tabs[0].id, { command: 'getActions' }, (response) => {
        const output = document.getElementById('output');
        if (output) {
          output.textContent = JSON.stringify(response, null, 2);
        }
      });
    }
  });
});