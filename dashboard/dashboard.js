(function () {
  var endpoint = (window.FEEDBACK_CONFIG || {}).endpoint;
  var TZ = "Europe/Amsterdam";
  var STORE = "ynzo-dashboard-key";

  var $ = function (id) { return document.getElementById(id); };
  var state = { rows: [], days: [], index: 0, talk: -1 };

  // Een nieuwe talk begint na een gat van meer dan 90 minuten, mits er daarna
  // minstens 3 reacties volgen. Losse nakomers tellen mee bij de talk ervoor.
  var GAP_MS = 90 * 60 * 1000;
  var MIN_TALK = 3;

  function splitTalks(rows) {
    var sorted = rows.slice().sort(function (a, b) { return a.date - b.date; });
    var groups = [];
    sorted.forEach(function (r, i) {
      if (!i || r.date - sorted[i - 1].date > GAP_MS) groups.push([]);
      groups[groups.length - 1].push(r);
    });
    var talks = [];
    groups.forEach(function (g) {
      if (talks.length && g.length < MIN_TALK) talks[talks.length - 1] = talks[talks.length - 1].concat(g);
      else talks.push(g);
    });
    return talks;
  }

  // Opslag kan ontbreken (privévenster), dus altijd in try/catch.
  function getKey() { try { return localStorage.getItem(STORE) || ""; } catch (e) { return ""; } }
  function setKey(k) { try { localStorage.setItem(STORE, k); } catch (e) {} }
  function clearKey() { try { localStorage.removeItem(STORE); } catch (e) {} }

  // Sleutel kan ook eenmalig via #key=... in de link meekomen.
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("key")) {
    setKey(hash.get("key"));
    history.replaceState(null, "", location.pathname);
  }
  var sessionKey = getKey();

  var dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  var labelFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  var timeFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  var numFmt = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function dayKey(d) { return dayFmt.format(d); }

  function status(text) { $("status").textContent = text || ""; }

  function showLogin(message) {
    $("dash").hidden = true;
    $("login").hidden = false;
    $("login-error").hidden = !message;
    $("login-error").textContent = message || "";
    status("");
  }

  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    sessionKey = $("key").value.trim();
    setKey(sessionKey);
    load();
  });

  $("logout").addEventListener("click", function () {
    clearKey();
    sessionKey = "";
    $("key").value = "";
    showLogin();
  });

  $("refresh").addEventListener("click", function () { load(true); });
  $("prev").addEventListener("click", function () { go(1); });
  $("next").addEventListener("click", function () { go(-1); });

  function go(step) {
    var i = state.index + step;
    if (i < 0 || i >= state.days.length) return;
    state.index = i;
    state.talk = -1;
    render();
    window.scrollTo(0, 0);
  }

  function load(keepDay) {
    if (!endpoint) { status("Geen koppeling met de Google Sheet ingesteld."); return; }
    if (!sessionKey) { showLogin(); return; }
    var current = state.days[state.index];
    status("Even laden...");
    fetch(endpoint + "?key=" + encodeURIComponent(sessionKey) + "&t=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) {
          clearKey();
          sessionKey = "";
          showLogin(data.error === "geen toegang" ? "Deze sleutel klopt niet." : "Er ging iets mis: " + data.error);
          return;
        }
        if (!data.rows) {
          showLogin("Het script in Google is nog niet bijgewerkt naar de dashboardversie. Nu live: versie " + (data.versie || "onbekend") + ". Nodig: versie 5.");
          return;
        }
        state.sheetRows = data.aantalRijen || 0;
        state.rows = data.rows.map(function (r) { r.date = new Date(r.tijd); r.day = dayKey(r.date); return r; });
        var seen = {};
        state.days = state.rows.map(function (r) { return r.day; })
          .filter(function (d) { return seen[d] ? false : (seen[d] = true); })
          .sort().reverse();
        var keep = keepDay && current ? state.days.indexOf(current) : -1;
        state.index = keep >= 0 ? keep : 0;
        if (keep < 0) state.talk = -1;
        $("updated").textContent = "Bijgewerkt om " + timeFmt.format(new Date());
        $("login").hidden = true;
        $("dash").hidden = false;
        status("");
        render();
      })
      .catch(function () {
        status("Kan de gegevens nu niet ophalen. Check je verbinding en probeer het opnieuw.");
      });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function render() {
    var day = state.days[state.index];
    $("prev").disabled = state.index >= state.days.length - 1;
    $("next").disabled = state.index <= 0;

    if (!day) {
      $("day-label").textContent = "Nog geen reacties";
      $("day-event").textContent = "";
      $("avg").textContent = "-";
      $("meta").textContent = state.sheetRows
        ? "Het script ziet " + state.sheetRows + " rijen in je sheet, maar kan ze niet lezen. Stuur Claude een screenshot van je sheet."
        : "Zodra iemand het formulier invult, zie je het hier.";
      $("dist").innerHTML = "";
      $("leads-wrap").hidden = true;
      $("list").innerHTML = "";
      $("silent").hidden = true;
      return;
    }

    var dayRows = state.rows.filter(function (r) { return r.day === day; });
    var talks = splitTalks(dayRows);
    if (state.talk < 0 || state.talk >= talks.length) state.talk = talks.length - 1;
    renderTalks(talks);
    var rows = talks[state.talk].slice().sort(function (a, b) { return b.date - a.date; });

    var label = labelFmt.format(rows[0].date);
    $("day-label").textContent = (day === dayKey(new Date()) ? "vandaag, " : "") + label;
    var events = rows.map(function (r) { return r.event; })
      .filter(function (e, i, a) { return e && e !== "algemeen" && a.indexOf(e) === i; });
    $("day-event").textContent = events.join(", ");

    var sum = rows.reduce(function (s, r) { return s + r.cijfer; }, 0);
    var leads = rows.filter(function (r) { return r.interesse; });
    $("avg").textContent = numFmt.format(sum / rows.length);
    $("meta").textContent = rows.length + (rows.length === 1 ? " reactie" : " reacties") +
      (leads.length ? ", " + leads.length + " met interesse" : "");

    // Verdeling van de cijfers 1 t/m 10
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    rows.forEach(function (r) { if (r.cijfer >= 1 && r.cijfer <= 10) counts[r.cijfer - 1]++; });
    var max = Math.max.apply(null, counts);
    var dist = $("dist");
    dist.innerHTML = "";
    counts.forEach(function (c) {
      var bar = el("div", "bar" + (c ? "" : " empty"));
      var fill = el("i");
      fill.style.height = c ? Math.max(8, (c / max) * 100) + "%" : "2px";
      if (c) fill.appendChild(el("b", null, String(c)));
      bar.appendChild(fill);
      dist.appendChild(bar);
    });
    dist.setAttribute("aria-label", "Verdeling: " + counts.map(function (c, i) { return c ? (i + 1) + ": " + c + "x" : null; }).filter(Boolean).join(", "));

    // Leads
    var leadList = $("leads");
    leadList.innerHTML = "";
    $("leads-wrap").hidden = !leads.length;
    leads.forEach(function (r) {
      var li = el("li", "lead");
      li.appendChild(el("div", "lead-org", r.organisatie || "Organisatie niet ingevuld"));
      if (r.email) {
        var a = el("a", null, r.email);
        a.href = "mailto:" + r.email;
        li.appendChild(a);
      }
      li.appendChild(el("div", "lead-meta", "Gaf een " + r.cijfer + " om " + timeFmt.format(r.date)));
      leadList.appendChild(li);
    });

    // Losse feedback
    var list = $("list");
    list.innerHTML = "";
    var withText = rows.filter(function (r) { return r.waarom.trim(); });
    withText.forEach(function (r) {
      var li = el("li", "item");
      li.appendChild(el("div", "score" + (r.cijfer < 6 ? " low" : ""), String(r.cijfer)));
      var body = el("div", "item-body");
      body.appendChild(el("p", "item-text", r.waarom));
      body.appendChild(el("p", "item-meta", timeFmt.format(r.date) + (r.organisatie ? " · " + r.organisatie : "")));
      li.appendChild(body);
      list.appendChild(li);
    });
    if (!withText.length) list.appendChild(el("li", "empty-day", "Niemand schreef een toelichting."));

    var silent = rows.length - withText.length;
    $("silent").hidden = !silent || !withText.length;
    $("silent").textContent = silent + (silent === 1 ? " persoon gaf" : " mensen gaven") + " alleen een cijfer.";
  }

  function renderTalks(talks) {
    var bar = $("talks");
    bar.innerHTML = "";
    bar.hidden = talks.length < 2;
    if (talks.length < 2) return;
    talks.forEach(function (t, i) {
      var b = el("button", "talk", "Talk " + (i + 1));
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(i === state.talk));
      b.appendChild(el("small", null, timeFmt.format(t[0].date) + " uur, " + t.length + (t.length === 1 ? " reactie" : " reacties")));
      b.addEventListener("click", function () { state.talk = i; render(); });
      bar.appendChild(b);
    });
  }

  load();
})();
