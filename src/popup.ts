const statusEl = document.getElementById("status");

function updateStatus() {
  chrome.storage.local.get(["isRecording"], (result) => {
    if (result.isRecording) {
      statusEl!.textContent = "● Recording";
      statusEl!.style.color = "red";
    } else {
      statusEl!.textContent = "Not Recording";
      statusEl!.style.color = "black";
    }
  });
}

function setRecording(isRecording: boolean) {
  chrome.storage.local.set({ isRecording });
  updateStatus();
}

function sendCommand(command: string) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id !== undefined) {
      chrome.tabs.sendMessage(tabs[0].id, { command }, () => {
        if (chrome.runtime.lastError) {
          console.warn('Could not send message to content script');
          return;
        }
        // Update storage after successful message delivery
        if (command === "start") {
          chrome.storage.local.set({ isRecording: true, actions: [] });
        } else if (command === "stop") {
          chrome.storage.local.set({ isRecording: false });
        }
        updateStatus();
      });
    }
  });
}

document.getElementById("start")?.addEventListener("click", () => {
  sendCommand("start");
  setRecording(true);
});

document.getElementById("stop")?.addEventListener("click", () => {
  sendCommand("stop");
  setRecording(false);
});

document.getElementById("view")?.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id !== undefined) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { command: "getActions" },
        (response) => {
          const output = document.getElementById("output");
          if (output && response) {
            output.textContent = JSON.stringify(response, null, 2);
          } else {
            output!.textContent = "No response or no actions recorded.";
          }
        }
      );
    }
  });
});

document.getElementById("export")?.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id !== undefined) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { command: "getActions" },
        (response) => {
          if (response) {
            const blob = new Blob([JSON.stringify(response, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "recorded_actions.json";
            a.click();
            URL.revokeObjectURL(url);
          }
        }
      );
    }
  });
});

document.getElementById("delete")?.addEventListener("click", () => {
  if (confirm("Are you sure you want to delete all recorded actions?")) {
    chrome.storage.local.set({ actions: [] }, () => {
      const output = document.getElementById("output");
      if (output) {
        output.textContent = "All recordings deleted.";
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  updateStatus();
});
