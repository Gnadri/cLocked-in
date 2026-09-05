(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.SiteMatching = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeHostname(value) {
    if (typeof value !== 'string') return '';

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return '';

    try {
      const withoutWildcard = trimmed.replace(/^\*\./, '');
      const parsed = new URL(
        /^[a-z][a-z\d+.-]*:\/\//i.test(withoutWildcard)
          ? withoutWildcard
          : `https://${withoutWildcard}`
      );

      return parsed.hostname
        .toLowerCase()
        .replace(/\.$/, '');
    } catch (error) {
      return '';
    }
  }

  function domainMatchesSite(domain, site) {
    const cleanDomain = normalizeHostname(domain).replace(/^www\./, '');
    const cleanSite = normalizeHostname(site).replace(/^www\./, '');

    if (!cleanDomain || !cleanSite) return false;

    return cleanDomain === cleanSite || cleanDomain.endsWith(`.${cleanSite}`);
  }

  function domainMatchesCollection(domain, collection) {
    if (!collection || !Array.isArray(collection.items)) return false;
    return collection.items.some((site) => domainMatchesSite(domain, site));
  }

  function getMatchingCollections(domain, collections) {
    if (!Array.isArray(collections)) return [];
    return collections.filter((collection) => domainMatchesCollection(domain, collection));
  }

  function isUrlException(currentUrl, exception) {
    if (typeof currentUrl !== 'string' || typeof exception !== 'string') return false;

    const trimmed = exception.trim();
    if (!trimmed) return false;

    try {
      const current = new URL(currentUrl);
      const exceptionUrl = new URL(
        /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      );

      if (!domainMatchesSite(current.hostname, exceptionUrl.hostname)) return false;

      const hasSpecificPath = exceptionUrl.pathname !== '/';
      if (hasSpecificPath) {
        const exceptionPath = exceptionUrl.pathname.replace(/\/$/, '');
        const pathMatches = current.pathname === exceptionPath ||
          current.pathname.startsWith(`${exceptionPath}/`);
        if (!pathMatches) return false;
      }

      if (exceptionUrl.search && current.search !== exceptionUrl.search) return false;
      if (exceptionUrl.hash && current.hash !== exceptionUrl.hash) return false;

      return true;
    } catch (error) {
      return false;
    }
  }

  function activityBlocksCollections(currentUrl, matchingCollections, activity) {
    if (!activity || activity.isPaused || !Array.isArray(matchingCollections)) return false;

    const blockedCategoryIds = new Set(
      (activity.blockedCategoryIds || []).map((id) => String(id))
    );
    const blocksMatchingCategory = matchingCollections.some((collection) =>
      blockedCategoryIds.has(String(collection.id))
    );

    if (!blocksMatchingCategory) return false;

    return !(activity.exceptions || []).some((exception) =>
      isUrlException(currentUrl, exception)
    );
  }

  return {
    normalizeHostname,
    domainMatchesSite,
    domainMatchesCollection,
    getMatchingCollections,
    isUrlException,
    activityBlocksCollections
  };
});
