function sendCommand(command: string) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id !== undefined) {
      chrome.tabs.sendMessage(tabs[0].id, { command });
    }
  });
}

document.getElementById('start')?.addEventListener('click', () => sendCommand('start'));
document.getElementById('stop')?.addEventListener('click', () => sendCommand('stop'));

function downloadJSON(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

document.getElementById("export")?.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id !== undefined) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { command: "getActions" },
        (response) => {
          if (response) {
            downloadJSON(response, "recorded_actions.json");
          }
        }
      );
    }
  });
});


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