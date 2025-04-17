chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  chrome.storage.local.set({ isRecording: false, actions: [] });
});

// Inject content script into existing tabs when extension is installed/updated
chrome.tabs.query({ url: '<all_urls>' }, (tabs) => {
  tabs.forEach(tab => {
    if (tab.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    }
  });
});

// Handle recording state changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_RECORDING_STATE') {
    chrome.storage.local.get(['isRecording'], (result) => {
      sendResponse({ isRecording: result.isRecording || false });
    });
    return true;
  }
});