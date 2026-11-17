try {
  // o projeto se chamava Sinapse: leva as preferências antigas (tema, letra, "já sei") para os nomes novos
  for (var i = localStorage.length - 1; i >= 0; i--) {
    var k = localStorage.key(i);
    if (k && k.indexOf("sinapse-") === 0) {
      var novo = "resumo-" + k.slice(8);
      if (localStorage.getItem(novo) === null) localStorage.setItem(novo, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
  }
  var t = localStorage.getItem("resumo-tema");
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
} catch (e) {}
