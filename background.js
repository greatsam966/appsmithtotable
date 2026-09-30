chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "APPSMITH_CAPTURE_VISIBLE") return;

  chrome.tabs.captureVisibleTab(
    sender.tab.windowId,
    { format: "png" },
    (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }

      sendResponse({
        success: true,
        dataUrl
      });
    }
  );

  return true;
});