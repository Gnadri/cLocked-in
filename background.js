importScripts('site-matching.js');

// Helper to extract domain
function getDomain(url) {
  try {
    const u = new URL(url);
    if (u.protocol.startsWith('http')) {
      return globalThis.SiteMatching.normalizeHostname(u.hostname);
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
  return globalThis.SiteMatching.domainMatchesCollection(domain, collection);
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

function recordLockInSegment(trackerData, taskHistory, session, endTime) {
  if (!session || !session.startTime || !endTime || endTime <= session.startTime) {
    return { trackerData, taskHistory };
  }

  const date = getLocalTodayStr();
  const nextTrackerData = trackerData || {};
  const nextTaskHistory = taskHistory || [];
  const elapsedSeconds = Math.floor((endTime - session.startTime) / 1000);

  if (!nextTrackerData[date]) nextTrackerData[date] = {};
  if (!nextTrackerData[date]['Locked In']) nextTrackerData[date]['Locked In'] = 0;
  nextTrackerData[date]['Locked In'] += elapsedSeconds;

  nextTaskHistory.push({
    name: 'Locked In',
    startTime: session.startTime,
    endTime,
    date,
    color: '#15803d'
  });

  return { trackerData: nextTrackerData, taskHistory: nextTaskHistory };
}

function processTab(activeTab, trackUsage = false) {
    if (!activeTab) return;
    const currentUrl = activeTab.url;
    const domain = getDomain(currentUrl);

    // If no domain (e.g. chrome://), just return
    if (!domain) return;

    const today = getLocalTodayStr();

    chrome.storage.local.get(['trackerData', 'collections', 'activeActivities', 'trackingPaused', 'siteSettings', 'lockInSession', 'taskHistory'], (result) => {
      let data = result.trackerData || {};
      const collections = result.collections || [];
      let activeActivities = result.activeActivities || [];
      const trackingPaused = !!result.trackingPaused;
      const siteSettings = result.siteSettings || {};
      let lockInSession = result.lockInSession || null;
      let taskHistory = result.taskHistory || [];

      // Check if any activity expired
      let changed = false;
      const now = Date.now();
      activeActivities = activeActivities.filter(act => {
          if (!act.isPaused && act.endTime && now > act.endTime) {
              changed = true;
              return false; 
          }
          return true;
      });
      
      if (changed) {
          chrome.storage.local.set({activeActivities});
      }

      const runningActivities = activeActivities.filter((activity) => !activity.isPaused);

      // Check if current URL is an exception in ANY running activity
      // If so, do NOT count towards usage stats
      const isGlobalException = runningActivities.some(act =>
          act.exceptions && act.exceptions.some(ex => globalThis.SiteMatching.isUrlException(currentUrl, ex))
      );

      if (trackUsage && !isGlobalException && !trackingPaused) {
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

      const matchingCollections = globalThis.SiteMatching.getMatchingCollections(domain, collections);

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
                  const blockedAt = Date.now();
                  const recorded = recordLockInSegment(data, taskHistory, nextLockInSession, blockedAt);
                  data = recorded.trackerData;
                  taskHistory = recorded.taskHistory;
                  nextLockInSession = {
                      ...nextLockInSession,
                      usedSeconds,
                      isBlocked: true,
                      requiresTaskCompletion: true,
                      blockedAt,
                      segmentRecordedAt: blockedAt
                  };
              }

              if (JSON.stringify(nextLockInSession) !== JSON.stringify(lockInSession)) {
                  lockInSession = nextLockInSession;
                  chrome.storage.local.set({ lockInSession, trackerData: data, taskHistory });
              } else {
                  lockInSession = nextLockInSession;
              }
          }

          if (lockInSession.isBlocked && inLockInCategory) {
              shouldBlock = true;
              redirectTarget = chrome.runtime.getURL(`blocked.html?site=${domain}&reason=lockin`);
          }
      }

      if (matchingCollections.some((collection) => collection.isBlocked)) {
          shouldBlock = true;
      }

      // A site can belong to more than one category. Block when any matching
      // category is selected by any currently running activity.
      runningActivities.forEach((activity) => {
          if (globalThis.SiteMatching.activityBlocksCollections(currentUrl, matchingCollections, activity)) {
              shouldBlock = true;
              if (activity.redirectUrl) {
                  let url = activity.redirectUrl;
                  if (!url.startsWith('http')) url = 'https://' + url;
                  redirectTarget = url;
              }
          }
      });

      if (shouldBlock) {
          // Avoid redirect loops
          // If we are already on the redirect target (or close enough), don't redirect
          if (currentUrl.startsWith(redirectTarget)) return;
          
          // Special case for internal blocked page
          if (redirectTarget.includes('blocked.html') && currentUrl.includes('blocked.html')) return;

          chrome.tabs.update(activeTab.id, { url: redirectTarget });
      }
    });
}

// Enforce immediately when a user activates or navigates a tab. This also
// wakes Manifest V3 service workers that may have suspended the ticker.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    processTab(tab, false);
  } catch (error) {
    // The tab can disappear before chrome.tabs.get resolves.
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
    processTab(tab, false);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  const enforcementKeys = ['activeActivities', 'collections', 'siteSettings', 'lockInSession'];
  if (areaName !== 'local' || !enforcementKeys.some((key) => changes[key])) return;

  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (tabs && tabs[0]) processTab(tabs[0], false);
  });
});

// Track usage while the worker is awake and continuously re-check enforcement.
setInterval(() => {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (tabs && tabs[0]) processTab(tabs[0], true);
  });
}, 1000);
