// Runs in <head> before the page paints so the saved theme is applied immediately.
(function () {
  var theme = "system";
  try {
    var saved = JSON.parse(localStorage.getItem("fau-weather:v1"));
    if (saved && ["system", "light", "white", "dark"].indexOf(saved.theme) !== -1) theme = saved.theme;
  } catch (e) { /* storage unavailable */ }
  var resolved = theme === "system"
    ? (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  document.documentElement.setAttribute("data-theme", resolved);
})();
