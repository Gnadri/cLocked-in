let currentDomain = null;

// Helper to extract domain
function getDomain(url) {
  try {
    const u = new URL(url);
    if (u.protocol.startsWith('http')) {
      return u.hostname;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Update the current domain when tabs change or update
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  currentDomain = getDomain(tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    currentDomain = getDomain(tab.url);
  }
});

// THE TICKER: Run every second
setInterval(() => {
  // Query active tab to ensure we are checking the actual current site
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const activeTab = tabs[0];
    const currentUrl = activeTab.url;
    const domain = getDomain(currentUrl);

    // If no domain (e.g. chrome://), just return
    if (!domain) return;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    chrome.storage.local.get(['trackerData', 'collections', 'currentActivity'], (result) => {
      let data = result.trackerData || {};
      
      // Initialize day if not exists
      if (!data[today]) data[today] = {};
      
      // Increment time for domain (seconds)
      if (!data[today][domain]) data[today][domain] = 0;
      data[today][domain] += 1;

      // Save back to storage
      chrome.storage.local.set({ trackerData: data });

      // CHECK LIMITS, BLOCKED CATEGORIES & ACTIVITIES
      const collections = result.collections || [];
      const currentActivity = result.currentActivity;

      // Check if activity expired
      if (currentActivity && currentActivity.endTime) {
          if (Date.now() > currentActivity.endTime) {
              chrome.storage.local.remove('currentActivity');
              return; // Stop blocking immediately
          }
      }

      let shouldBlock = false;
      let redirectTarget = chrome.runtime.getURL(`blocked.html?site=${domain}`);

      // Helper to check if domain is in a collection
      const findCollection = (d) => {
          return collections.find(col => col.items && col.items.some(item => {
              // Clean up user input just in case
              let cleanItem = item.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
              let cleanDomain = d.toLowerCase();
              
              return cleanDomain === cleanItem || 
                     cleanDomain.endsWith('.' + cleanItem) || 
                     cleanItem.endsWith('.' + cleanDomain);
          }));
      };

      const col = findCollection(domain);

      if (col) {
          // Check if category is manually blocked
          if (col.isBlocked) {
              shouldBlock = true;
          }

          // Check if category is blocked by current activity
          if (currentActivity && currentActivity.blockedCategoryIds) {
              if (currentActivity.blockedCategoryIds.includes(col.id)) {
                  shouldBlock = true;
                  if (currentActivity.redirectUrl) {
                      // Ensure protocol exists
                      let url = currentActivity.redirectUrl;
                      if (!url.startsWith('http')) url = 'https://' + url;
                      redirectTarget = url;
                  }
              }
          }
      }

      if (shouldBlock) {
          // CHECK EXCEPTIONS
          if (currentActivity && currentActivity.exceptions) {
              // If any exception string is found in the current URL, allow it.
              const isException = currentActivity.exceptions.some(ex => currentUrl.includes(ex));
              if (isException) return; 
          }

          // Avoid redirect loops
          // If we are already on the redirect target (or close enough), don't redirect
          if (currentUrl.startsWith(redirectTarget)) return;
          
          // Special case for internal blocked page
          if (redirectTarget.includes('blocked.html') && currentUrl.includes('blocked.html')) return;

          chrome.tabs.update(activeTab.id, { url: redirectTarget });
      }
    });
  });
}, 1000);
