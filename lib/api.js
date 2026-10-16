// Centrale datalaag voor alle schermen (formulier, dashboard, beheer).
// Alle opslag loopt via dit bestand. Stappen we later over van Google Sheets
// naar een database, dan verandert alleen dit bestand.
(function () {
  var endpoint = (window.FEEDBACK_CONFIG || {}).endpoint;
  var STORE = "ynzo-dashboard-key";

  function getKey() { try { return localStorage.getItem(STORE) || ""; } catch (e) { return ""; } }
  function setKey(k) { try { localStorage.setItem(STORE, k); } catch (e) {} }
  function clearKey() { try { localStorage.removeItem(STORE); } catch (e) {} }

  // Sleutel kan eenmalig via #key=... in de link meekomen.
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("key")) {
    setKey(hash.get("key"));
    history.replaceState(null, "", location.pathname + location.search);
  }

  function get(params) {
    if (!endpoint) return Promise.reject(new Error("Geen koppeling met de Google Sheet ingesteld."));
    var q = new URLSearchParams(params);
    q.set("t", Date.now());
    return fetch(endpoint + "?" + q.toString()).then(function (r) { return r.json(); });
  }

  function withKey(params) {
    var p = Object.assign({}, params, { key: getKey() });
    return get(p).then(function (data) {
      if (!data.ok && data.error === "geen toegang") clearKey();
      return data;
    });
  }

  // Alleen eigen paden, nooit een externe site.
  function safePath(v) {
    return /^\/(?!\/)[a-z0-9\-\/]*$/.test(String(v || "")) ? v : "";
  }

  function slugify(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  window.YnzoApi = {
    getKey: getKey,
    setKey: setKey,
    clearKey: clearKey,
    safePath: safePath,
    slugify: slugify,
    // Feedback plus talks, voor het dashboard.
    feedback: function () { return withKey({}); },
    talks: function () { return withKey({ action: "talks" }); },
    // Aankomende talks uit Google Agenda.
    agenda: function () { return withKey({ action: "agenda" }); },
    // Per lead: laatste verzonden mail sinds de reactie (uit Gmail), of null.
    // Handmatig "contact gehad" aan- of uitvinken bij een reactie.
    setContact: function (row, on) { return withKey({ action: "setContact", rij: row.rij, tijd: row.tijd, value: on ? "1" : "0" }); },
    mailed: function (leads) { return withKey({ action: "mailed", leads: JSON.stringify(leads) }); },
    saveTalk: function (talk) { return withKey(Object.assign({ action: "saveTalk" }, talk)); },
    deleteTalk: function (code) { return withKey({ action: "deleteTalk", code: code }); },
    // Openbaar: welke hand-out hoort bij deze talk.
    handoutFor: function (code) {
      return get({ talk: code }).then(function (d) { return safePath(d && d.handout); });
    },
    handouts: function () {
      return fetch("/handouts.json", { cache: "no-store" }).then(function (r) { return r.json(); });
    }
  };
})();
