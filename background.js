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

function getLocalTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isDomainInCollection(domain, collection) {
  if (!collection || !collection.items) return false;

  return collection.items.some((item) => {
    const cleanItem = item.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const cleanDomain = domain.toLowerCase();

    return cleanDomain === cleanItem ||
      cleanDomain.endsWith('.' + cleanItem) ||
      cleanItem.endsWith('.' + cleanDomain);
  });
}

function getCollectionUsageSeconds(dayData, collection) {
  if (!dayData || !collection || !collection.items) return 0;

  return Object.entries(dayData).reduce((total, [domain, seconds]) => {
    if (isDomainInCollection(domain, collection)) {
      return total + seconds;
    }
    return total;
  }, 0);
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

    const today = getLocalTodayStr();

    chrome.storage.local.get(['trackerData', 'collections', 'activeActivities', 'trackingPaused', 'siteSettings', 'lockInSession'], (result) => {
      let data = result.trackerData || {};
      const collections = result.collections || [];
      let activeActivities = result.activeActivities || [];
      const trackingPaused = !!result.trackingPaused;
      const siteSettings = result.siteSettings || {};
      let lockInSession = result.lockInSession || null;

      // Check if any activity expired
      let changed = false;
      const now = Date.now();
      activeActivities = activeActivities.filter(act => {
          if (act.endTime && now > act.endTime) {
              changed = true;
              return false; 
          }
          return true;
      });
      
      if (changed) {
          chrome.storage.local.set({activeActivities});
      }

      // Check if current URL is an exception in ANY active activity
      // If so, do NOT count towards usage stats
      const isGlobalException = activeActivities.some(act => 
          act.exceptions && act.exceptions.some(ex => currentUrl.includes(ex))
      );

      if (!isGlobalException && !trackingPaused) {
          // Initialize day if not exists
          if (!data[today]) data[today] = {};
          
          // Increment time for domain (seconds)
          if (!data[today][domain]) data[today][domain] = 0;
          data[today][domain] += 1;

          // Save back to storage
          chrome.storage.local.set({ trackerData: data });
      }

      // CHECK LIMITS, BLOCKED CATEGORIES & ACTIVITIES
      let shouldBlock = false;
      let redirectTarget = chrome.runtime.getURL(`blocked.html?site=${domain}`);

      // Site daily limit
      const siteSetting = siteSettings[domain];
      const limitMinutes = siteSetting ? siteSetting.dailyLimitMinutes : null;
      const limitSeconds = limitMinutes ? (limitMinutes * 60) : null;
      const timeToday = (data[today] && data[today][domain]) ? data[today][domain] : 0;
      const limitReached = limitSeconds && timeToday >= limitSeconds;
      if (limitReached && siteSetting && siteSetting.redirectEnabled) {
          shouldBlock = true;
          if (siteSetting.redirectUrl) {
              let url = siteSetting.redirectUrl;
              if (!url.startsWith('http')) url = 'https://' + url;
              redirectTarget = url;
          }
      }

      // Helper to check if domain is in a collection
      const findCollection = (d) => {
          return collections.find(col => isDomainInCollection(d, col));
      };

      const col = findCollection(domain);

      if (lockInSession && lockInSession.startTime) {
          const lockInCollection = collections.find((collection) => collection.id === lockInSession.categoryId);
          const inLockInCategory = isDomainInCollection(domain, lockInCollection);

          if (lockInCollection) {
              const categorySecondsToday = getCollectionUsageSeconds(data[today], lockInCollection);
              const usedSeconds = Math.max(0, categorySecondsToday - (lockInSession.baselineSeconds || 0));
              let nextLockInSession = lockInSession;

              if (usedSeconds !== (lockInSession.usedSeconds || 0)) {
                  nextLockInSession = {
                      ...nextLockInSession,
                      usedSeconds
                  };
              }

              if (!nextLockInSession.isBlocked && usedSeconds >= (nextLockInSession.thresholdSeconds || 0)) {
                  nextLockInSession = {
                      ...nextLockInSession,
                      usedSeconds,
                      isBlocked: true,
                      requiresTaskCompletion: true,
                      blockedAt: Date.now()
                  };
              }

              if (JSON.stringify(nextLockInSession) !== JSON.stringify(lockInSession)) {
                  lockInSession = nextLockInSession;
                  chrome.storage.local.set({ lockInSession });
              } else {
                  lockInSession = nextLockInSession;
              }
          }

          if (lockInSession.isBlocked && inLockInCategory) {
              shouldBlock = true;
              redirectTarget = chrome.runtime.getURL(`blocked.html?site=${domain}&reason=lockin`);
          }
      }

      if (col) {
          // Check if category is manually blocked
          if (col.isBlocked) {
              shouldBlock = true;
          }

          // Check if category is blocked by ANY active activity
          activeActivities.forEach(act => {
              if (act.blockedCategoryIds && act.blockedCategoryIds.includes(col.id)) {
                  // This activity wants to block this site
                  // Check exceptions for THIS activity
                  const isException = act.exceptions && act.exceptions.some(ex => currentUrl.includes(ex));
                  
                  if (!isException) {
                      shouldBlock = true;
                      if (act.redirectUrl) {
                          // Ensure protocol exists
                          let url = act.redirectUrl;
                          if (!url.startsWith('http')) url = 'https://' + url;
                          redirectTarget = url;
                      }
                  }
              }
          });
      }

      if (shouldBlock) {
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
