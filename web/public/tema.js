try {
  var t = localStorage.getItem("sinapse-tema");
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
} catch (e) {}
