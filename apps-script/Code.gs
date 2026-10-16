// Plak dit in Extensies > Apps Script van je Google Sheet (zie README).
// Elke inzending wordt een nieuwe rij in het tabblad "Feedback".

var SHEET_NAME = "Feedback";
var HEADERS = ["Tijdstip", "Event", "Cijfer", "Waarom", "Interesse in talk", "E-mail", "Organisatie", "Contact gehad", "Gemaild"];

// Tabblad met je talks: welke QR-code bij welke hand-out hoort.
var TALKS_SHEET = "Talks";
var TALK_HEADERS = ["Code", "Naam", "Datum", "Hand-out", "Agenda-ID"];

// Agenda: afspraken met dit woord in de beschrijving (of titel) gelden als talk.
// Leeg CALENDAR_ID = je standaardagenda.
var CALENDAR_ID = "";
var TALK_WORD = "talk";
var AGENDA_DAYS = 180;

// Vul je eigen adres in om bij elke lead een mail te krijgen. Leeg laten = geen mail.
var NOTIFY_EMAIL = "";

// Geheime sleutel voor je dashboard. Verzin zelf een lange code (minimaal 16 tekens)
// en vul die hieronder in. Leeg laten = dashboard staat uit.
var DASHBOARD_KEY = "";

// Open de web-app-URL in je browser om te zien welke versie live staat.
var SCRIPT_VERSION = "12 (crm-overzicht)";

function doGet(e) {
  var p = (e && e.parameter) || {};

  // Openbaar: alleen het pad van de hand-out bij een talk, verder niets.
  if (p.talk) {
    var talk = findTalk(p.talk);
    return respond({ ok: true, handout: talk ? talk.handout : "" });
  }

  if (!p.key) return respond({ ok: true, versie: SCRIPT_VERSION });
  if (!DASHBOARD_KEY || DASHBOARD_KEY.length < 16 || p.key !== DASHBOARD_KEY) {
    return respond({ ok: false, error: "geen toegang" });
  }

  if (p.action === "saveTalk") return respond(saveTalk(p));
  if (p.action === "deleteTalk") return respond(deleteTalk(p.code));
  if (p.action === "talks") return respond({ ok: true, versie: SCRIPT_VERSION, talks: getTalks() });
  if (p.action === "setContact") return respond(setContact(p));
  if (p.action === "crm") return respond(crmLijst());
  if (p.action === "setKans") return respond(setKans(p));
  if (p.action === "mailed") {
    try {
      return respond({ ok: true, versie: SCRIPT_VERSION, mailed: mailedSince(p.leads) });
    } catch (err) {
      return respond({ ok: false, error: "gmail: " + String(err) });
    }
  }
  if (p.action === "agenda") {
    try {
      return respond({ ok: true, versie: SCRIPT_VERSION, agenda: getAgenda() });
    } catch (err) {
      return respond({ ok: false, error: "agenda: " + String(err) });
    }
  }

  var values = getSheet().getDataRange().getValues();
  var rows = [];
  values.slice(1).forEach(function (r, i) {
    var tijd = toDate(r[0]);
    var cijfer = Number(r[2]);
    if (!tijd || !(cijfer >= 1 && cijfer <= 10)) return;
    var contact = toDate(r[7]);
    var gemaild = toDate(r[8]);
    rows.push({
      rij: i + 2,
      contact: contact ? contact.toISOString() : (r[7] ? String(r[7]) : ""),
      gemaild: gemaild ? gemaild.toISOString() : "",
      tijd: tijd.toISOString(),
      event: String(r[1] || ""),
      cijfer: cijfer,
      waarom: String(r[3] || ""),
      interesse: String(r[4]).trim().toLowerCase() === "ja",
      email: String(r[5] || ""),
      organisatie: String(r[6] || "")
    });
  });
  return respond({ ok: true, versie: SCRIPT_VERSION, rows: rows, talks: getTalks(), aantalRijen: Math.max(values.length - 1, 0) });
}

function getTalksSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TALKS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TALKS_SHEET);
    sheet.appendRow(TALK_HEADERS);
    sheet.setFrozenRows(1);
  }
  var current = sheet.getRange(1, 1, 1, TALK_HEADERS.length).getValues()[0];
  TALK_HEADERS.forEach(function (h, i) {
    if (!current[i]) sheet.getRange(1, i + 1).setValue(h);
  });
  return sheet;
}

function getTalks() {
  return getTalksSheet().getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      var d = toDate(r[2]);
      return {
        code: String(r[0]),
        naam: String(r[1] || ""),
        datum: d ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(r[2] || ""),
        handout: String(r[3] || ""),
        agendaId: String(r[4] || "")
      };
    });
}

function findTalk(code) {
  code = String(code);
  var all = getTalks();
  for (var i = 0; i < all.length; i++) if (all[i].code === code) return all[i];
  return null;
}

// Alleen eigen paden zoals /samenvatting/ of /handouts/naam/, nooit een externe site.
function safePath(v) {
  v = String(v || "");
  return /^\/(?!\/)[a-z0-9\-\/]*$/.test(v) ? v : "";
}

function saveTalk(p) {
  var code = String(p.code || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  if (!code) return { ok: false, error: "geen code" };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getTalksSheet();
    var values = sheet.getDataRange().getValues();
    var row = [code, clean(p.naam, 200), clean(p.datum, 20), safePath(p.handout), clean(p.agendaId, 300)];
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === code) {
        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
        return { ok: true, talks: getTalks() };
      }
    }
    sheet.appendRow(row);
    // Interesse? Dan ook als lead in het CRM (tabblad CRM, zie CRM.gs).
    if (data.interest && typeof kansVanLead === "function") {
      try { kansVanLead(row); } catch (err) { console.error(err); }
    }
    return { ok: true, talks: getTalks() };
  } finally {
    lock.releaseLock();
  }
}

// Aankomende afspraken met het woord "talk" in beschrijving of titel.
function getAgenda() {
  var cal = CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error("agenda niet gevonden");
  var start = new Date();
  start.setHours(0, 0, 0, 0);
  var end = new Date(start.getTime() + AGENDA_DAYS * 86400000);
  var re = new RegExp("\\b" + TALK_WORD + "\\b", "i");
  var tz = Session.getScriptTimeZone();
  return cal.getEvents(start, end).filter(function (ev) {
    return re.test(ev.getDescription() || "") || re.test(ev.getTitle() || "");
  }).map(function (ev) {
    return {
      id: ev.getId() + "|" + ev.getStartTime().getTime(),
      titel: ev.getTitle(),
      start: ev.getStartTime().toISOString(),
      datum: Utilities.formatDate(ev.getStartTime(), tz, "yyyy-MM-dd"),
      tijd: ev.isAllDayEvent() ? "" : Utilities.formatDate(ev.getStartTime(), tz, "HH:mm"),
      locatie: ev.getLocation() || ""
    };
  });
}

// Zet of wis "Contact gehad" bij een reactie. Controleert eerst of de rij nog
// dezelfde reactie is (tijdstip), zodat sorteren in de sheet geen kwaad kan.
function setContact(p) {
  var sheet = getSheet();
  var rij = findRow(sheet.getDataRange().getValues(), p.rij, p.tijd);
  if (!rij) return { ok: false, error: "reactie niet gevonden" };
  var value = p.value === "1" ? new Date() : "";
  sheet.getRange(rij, 8).setValue(value);
  return { ok: true, rij: rij, contact: value ? value.toISOString() : "" };
}

// Zoekt de rij van een reactie: eerst op het opgegeven rijnummer, en klopt het
// tijdstip daar niet (sheet gesorteerd), dan in de hele sheet.
function findRow(values, rij, tijd) {
  var match = function (n) {
    var r = values[n - 1];
    var t = r && toDate(r[0]);
    return t && t.toISOString() === tijd;
  };
  rij = Number(rij);
  if (rij >= 2 && match(rij)) return rij;
  for (var i = 2; i <= values.length; i++) if (match(i)) return i;
  return 0;
}

// Is er sinds de reactie een mail naar deze lead verstuurd? Kijkt alleen in je
// verzonden mail. leads = JSON-lijst van { email, since (ISO-datum) }.
function mailedSince(leadsJson) {
  var leads = [];
  try { leads = JSON.parse(leadsJson || "[]"); } catch (e) { leads = []; }
  var out = {};
  var sheet = null, values = null;
  leads.slice(0, 50).forEach(function (l) {
    var email = String(l.email || "").trim().toLowerCase();
    if (!/^[^\s@"()<>,;:]+@[^\s@"()<>,;:]+\.[a-z]{2,}$/.test(email)) return;
    var since = new Date(l.since);
    if (isNaN(since.getTime())) return;
    var q = "in:sent to:" + email + " after:" + Math.floor(since.getTime() / 1000);
    var latest = null;
    GmailApp.search(q, 0, 10).forEach(function (thread) {
      thread.getMessages().forEach(function (m) {
        var to = (m.getTo() + "," + m.getCc() + "," + m.getBcc()).toLowerCase();
        if (m.getDate() > since && to.indexOf(email) >= 0 && (!latest || m.getDate() > latest)) latest = m.getDate();
      });
    });
    out[email] = latest ? latest.toISOString() : null;
    // Gevonden? Dan onthouden in de kolom Gemaild, zodat we niet opnieuw zoeken.
    if (latest && l.tijd) {
      if (!sheet) { sheet = getSheet(); values = sheet.getDataRange().getValues(); }
      var rij = findRow(values, l.rij, l.tijd);
      if (rij) sheet.getRange(rij, 9).setValue(latest);
    }
  });
  return out;
}

// Draai deze functie één keer in de editor om Google toegang tot je Gmail te geven.
function testGmail() {
  Logger.log(GmailApp.search("in:sent", 0, 1).length + " verzonden gesprek(ken) gevonden. Toegang werkt.");
}

// Draai deze functie één keer in de editor om Google toegang tot je agenda te geven.
function testAgenda() {
  Logger.log(JSON.stringify(getAgenda(), null, 2));
}

function deleteTalk(code) {
  var sheet = getTalksSheet();
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === String(code)) sheet.deleteRow(i + 1);
  }
  return { ok: true, talks: getTalks() };
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents);
    var score = Number(data.score);
    if (!(score >= 1 && score <= 10)) return respond({ ok: false, error: "invalid score" });

    var sheet = getSheet();
    var row = [
      new Date(),
      clean(data.event, 100),
      score,
      clean(data.reason, 2000),
      data.interest ? "Ja" : "Nee",
      clean(data.email, 320),
      clean(data.organisation, 200)
    ];
    sheet.appendRow(row);

    if (data.interest && NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: "Nieuwe lead na keynote: " + (row[6] || row[5]),
        body: [
          "Event: " + row[1],
          "Cijfer: " + row[2],
          "E-mail: " + row[5],
          "Organisatie: " + row[6],
          "",
          "Waarom dit cijfer:",
          row[3]
        ].join("\n")
      });
    }

    return respond({ ok: true });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  // Vult kopjes aan als er later kolommen bij zijn gekomen.
  var current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  HEADERS.forEach(function (h, i) {
    if (!current[i]) sheet.getRange(1, i + 1).setValue(h);
  });
  return sheet;
}

// Zet een cel om naar een datum, ook als Sheets hem als tekst of getal teruggeeft.
function toDate(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000));
  if (v) {
    // Nederlandse notatie, bijvoorbeeld 15-10-2026 18:30:05
    var m = String(v).match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Kapt lengte af en voorkomt dat tekst als formule in de sheet wordt uitgevoerd.
function clean(value, max) {
  var s = String(value == null ? "" : value).slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
