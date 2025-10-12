(function () {
  if (typeof window === "undefined") {
    return;
  }

  if (!(window).Capacitor) {
    return;
  }

  var basePath = "";
  try {
    var nextData = window.__NEXT_DATA__;
    if (nextData && nextData.config && typeof nextData.config.basePath === "string") {
      basePath = nextData.config.basePath;
    }
  } catch (err) {
    basePath = "";
  }

  function resolvePath(pathname) {
    if (!pathname) return null;
    if (!basePath) return pathname;
    var normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
    return normalizedBase + pathname;
  }

  function go(pathname) {
    if (!pathname) return;
    var fullPath = resolvePath(pathname);
    if (!fullPath) return;
    window.history.pushState({}, "", fullPath);
    window.dispatchEvent(new Event("popstate"));
  }

  window.addEventListener("nativeTabChange", function (event) {
    var detail = event && event.detail;
    if (detail && typeof detail.pathname === "string") {
      go(detail.pathname);
    }
  });
})();
