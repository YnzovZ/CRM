// CRM-overzicht in /beheer/ (tabblad CRM van de Google Sheet).
(function () {
  var api = window.YnzoApi;
  var $ = function (id) { return document.getElementById(id); };
  var state = { rows: [], statussen: [], loaded: false, loading: false, limit: 100, sort: { key: "datum", dir: "desc" }, org: "" };
  var OPEN = ["lead", "aanvraag", "optie"];
  var dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  var euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  var COLS = [
    { key: "datum", label: "Datum" },
    { key: "org", label: "Organisatie" },
    { key: "contact", label: "Contact" },
    { key: "bureau", label: "Bureau" },
    { key: "status", label: "Status" },
    { key: "bedrag", label: "Bedrag" }
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function status(t) { $("status").textContent = t || ""; }
  function f(r, k) { return String(r[k] || "").trim(); }
  function datum(r) { return f(r, "Datum talk") || f(r, "Datum aanvraag"); }
  function fmtDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
    var d = new Date(iso.slice(0, 10) + "T12:00:00");
    return isNaN(d) ? iso : dateFmt.format(d);
  }
  function bedrag(r) { var n = parseFloat(f(r, "Bedrag excl").replace(",", ".")); return isNaN(n) ? 0 : n; }
  function orgKey(s) { return String(s || "").toLowerCase().replace(/\b(b\.?v\.?|n\.?v\.?)\b/g, "").replace(/[^a-z0-9]/g, ""); }
  function mijn(r) { var s = f(r, "Spreker"); return !s || s.toLowerCase() === "ynzo"; }

  // ---------- Laden, pas als je het tabblad opent ----------
  function maybeLoad() {
    if (location.hash !== "#contacten" || state.loaded || state.loading || !api.getKey()) return;
    state.loading = true;
    status("CRM laden...");
    api.crm().then(function (data) {
      state.loading = false;
      if (!data.ok) { status("CRM laden mislukt: " + data.error); return; }
      if (!data.rows) { status("Het script in Google is nog niet bijgewerkt. Nodig: versie 12, nu live: " + (data.versie || "onbekend") + "."); return; }
      state.rows = data.rows;
      state.statussen = data.statussen || [];
      state.loaded = true;
      status("");
      fillFilters();
      render();
    }).catch(function () { state.loading = false; status("Kan het CRM nu niet ophalen. Check je verbinding."); });
  }
  window.addEventListener("hashchange", maybeLoad);
  setTimeout(maybeLoad, 600);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) maybeLoad(); });

  function fillFilters() {
    var st = $("crm-status");
    st.length = 1;
    state.statussen.forEach(function (s) { st.appendChild(new Option(s, s)); });
    var jaren = {}, bureaus = {};
    state.rows.forEach(function (r) {
      var j = datum(r).slice(0, 4);
      if (/^\d{4}$/.test(j)) jaren[j] = true;
      if (f(r, "Via bureau")) bureaus[f(r, "Via bureau")] = (bureaus[f(r, "Via bureau")] || 0) + 1;
    });
    var jr = $("crm-jaar");
    jr.length = 1;
    Object.keys(jaren).sort().reverse().forEach(function (j) { jr.appendChild(new Option(j, j)); });
    var bu = $("crm-bureau");
    bu.length = 2;
    Object.keys(bureaus).sort(function (a, b) { return bureaus[b] - bureaus[a]; }).forEach(function (b) { bu.appendChild(new Option(b + " (" + bureaus[b] + ")", b)); });
  }

  ["crm-q", "crm-status", "crm-jaar", "crm-bureau", "crm-mij"].forEach(function (id) {
    $(id).addEventListener(id === "crm-q" ? "input" : "change", function () { state.limit = 100; renderTable(); });
  });
  $("crm-more").addEventListener("click", function () { state.limit += 200; renderTable(); });

  // ---------- Weergave ----------
  function render() {
    renderKpis();
    renderOpen();
    renderOrg();
    renderTable();
  }

  function renderKpis() {
    var jaar = String(new Date().getFullYear());
    var mine = state.rows.filter(mijn);
    var gegeven = mine.filter(function (r) { return f(r, "Status") === "gegeven"; });
    var ditJaar = gegeven.filter(function (r) { return datum(r).slice(0, 4) === jaar; });
    var open = mine.filter(function (r) { return OPEN.indexOf(f(r, "Status")) >= 0; });
    // Laatste jaar met facturen, zodat je geen 0 ziet zolang dit jaar nog niet is gefactureerd.
    var fJaar = gegeven.filter(function (r) { return bedrag(r); }).map(function (r) { return datum(r).slice(0, 4); }).sort().pop() || jaar;
    var omzet = gegeven.filter(function (r) { return datum(r).slice(0, 4) === fJaar; }).reduce(function (s, r) { return s + bedrag(r); }, 0);
    var box = $("crm-kpis");
    box.innerHTML = "";
    [[String(gegeven.length), "talks gegeven, totaal"], [String(ditJaar.length), "talks in " + jaar], [String(open.length), "open aanvragen en leads"], [euro.format(omzet), "gefactureerd in " + fJaar]].forEach(function (k) {
      var d = el("div", "crm-kpi");
      d.appendChild(el("b", null, k[0]));
      d.appendChild(el("span", null, k[1]));
      box.appendChild(d);
    });
  }

  function renderOpen() {
    var vandaag = new Date().toISOString().slice(0, 10);
    var rows = state.rows.filter(function (r) {
      return mijn(r) && (OPEN.indexOf(f(r, "Status")) >= 0 || (f(r, "Status") === "geboekt" && f(r, "Datum talk") >= vandaag));
    }).sort(function (a, b) { return datum(a).localeCompare(datum(b)); });
    $("crm-open").hidden = !rows.length;
    var ul = $("crm-open-list");
    ul.innerHTML = "";
    rows.slice(0, 15).forEach(function (r) {
      var li = el("li");
      li.appendChild(el("span", "crm-date", fmtDate(datum(r))));
      var mid = el("div");
      mid.appendChild(orgButton(r));
      var sub = [f(r, "Contactpersoon"), f(r, "E-mail"), f(r, "Via bureau") ? "via " + f(r, "Via bureau") : ""].filter(Boolean).join(", ");
      if (sub) mid.appendChild(el("div", "crm-note", sub));
      if (f(r, "Notities")) mid.appendChild(el("div", "crm-note", f(r, "Notities")));
      li.appendChild(mid);
      li.appendChild(statusSelect(r));
      ul.appendChild(li);
    });
  }

  function orgButton(r) {
    var naam = f(r, "Organisatie");
    if (!naam) return el("span", "crm-note", "organisatie onbekend");
    var b = el("button", "link-btn", naam);
    b.type = "button";
    b.addEventListener("click", function () {
      state.org = orgKey(naam);
      renderOrg();
      $("crm-org").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return b;
  }

  function statusSelect(r) {
    var s = el("select");
    s.setAttribute("aria-label", "Status");
    var huidig = f(r, "Status");
    var opties = state.statussen.slice();
    if (huidig && opties.indexOf(huidig) < 0) opties.unshift(huidig);
    opties.forEach(function (o) { s.appendChild(new Option(o, o, false, o === huidig)); });
    s.addEventListener("change", function () {
      var nieuw = s.value;
      s.disabled = true;
      api.setKans(r, "Status", nieuw).then(function (data) {
        s.disabled = false;
        if (!data.ok) { s.value = huidig; status("Opslaan mislukt: " + data.error); return; }
        r.Status = nieuw;
        if (data.rij) r.rij = data.rij;
        status(nieuw === "weg" ? "Op 'weg' gezet. Morgenochtend verhuist hij naar het archief." : "Status opgeslagen.");
        render();
      }).catch(function () { s.disabled = false; s.value = huidig; status("Opslaan mislukt. Check je verbinding."); });
    });
    return s;
  }

  function renderOrg() {
    var box = $("crm-org");
    box.innerHTML = "";
    var rows = state.org ? state.rows.filter(function (r) { return orgKey(r.Organisatie) === state.org; }) : [];
    box.hidden = !rows.length;
    if (!rows.length) return;
    rows.sort(function (a, b) { return datum(b).localeCompare(datum(a)); });
    var head = el("div", "crm-org-head");
    head.appendChild(el("h2", null, f(rows[0], "Organisatie")));
    var close = el("button", "btn btn-ghost btn-small", "Sluiten");
    close.type = "button";
    close.addEventListener("click", function () { state.org = ""; renderOrg(); });
    head.appendChild(close);
    box.appendChild(head);

    var gegeven = rows.filter(function (r) { return f(r, "Status") === "gegeven"; });
    var stats = el("div", "crm-org-stats");
    [[gegeven.length, gegeven.length === 1 ? "talk gegeven" : "talks gegeven"], [rows.length - gegeven.length, "andere kansen"], [euro.format(rows.reduce(function (s, r) { return s + bedrag(r); }, 0)), "gefactureerd"]].forEach(function (s) {
      var span = el("span");
      span.appendChild(el("b", null, String(s[0])));
      span.appendChild(document.createTextNode(" " + s[1]));
      stats.appendChild(span);
    });
    box.appendChild(stats);

    var grid = el("div", "crm-org-grid");
    // Contactpersonen, klant en bureau, zonder dubbelen
    var people = el("div");
    people.appendChild(el("h3", null, "contacten"));
    var ul = el("ul", "crm-org-people"), seen = {};
    rows.forEach(function (r) {
      [[f(r, "Contactpersoon"), f(r, "E-mail"), f(r, "Telefoon"), ""], [f(r, "Bureau contactpersoon"), f(r, "Bureau e-mail"), "", f(r, "Via bureau")]].forEach(function (p) {
        var key = (p[1] || p[0]).toLowerCase();
        if (!key || seen[key]) return;
        seen[key] = true;
        var li = el("li");
        if (p[0]) li.appendChild(el("div", "fb-org", p[0]));
        if (p[1]) { var a = el("a", null, p[1]); a.href = "mailto:" + p[1]; li.appendChild(a); }
        if (p[2]) li.appendChild(el("div", "crm-note", p[2]));
        if (p[3]) li.appendChild(el("div", "crm-note", "bureau: " + p[3]));
        ul.appendChild(li);
      });
    });
    if (!ul.children.length) ul.appendChild(el("li", "crm-note", "Geen contactgegevens bekend."));
    people.appendChild(ul);
    grid.appendChild(people);

    var time = el("div");
    time.appendChild(el("h3", null, "geschiedenis"));
    var tl = el("ul", "crm-org-time");
    rows.forEach(function (r) {
      var li = el("li");
      li.appendChild(el("span", "crm-date", fmtDate(datum(r)) || "datum onbekend"));
      li.appendChild(el("span", null)).appendChild(el("span", "crm-pill " + f(r, "Status"), f(r, "Status") || "?"));
      var t = el("div");
      t.appendChild(el("div", null, [f(r, "Soort"), f(r, "Via bureau") ? "via " + f(r, "Via bureau") : "", bedrag(r) ? euro.format(bedrag(r)) : "", f(r, "Spreker") && !mijn(r) ? "spreker: " + f(r, "Spreker") : ""].filter(Boolean).join(", ")));
      var note = [f(r, "Notities"), f(r, "Reden"), f(r, "Opmerkingen")].filter(Boolean).join(" | ");
      if (note) t.appendChild(el("div", "crm-note", note));
      li.appendChild(t);
      tl.appendChild(li);
    });
    time.appendChild(tl);
    grid.appendChild(time);
    box.appendChild(grid);
  }

  function filtered() {
    var q = $("crm-q").value.trim().toLowerCase();
    var st = $("crm-status").value, jr = $("crm-jaar").value, bu = $("crm-bureau").value, mij = $("crm-mij").checked;
    return state.rows.filter(function (r) {
      if (mij && !mijn(r)) return false;
      if (st ? f(r, "Status") !== st : f(r, "Status") === "weg") return false;
      if (jr && datum(r).slice(0, 4) !== jr) return false;
      if (bu === "-" ? f(r, "Via bureau") : (bu && f(r, "Via bureau") !== bu)) return false;
      if (q) {
        var hay = [r.Organisatie, r.Contactpersoon, r["E-mail"], r["Via bureau"], r["Bureau contactpersoon"], r["Bureau e-mail"], r.Notities, r.Locatie].join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function sortValue(r, key) {
    if (key === "datum") return datum(r);
    if (key === "org") return f(r, "Organisatie").toLowerCase();
    if (key === "contact") return (f(r, "Contactpersoon") || f(r, "E-mail")).toLowerCase();
    if (key === "bureau") return f(r, "Via bureau").toLowerCase();
    if (key === "status") return f(r, "Status");
    if (key === "bedrag") return bedrag(r);
    return "";
  }

  function renderTable() {
    var head = $("crm-head");
    head.innerHTML = "";
    COLS.forEach(function (c) {
      var th = el("th");
      var active = state.sort.key === c.key;
      var b = el("button", "th-sort" + (active ? " is-active " + state.sort.dir : ""), c.label);
      b.type = "button";
      b.addEventListener("click", function () {
        state.sort = { key: c.key, dir: active && state.sort.dir === "desc" ? "asc" : (active ? "desc" : (c.key === "datum" || c.key === "bedrag" ? "desc" : "asc")) };
        renderTable();
      });
      th.appendChild(b);
      head.appendChild(th);
    });

    var rows = filtered();
    var k = state.sort.key, dir = state.sort.dir === "asc" ? 1 : -1;
    rows.sort(function (a, b) {
      var x = sortValue(a, k), y = sortValue(b, k);
      if (x === y) return datum(b).localeCompare(datum(a));
      if (x === "" || x === 0) return 1;
      if (y === "" || y === 0) return -1;
      return (x < y ? -1 : 1) * dir;
    });
    var omzet = rows.reduce(function (s, r) { return s + bedrag(r); }, 0);
    $("crm-count").textContent = rows.length + (rows.length === 1 ? " kans" : " kansen") + (omzet ? ", samen " + euro.format(omzet) + " gefactureerd" : "");

    var tb = $("crm-rows");
    tb.innerHTML = "";
    rows.slice(0, state.limit).forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", "crm-date", fmtDate(datum(r))));
      var tdOrg = el("td");
      tdOrg.appendChild(orgButton(r));
      if (f(r, "Notities")) tdOrg.appendChild(el("div", "crm-note", f(r, "Notities").slice(0, 120)));
      tr.appendChild(tdOrg);
      var tdWho = el("td", "crm-who");
      if (f(r, "Contactpersoon")) tdWho.appendChild(el("div", null, f(r, "Contactpersoon")));
      if (f(r, "E-mail")) { var a = el("a", null, f(r, "E-mail")); a.href = "mailto:" + f(r, "E-mail"); tdWho.appendChild(a); }
      tr.appendChild(tdWho);
      tr.appendChild(el("td", null, f(r, "Via bureau")));
      var tdSt = el("td");
      tdSt.appendChild(statusSelect(r));
      tr.appendChild(tdSt);
      tr.appendChild(el("td", "num", bedrag(r) ? euro.format(bedrag(r)) : ""));
      tb.appendChild(tr);
    });
    if (!rows.length) {
      var tr = el("tr"), td = el("td", "empty", "Geen kansen met deze filters.");
      td.colSpan = COLS.length;
      tr.appendChild(td);
      tb.appendChild(tr);
    }
    $("crm-more").hidden = rows.length <= state.limit;
  }
})();
