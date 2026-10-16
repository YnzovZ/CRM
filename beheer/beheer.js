(function () {
  var api = window.YnzoApi;
  var $ = function (id) { return document.getElementById(id); };
  var state = { talks: [], handouts: [], rows: [], agenda: [], editing: null, qrTalk: null, codeTouched: false, pendingAgenda: "" };

  var dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  var numFmt = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function status(t) { $("status").textContent = t || ""; }
  function linkFor(code) { return location.origin + "/?event=" + encodeURIComponent(code); }
  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T12:00:00");
    return isNaN(d) ? iso : dateFmt.format(d);
  }
  function handoutName(pad) {
    var h = state.handouts.filter(function (x) { return x.pad === pad; })[0];
    if (h) return h.naam;
    var def = defaultHandout();
    return pad ? pad : (def ? def.naam + " (standaard)" : "Standaard");
  }
  function defaultHandout() { return state.handouts.filter(function (h) { return h.standaard; })[0] || state.handouts[0]; }

  // ---------- Inloggen ----------
  function showLogin(msg) {
    $("app").hidden = true;
    $("login").hidden = false;
    $("login-error").hidden = !msg;
    $("login-error").textContent = msg || "";
  }
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    api.setKey($("key").value.trim());
    start();
  });
  $("logout").addEventListener("click", function () { api.clearKey(); $("key").value = ""; showLogin(); });

  // ---------- Navigatie ----------
  function route() {
    var name = (location.hash || "#talks").slice(1);
    if (!document.querySelector('[data-view="' + name + '"]')) name = "talks";
    document.querySelectorAll("[data-view]").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== name; });
    document.querySelectorAll("[data-route]").forEach(function (a) {
      if (a.getAttribute("data-route") === name) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("hashchange", route);

  // ---------- Laden ----------
  function start() {
    if (!api.getKey()) { showLogin(); return; }
    status("Even laden...");
    Promise.all([api.feedback(), api.handouts().catch(function () { return []; })])
      .then(function (res) {
        var data = res[0];
        state.handouts = res[1] || [];
        if (!data.ok) { showLogin(data.error === "geen toegang" ? "Deze sleutel klopt niet." : "Er ging iets mis: " + data.error); return; }
        if (!data.talks) { showLogin("Het script in Google is nog niet bijgewerkt. Nu live: versie " + (data.versie || "onbekend") + ". Nodig: versie 6."); return; }
        state.talks = data.talks;
        state.rows = data.rows || [];
        $("login").hidden = true;
        $("app").hidden = false;
        status("");
        fillHandoutSelect($("t-handout"), "");
        route();
        renderTalks();
        renderFeedback();
        loadAgenda();
      })
      .catch(function () { status("Kan de gegevens nu niet ophalen. Check je verbinding."); });
  }

  // ---------- Agenda ----------
  var weekdayFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "short" });
  $("agenda-refresh").addEventListener("click", loadAgenda);

  function loadAgenda() {
    $("agenda-status").textContent = "Agenda ophalen...";
    api.agenda().then(function (data) {
      if (!data.ok) {
        $("agenda-status").textContent = /agenda|autho|permission|toestemming/i.test(data.error || "")
          ? "Geen toegang tot je agenda. Open het script in Google, kies bovenin de functie testAgenda, klik op Uitvoeren en geef toestemming. Implementeer daarna een nieuwe versie."
          : "Agenda ophalen mislukt: " + data.error;
        return;
      }
      if (!data.agenda) {
        $("agenda-status").textContent = "Het script in Google is nog niet bijgewerkt naar de agendaversie. Nodig: versie 7.";
        return;
      }
      state.agenda = data.agenda;
      renderAgenda();
    }).catch(function () { $("agenda-status").textContent = "Agenda ophalen mislukt. Check je verbinding."; });
  }

  function linkedTalk(ev) {
    return state.talks.filter(function (t) { return t.agendaId && t.agendaId === ev.id; })[0];
  }

  function renderAgenda() {
    var list = $("agenda");
    list.innerHTML = "";
    $("agenda-status").textContent = state.agenda.length ? "" : "Geen talks gevonden in je agenda voor de komende 6 maanden.";
    state.agenda.forEach(function (ev) {
      var t = linkedTalk(ev);
      var li = el("li", t ? "is-linked" : "");
      var d = new Date(ev.datum + "T12:00:00");
      var dateBox = el("div", "ag-date", formatDate(ev.datum));
      dateBox.appendChild(el("small", null, weekdayFmt.format(d) + (ev.tijd ? ", " + ev.tijd : "")));
      li.appendChild(dateBox);

      var mid = el("div");
      mid.appendChild(el("div", "ag-title", ev.titel || "(zonder titel)"));
      if (ev.locatie) mid.appendChild(el("div", "ag-meta", ev.locatie));
      if (t) mid.appendChild(el("span", "ag-linked", "QR klaar, " + handoutName(t.handout)));
      li.appendChild(mid);

      var acts = el("div", "ag-actions");
      if (t) {
        var bQr = el("button", "btn btn-small", "QR");
        bQr.type = "button";
        bQr.addEventListener("click", function () { showQr(t); $("qr-card").scrollIntoView({ behavior: "smooth", block: "center" }); });
        var bEdit = el("button", "btn btn-small btn-ghost", "Bewerk");
        bEdit.type = "button";
        bEdit.addEventListener("click", function () { editTalk(t); });
        acts.appendChild(bQr);
        acts.appendChild(bEdit);
      } else {
        var bMake = el("button", "btn btn-small", "QR maken");
        bMake.type = "button";
        bMake.addEventListener("click", function () { prefillFromAgenda(ev); });
        acts.appendChild(bMake);
      }
      li.appendChild(acts);
      list.appendChild(li);
    });
  }

  function prefillFromAgenda(ev) {
    resetForm();
    state.pendingAgenda = ev.id;
    $("t-naam").value = ev.titel || "";
    $("t-datum").value = ev.datum;
    $("t-code").value = api.slugify((ev.titel || "talk") + "-" + ev.datum.slice(0, 4));
    $("talk-form-title").textContent = "talk uit je agenda";
    $("t-cancel").hidden = false;
    $("talk-form").scrollIntoView({ behavior: "smooth", block: "start" });
    $("t-naam").focus();
  }

  function fillHandoutSelect(select, value) {
    select.innerHTML = "";
    state.handouts.forEach(function (h) {
      var o = el("option", null, h.naam + (h.standaard ? " (standaard)" : ""));
      o.value = h.standaard ? "" : h.pad;
      select.appendChild(o);
    });
    select.value = value || "";
  }

  // ---------- Talk-formulier ----------
  $("t-naam").addEventListener("input", function () {
    if (state.editing || state.codeTouched) return;
    var d = $("t-datum").value;
    $("t-code").value = api.slugify($("t-naam").value + (d ? "-" + d.slice(0, 4) : ""));
  });
  $("t-datum").addEventListener("change", function () {
    if (state.editing || state.codeTouched || !$("t-naam").value) return;
    $("t-code").value = api.slugify($("t-naam").value + "-" + $("t-datum").value.slice(0, 4));
  });
  $("t-code").addEventListener("input", function () {
    state.codeTouched = true;
    $("t-code").value = $("t-code").value.toLowerCase().replace(/[^a-z0-9-]/g, "");
  });
  $("t-cancel").addEventListener("click", resetForm);

  function resetForm() {
    state.editing = null;
    state.pendingAgenda = "";
    state.codeTouched = false;
    $("talk-form").reset();
    $("t-code").disabled = false;
    fillHandoutSelect($("t-handout"), "");
    $("talk-form-title").textContent = "nieuwe talk";
    $("t-save").textContent = "Opslaan en QR maken";
    $("t-cancel").hidden = true;
    $("t-error").hidden = true;
  }

  function editTalk(t) {
    state.editing = t.code;
    state.pendingAgenda = t.agendaId || "";
    $("t-naam").value = t.naam;
    $("t-datum").value = t.datum;
    $("t-code").value = t.code;
    $("t-code").disabled = true;
    fillHandoutSelect($("t-handout"), t.handout);
    $("talk-form-title").textContent = "talk bewerken";
    $("t-save").textContent = "Opslaan";
    $("t-cancel").hidden = false;
    $("talk-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("talk-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = state.editing || $("t-code").value;
    if (!state.editing && state.talks.some(function (t) { return t.code === code; })) {
      $("t-error").textContent = "Deze code bestaat al. Kies een andere, of bewerk de bestaande talk.";
      $("t-error").hidden = false;
      return;
    }
    save({ code: code, naam: $("t-naam").value.trim(), datum: $("t-datum").value, handout: $("t-handout").value, agendaId: state.pendingAgenda }, function (t) {
      resetForm();
      showQr(t);
    });
  });

  function save(talk, done) {
    $("t-save").disabled = true;
    status("Opslaan...");
    api.saveTalk(talk).then(function (data) {
      $("t-save").disabled = false;
      if (!data.ok) { status("Opslaan mislukt: " + data.error); return; }
      state.talks = data.talks;
      status("Opgeslagen.");
      renderTalks();
      renderFeedback();
      renderAgenda();
      var saved = state.talks.filter(function (t) { return t.code === talk.code; })[0];
      if (done && saved) done(saved);
    }).catch(function () {
      $("t-save").disabled = false;
      status("Opslaan mislukt. Check je verbinding.");
    });
  }

  // ---------- QR ----------
  function showQr(t) {
    state.qrTalk = t;
    var url = linkFor(t.code);
    var qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    state.qrSvg = qr.createSvgTag({ cellSize: 10, margin: 4, scalable: true });
    $("qr").innerHTML = state.qrSvg;
    $("qr-title").textContent = t.naam || t.code;
    $("qr-link").textContent = url;
    $("qr-link").href = url;
    $("qr-handout").textContent = "Na het formulier: " + handoutName(t.handout);
    $("qr-card").hidden = false;
  }

  function download(name, href) {
    var a = el("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  $("qr-svg").addEventListener("click", function () {
    var href = URL.createObjectURL(new Blob([state.qrSvg], { type: "image/svg+xml" }));
    download("qr-" + state.qrTalk.code + ".svg", href);
    setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
  });
  $("qr-png").addEventListener("click", function () {
    var src = URL.createObjectURL(new Blob([state.qrSvg], { type: "image/svg+xml" }));
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas");
      c.width = c.height = 2000;
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 2000, 2000);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 2000, 2000);
      URL.revokeObjectURL(src);
      download("qr-" + state.qrTalk.code + ".png", c.toDataURL("image/png"));
    };
    img.src = src;
  });
  $("qr-copy").addEventListener("click", function () {
    var url = linkFor(state.qrTalk.code);
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
      .then(function () { status("Link gekopieerd."); }, function () { status(url); });
  });

  // ---------- Feedback per talk ----------
  function statsByCode() {
    var s = {};
    state.rows.forEach(function (r) {
      var k = r.event || "algemeen";
      if (!s[k]) s[k] = { n: 0, sum: 0, leads: 0, last: "" };
      s[k].n++;
      s[k].sum += r.cijfer;
      if (r.interesse) s[k].leads++;
      if (r.tijd > s[k].last) s[k].last = r.tijd;
    });
    return s;
  }

  // ---------- Overzicht talks ----------
  function renderTalks() {
    var body = $("talk-rows");
    body.innerHTML = "";
    var stats = statsByCode();
    var talks = state.talks.slice().sort(function (a, b) { return (b.datum || "").localeCompare(a.datum || ""); });
    $("talks-empty").hidden = talks.length > 0;
    talks.forEach(function (t) {
      var tr = el("tr");
      tr.appendChild(el("td", null, formatDate(t.datum)));
      tr.appendChild(el("td", null, t.naam));
      tr.appendChild(el("td", "code", t.code));

      var tdH = el("td");
      var sel = el("select");
      sel.setAttribute("aria-label", "Hand-out voor " + (t.naam || t.code));
      fillHandoutSelect(sel, t.handout);
      sel.addEventListener("change", function () {
        save({ code: t.code, naam: t.naam, datum: t.datum, handout: sel.value, agendaId: t.agendaId || "" });
      });
      tdH.appendChild(sel);
      tr.appendChild(tdH);

      var st = stats[t.code];
      tr.appendChild(el("td", "num", st ? numFmt.format(st.sum / st.n) + " (" + st.n + ")" : "nog niets"));

      var tdA = el("td");
      var acts = el("div", "actions");
      var bQr = el("button", "btn btn-small", "QR");
      bQr.type = "button";
      bQr.addEventListener("click", function () { showQr(t); $("qr-card").scrollIntoView({ behavior: "smooth", block: "center" }); });
      var bEdit = el("button", "btn btn-small btn-ghost", "Bewerk");
      bEdit.type = "button";
      bEdit.addEventListener("click", function () { editTalk(t); });
      var bDel = el("button", "btn btn-small btn-ghost", "Verwijder");
      bDel.type = "button";
      bDel.addEventListener("click", function () {
        if (!confirm("Talk \"" + (t.naam || t.code) + "\" verwijderen? De feedback blijft bewaard, de QR-code gaat daarna naar de standaard hand-out.")) return;
        status("Verwijderen...");
        api.deleteTalk(t.code).then(function (data) {
          if (!data.ok) { status("Verwijderen mislukt: " + data.error); return; }
          state.talks = data.talks;
          if (state.qrTalk && state.qrTalk.code === t.code) $("qr-card").hidden = true;
          status("Verwijderd.");
          renderTalks();
          renderFeedback();
          renderAgenda();
        });
      });
      acts.appendChild(bQr);
      acts.appendChild(bEdit);
      acts.appendChild(bDel);
      tdA.appendChild(acts);
      tr.appendChild(tdA);
      body.appendChild(tr);
    });
  }

  function renderFeedback() {
    var body = $("fb-rows");
    body.innerHTML = "";
    var stats = statsByCode();
    var names = {};
    state.talks.forEach(function (t) { names[t.code] = t.naam; });
    Object.keys(stats).sort(function (a, b) { return stats[b].last.localeCompare(stats[a].last); }).forEach(function (code) {
      var s = stats[code];
      var tr = el("tr");
      tr.appendChild(el("td", null, code === "algemeen" ? "Zonder talkcode" : (names[code] || code)));
      tr.appendChild(el("td", null, s.last ? dateFmt.format(new Date(s.last)) : ""));
      tr.appendChild(el("td", "num", String(s.n)));
      tr.appendChild(el("td", "num", numFmt.format(s.sum / s.n)));
      tr.appendChild(el("td", "num", String(s.leads)));
      body.appendChild(tr);
    });
    if (!body.children.length) {
      var tr = el("tr");
      var td = el("td", "empty", "Nog geen feedback binnen.");
      td.colSpan = 5;
      tr.appendChild(td);
      body.appendChild(tr);
    }
  }

  start();
})();
