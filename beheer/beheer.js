(function () {
  var api = window.YnzoApi;
  var $ = function (id) { return document.getElementById(id); };
  var state = { talks: [], handouts: [], rows: [], agenda: [], editing: null, qrTalk: null, codeTouched: false, pendingAgenda: "", mailed: {}, fbSort: { key: "tijd", dir: "desc" } };

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
        var err = String(data.error || "").replace(/^agenda:\s*/, "");
        $("agenda-status").textContent = /permission|toestemming|authori|autoris|machtig|niet gemachtigd/i.test(err)
          ? "Geen toegang tot je agenda. Open het script in Google, kies bovenin de functie testAgenda, klik op Uitvoeren en geef toestemming. Melding van Google: " + err
          : "Agenda ophalen mislukt. Melding van Google: " + err;
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
      var k = String(r.event || "").trim().toLowerCase() || "algemeen";
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

      var st = stats[String(t.code || "").trim().toLowerCase()];
      var tdF = el("td", "num");
      if (st) {
        var fb = el("button", "link-btn", numFmt.format(st.sum / st.n) + " (" + st.n + ")");
        fb.type = "button";
        fb.title = "Bekijk de feedback";
        fb.addEventListener("click", function () { openFeedback(t.code); });
        tdF.appendChild(fb);
      } else {
        tdF.textContent = "nog niets";
      }
      tr.appendChild(tdF);

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

  function normCode(c) { return String(c || "").trim().toLowerCase() || "algemeen"; }

  function renderFeedback() {
    var body = $("fb-rows");
    body.innerHTML = "";
    var stats = statsByCode();
    var names = {};
    state.talks.forEach(function (t) { names[normCode(t.code)] = t.naam; });
    Object.keys(stats).sort(function (a, b) { return stats[b].last.localeCompare(stats[a].last); }).forEach(function (code) {
      var s = stats[code];
      var open = state.openCode === code;
      var tr = el("tr", "fb-row" + (open ? " is-open" : ""));
      var tdName = el("td");
      var btn = el("button", "fb-toggle", (code === "algemeen" ? "Zonder talkcode" : (names[code] || code)));
      btn.type = "button";
      btn.setAttribute("aria-expanded", String(open));
      btn.addEventListener("click", function () {
        state.openCode = open ? null : code;
        renderFeedback();
      });
      tdName.appendChild(btn);
      tr.appendChild(tdName);
      tr.appendChild(el("td", null, s.last ? dateFmt.format(new Date(s.last)) : ""));
      tr.appendChild(el("td", "num", String(s.n)));
      tr.appendChild(el("td", "num", numFmt.format(s.sum / s.n)));
      tr.appendChild(el("td", "num", String(s.leads)));
      body.appendChild(tr);
      if (open) {
        var dtr = el("tr", "fb-detail-row");
        var dtd = el("td");
        dtd.colSpan = 5;
        dtd.appendChild(renderDetail(code));
        dtr.appendChild(dtd);
        body.appendChild(dtr);
      }
    });
    if (!body.children.length) {
      var tr = el("tr");
      var td = el("td", "empty", "Nog geen feedback binnen.");
      td.colSpan = 5;
      tr.appendChild(td);
      body.appendChild(tr);
    }
  }

  var timeFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function renderDetail(code) {
    var rows = state.rows.filter(function (r) { return normCode(r.event) === code; })
      .sort(function (a, b) { return b.tijd.localeCompare(a.tijd); });
    var wrap = el("div", "fb-detail");

    // Samenvatting met verdeling
    var top = el("div", "fb-top");
    var sum = rows.reduce(function (a, r) { return a + r.cijfer; }, 0);
    var hero = el("div", "fb-hero");
    hero.appendChild(el("div", "fb-hero-label", "gemiddeld cijfer"));
    hero.appendChild(el("div", "fb-hero-num", numFmt.format(sum / rows.length)));
    var leads = rows.filter(function (r) { return r.interesse; });
    hero.appendChild(el("div", "fb-hero-meta", rows.length + (rows.length === 1 ? " reactie" : " reacties") + ", " + leads.length + (leads.length === 1 ? " lead" : " leads")));
    top.appendChild(hero);

    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    rows.forEach(function (r) { if (r.cijfer >= 1 && r.cijfer <= 10) counts[r.cijfer - 1]++; });
    var max = Math.max.apply(null, counts);
    var dist = el("div", "fb-dist");
    dist.setAttribute("role", "img");
    dist.setAttribute("aria-label", "Verdeling: " + counts.map(function (c, i) { return c ? (i + 1) + ": " + c + "x" : null; }).filter(Boolean).join(", "));
    counts.forEach(function (c, i) {
      var col = el("div", "fb-col");
      var bar = el("i");
      bar.style.height = c ? Math.max(6, c / max * 100) + "%" : "2px";
      if (c) bar.appendChild(el("b", null, String(c)));
      if (!c) col.className += " empty";
      col.appendChild(bar);
      col.appendChild(el("span", null, String(i + 1)));
      dist.appendChild(col);
    });
    top.appendChild(dist);
    wrap.appendChild(top);

    // Leads bovenaan, met vinkje als je ze sinds hun reactie hebt gemaild
    if (leads.length) {
      var lw = el("div", "fb-leads");
      lw.appendChild(el("h3", null, "leads"));
      var ul = el("ul");
      var ask = [];
      leads.forEach(function (r) {
        var li = el("li", "fb-lead-item");
        var who = el("div", "fb-lead-who");
        who.appendChild(el("div", "fb-org", r.organisatie || "Organisatie niet ingevuld"));
        if (r.email) {
          var a = el("a", null, r.email);
          a.href = "mailto:" + r.email;
          who.appendChild(a);
        }
        li.appendChild(who);
        li.appendChild(el("div", "fb-lead-meta", "gaf een " + r.cijfer + ", " + timeFmt.format(new Date(r.tijd))));
        var right = el("div", "fb-lead-status");
        var st = el("div", "fb-mail");
        var key = (r.email || "").toLowerCase();
        st.setAttribute("data-email", key);
        st._row = r;
        paintMail(st, key);
        right.appendChild(st);
        var lab = el("label", "fb-contact");
        var cb = el("input");
        cb.type = "checkbox";
        cb.checked = !!r.contact;
        cb.addEventListener("change", function () {
          cb.disabled = true;
          var on = cb.checked;
          api.setContact(r, on).then(function (data) {
            cb.disabled = false;
            if (!data.ok) { cb.checked = !on; status("Opslaan mislukt: " + data.error); return; }
            r.contact = data.contact;
            if (data.rij) r.rij = data.rij;
            paintMail(st, key);
            status(on ? "Contact gehad opgeslagen." : "Vinkje weggehaald.");
          }).catch(function () { cb.disabled = false; cb.checked = !on; status("Opslaan mislukt. Check je verbinding."); });
        });
        lab.appendChild(cb);
        var labText = el("span", null, "contact gehad");
        lab.appendChild(labText);
        st._cb = cb;
        st._labText = labText;
        paintMail(st, key);
        right.appendChild(lab);
        li.appendChild(right);
        ul.appendChild(li);
        if (key && !(key in state.mailed)) ask.push({ email: key, since: r.tijd });
      });
      lw.appendChild(ul);
      wrap.appendChild(lw);
      if (ask.length) checkMail(ask);
    }

    // Alle feedback op een rij
    var table = el("table", "table fb-table");
    var thead = el("thead");
    var hr = el("tr");
    var sort = state.fbSort;
    [["tijd", "Tijd"], ["cijfer", "Cijfer"], ["waarom", "Toelichting"], ["lead", "Lead"]].forEach(function (c) {
      var th = el("th");
      var active = sort.key === c[0];
      th.setAttribute("aria-sort", active ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
      var b = el("button", "th-sort" + (active ? " is-active " + sort.dir : ""), c[1]);
      b.type = "button";
      b.addEventListener("click", function () {
        if (sort.key === c[0]) sort.dir = sort.dir === "asc" ? "desc" : "asc";
        else state.fbSort = { key: c[0], dir: c[0] === "waarom" ? "asc" : "desc" };
        renderFeedback();
      });
      th.appendChild(b);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = el("tbody");
    sortRows(rows.slice(), sort).forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", "fb-time", timeFmt.format(new Date(r.tijd))));
      var tdS = el("td");
      tdS.appendChild(el("span", "fb-score" + (r.cijfer < 6 ? " low" : ""), String(r.cijfer)));
      tr.appendChild(tdS);
      var txt = (r.waarom || "").trim();
      tr.appendChild(el("td", "fb-text", txt));
      var tdL = el("td", "fb-lead");
      if (r.interesse) {
        if (r.organisatie) tdL.appendChild(el("div", "fb-org", r.organisatie));
        if (r.email) {
          var a = el("a", null, r.email);
          a.href = "mailto:" + r.email;
          tdL.appendChild(a);
        }
        if (!r.organisatie && !r.email) tdL.textContent = "ja";
      }
      tr.appendChild(tdL);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    var tw = el("div", "table-wrap");
    tw.appendChild(table);
    wrap.appendChild(tw);
    return wrap;
  }

  // Sorteren op kolom. Bij gelijke waarden: nieuwste eerst.
  function sortRows(rows, sort) {
    var dir = sort.dir === "asc" ? 1 : -1;
    var val = {
      tijd: function (r) { return r.tijd; },
      cijfer: function (r) { return r.cijfer; },
      waarom: function (r) { var t = (r.waarom || "").trim().toLowerCase(); return t ? "0" + t : "1"; },
      lead: function (r) { return r.interesse ? 1 : 0; }
    }[sort.key];
    return rows.sort(function (a, b) {
      var x = val(a), y = val(b);
      var c = x < y ? -1 : x > y ? 1 : 0;
      if (sort.key === "waarom") return c * dir || b.tijd.localeCompare(a.tijd);
      return c * dir || b.tijd.localeCompare(a.tijd);
    });
  }

  var mailFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function paintMail(node, email) {
    node.className = "fb-mail";
    var row = node._row;
    // Gemaild via Gmail telt ook als contact: vinkje aan en vast.
    var viaGmail = !!(email && state.mailed[email] && state.mailed[email] !== "fout");
    if (node._cb) {
      var manual = !!(row && row.contact);
      node._cb.checked = manual || viaGmail;
      node._cb.disabled = viaGmail && !manual;
      node._cb.parentNode.title = node._cb.disabled ? "Herkend via je verzonden mail" : "";
      node._labText.textContent = node._cb.disabled ? "contact gehad (via Gmail)" : "contact gehad";
    }
    if (row && row.contact) {
      var d = new Date(row.contact);
      node.textContent = "\u2713 contact gehad" + (isNaN(d) ? "" : " " + mailFmt.format(d).split(",")[0]);
      node.className += " done";
      return;
    }
    if (!email) { node.textContent = "geen e-mailadres"; node.className += " muted"; return; }
    if (!(email in state.mailed)) { node.textContent = "Gmail checken..."; node.className += " muted"; return; }
    var v = state.mailed[email];
    if (v === "fout") { node.textContent = "Gmail niet bereikbaar"; node.className += " muted"; return; }
    if (v) { node.textContent = "\u2713 gemaild " + mailFmt.format(new Date(v)); node.className += " done"; return; }
    node.textContent = "nog niet gemaild";
    node.className += " todo";
  }

  function checkMail(leads) {
    api.mailed(leads).then(function (data) {
      if (!data.ok || !data.mailed) {
        leads.forEach(function (l) { state.mailed[l.email] = "fout"; });
        if (data && !data.ok) status("Gmail-check: " + String(data.error || "").replace(/^gmail:\s*/, "") + (/permission|toestemming|autori/i.test(data.error || "") ? " Draai testGmail in de editor om toegang te geven." : ""));
        else status("Gmail-check vraagt scriptversie 8.");
      } else {
        leads.forEach(function (l) { state.mailed[l.email] = data.mailed[l.email] || null; });
      }
      document.querySelectorAll(".fb-mail[data-email]").forEach(function (n) { paintMail(n, n.getAttribute("data-email")); });
    }).catch(function () {
      leads.forEach(function (l) { state.mailed[l.email] = "fout"; });
      document.querySelectorAll(".fb-mail[data-email]").forEach(function (n) { paintMail(n, n.getAttribute("data-email")); });
    });
  }

  // Vanuit "alle talks" direct naar de feedback van een talk.
  function openFeedback(code) {
    state.openCode = normCode(code);
    location.hash = "#feedback";
    renderFeedback();
    setTimeout(function () {
      var row = document.querySelector(".fb-row.is-open");
      if (row) row.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  start();
})();
