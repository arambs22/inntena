/**
 * Applies the persisted theme before React mounts, avoiding a flash of the
 * wrong theme on load. Runs as an external file (not an inline <script>) so
 * the app's Content-Security-Policy can keep script-src restricted to 'self'
 * with no inline-script exception.
 */
(function () {
  var theme = localStorage.getItem("inntena_theme");
  // Dark is the default look — only an explicit stored "light" opts out of it.
  if (theme !== "light") {
    document.documentElement.classList.add("dark");
  }
})();
