// Plak dit in Extensies > Apps Script van je Google Sheet (zie README).
// Elke inzending wordt een nieuwe rij in het tabblad "Feedback".

var SHEET_NAME = "Feedback";
var HEADERS = ["Tijdstip", "Event", "Cijfer", "Waarom", "Interesse in talk", "E-mail", "Organisatie"];

// Tabblad met je talks: welke QR-code bij welke hand-out hoort.
var TALKS_SHEET = "Talks";
var TALK_HEADERS = ["Code", "Naam", "Datum", "Hand-out"];

// Vul je eigen adres in om bij elke lead een mail te krijgen. Leeg laten = geen mail.
var NOTIFY_EMAIL = "";

// Geheime sleutel voor je dashboard. Verzin zelf een lange code (minimaal 16 tekens)
// en vul die hieronder in. Leeg laten = dashboard staat uit.
var DASHBOARD_KEY = "";

// Open de web-app-URL in je browser om te zien welke versie live staat.
var SCRIPT_VERSION = "6 (talks en hand-outs)";

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

  var values = getSheet().getDataRange().getValues();
  var rows = [];
  values.slice(1).forEach(function (r) {
    var tijd = toDate(r[0]);
    var cijfer = Number(r[2]);
    if (!tijd || !(cijfer >= 1 && cijfer <= 10)) return;
    rows.push({
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
        handout: String(r[3] || "")
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
    var row = [code, clean(p.naam, 200), clean(p.datum, 20), safePath(p.handout)];
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === code) {
        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
        return { ok: true, talks: getTalks() };
      }
    }
    sheet.appendRow(row);
    return { ok: true, talks: getTalks() };
  } finally {
    lock.releaseLock();
  }
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
