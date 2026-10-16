// Eenmalig: verzamelt kandidaten voor het CRM uit je agenda en Gmail.
// Zet dit als tweede bestand in je Apps Script-project (Bestanden > + > Script)
// en draai de functies vanuit de editor. Er gaat niets naar buiten: alles komt
// in het tabblad "Te beoordelen" van deze sheet.
//
//  1. verzamelAgenda()  - afspraken die op een talk of voorgesprek lijken
//  2. verzamelGmail()   - binnengekomen mails die op een aanvraag lijken
//
// Allebei mogen vaker draaien: wat al in "Te beoordelen" staat (Bron-ID) slaan
// ze over. Gmail stopt na ongeveer 5 minuten en gaat bij de volgende keer verder
// waar hij was. Draai hem dus een paar keer tot hij "klaar" meldt.

var VERZAMEL_VANAF = "2020-07-01";
var KANDIDATEN_SHEET = "Te beoordelen";
var KANDIDATEN_HEADERS = ["Bron", "Bron-ID", "Datum", "Onderwerp", "Van / gasten", "E-mailadressen", "Locatie", "Fragment", "Link", "Beoordeling"];

// Woorden die op een talk, aanvraag of voorgesprek wijzen.
var AGENDA_WOORDEN = /\b(talk|keynote|lezing|spreker|spreken|speaker|sessie|session|workshop|dagvoorzitter|inspiratie|voorgesprek|kennismaking|briefing|intake|presentatie|congres|event)\b/i;

// Sprekersbureaus en organisatoren uit je facturen. Mails van deze domeinen
// tellen altijd mee.
var BUREAUS = ["speakersacademy.nl", "sprekershuys.nl", "thriveinstitute.nl", "booktalks.nl", "doortraining.nl",
  "effectgroep.nl", "speakersonline.nl", "nexxworks.com", "assemblee.nl", "verhaalmetimpact.nl", "marcusevansbb.com",
  "serenevents.com", "loveforleadership.com"];

var GMAIL_ZOEKOPDRACHTEN = [
  '(talk OR keynote OR lezing OR spreker OR dagvoorzitter OR inspiratiesessie OR sprekersbureau OR "als spreker" OR speaker) -from:me',
  '(aanvraag OR beschikbaarheid OR beschikbaar OR optie OR offerte) (talk OR keynote OR lezing OR sessie OR spreker) -from:me',
  "from:(" + BUREAUS.join(" OR ") + ")"
];

function verzamelAgenda() {
  var cal = CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID) : CalendarApp.getDefaultCalendar();
  var sheet = kandidatenSheet();
  var bekend = bekendeIds(sheet);
  var tz = Session.getScriptTimeZone();
  var me = Session.getActiveUser().getEmail().toLowerCase();
  var start = new Date(VERZAMEL_VANAF), eind = new Date(Date.now() + 365 * 86400000);
  var nieuw = [];
  // Per kwartaal, zodat grote agenda's niet in één keer hoeven.
  for (var van = new Date(start); van < eind; van = new Date(van.getFullYear(), van.getMonth() + 3, 1)) {
    var tot = new Date(van.getFullYear(), van.getMonth() + 3, 1);
    cal.getEvents(van, tot).forEach(function (ev) {
      var tekst = (ev.getTitle() || "") + " " + (ev.getDescription() || "");
      if (!AGENDA_WOORDEN.test(tekst)) return;
      var id = "agenda:" + ev.getId() + "|" + ev.getStartTime().getTime();
      if (bekend[id]) return;
      bekend[id] = true;
      var gasten = ev.getGuestList().map(function (g) { return g.getEmail().toLowerCase(); })
        .filter(function (m) { return m && m !== me; });
      nieuw.push(["agenda", id, Utilities.formatDate(ev.getStartTime(), tz, "yyyy-MM-dd HH:mm"),
        clean(ev.getTitle(), 200), clean(gasten.join(", "), 500), clean(gasten.join(", "), 500),
        clean(ev.getLocation(), 200), clean(platteTekst(ev.getDescription()), 500), "", ""]);
    });
  }
  schrijf(sheet, nieuw);
  Logger.log(nieuw.length + " afspraken toegevoegd aan '" + KANDIDATEN_SHEET + "'.");
}

function verzamelGmail() {
  var props = PropertiesService.getScriptProperties();
  var stand = JSON.parse(props.getProperty("gmailStand") || '{"q":0,"start":0}');
  if (stand.q >= GMAIL_ZOEKOPDRACHTEN.length) { Logger.log("Gmail is al klaar. Wis 'gmailStand' in de scripteigenschappen om opnieuw te beginnen."); return; }
  var sheet = kandidatenSheet();
  var bekend = bekendeIds(sheet);
  var tz = Session.getScriptTimeZone();
  var vanaf = VERZAMEL_VANAF.replace(/-/g, "/");
  var me = Session.getActiveUser().getEmail().toLowerCase();
  var begin = Date.now(), nieuw = [];
  while (stand.q < GMAIL_ZOEKOPDRACHTEN.length && Date.now() - begin < 5 * 60 * 1000) {
    var threads = GmailApp.search(GMAIL_ZOEKOPDRACHTEN[stand.q] + " after:" + vanaf, stand.start, 100);
    threads.forEach(function (t) {
      var id = "gmail:" + t.getId();
      if (bekend[id]) return;
      bekend[id] = true;
      var m = t.getMessages()[0];
      var adressen = (m.getFrom() + "," + m.getTo() + "," + m.getCc()).toLowerCase().match(/[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
      nieuw.push(["gmail", id, Utilities.formatDate(m.getDate(), tz, "yyyy-MM-dd HH:mm"), clean(t.getFirstMessageSubject(), 200),
        clean(m.getFrom(), 200), clean(uniek(adressen).filter(function (a) { return a !== me; }).join(", "), 500), "", clean(platteTekst(m.getPlainBody()), 500),
        "https://mail.google.com/mail/u/0/#all/" + t.getId(), ""]);
    });
    if (threads.length < 100) { stand.q++; stand.start = 0; } else stand.start += 100;
    if (nieuw.length > 300) { schrijf(sheet, nieuw); nieuw = []; }
  }
  schrijf(sheet, nieuw);
  props.setProperty("gmailStand", JSON.stringify(stand));
  Logger.log(stand.q >= GMAIL_ZOEKOPDRACHTEN.length ? "Klaar met Gmail." : "Nog niet klaar. Draai verzamelGmail nog een keer.");
}

function kandidatenSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(KANDIDATEN_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(KANDIDATEN_SHEET);
    sheet.appendRow(KANDIDATEN_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function bekendeIds(sheet) {
  var out = {};
  if (sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) out[r[0]] = true; });
  return out;
}

function schrijf(sheet, rows) {
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function platteTekst(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function uniek(a) {
  return a.filter(function (x, i) { return a.indexOf(x) === i; });
}
