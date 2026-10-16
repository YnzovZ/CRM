// Houdt het tabblad "CRM" bij. Zet dit als derde bestand in je Apps Script-project
// (Bestanden > + > Script, naam "CRM") en draai één keer installeerDagelijks().
//
// - Een QR-reactie met interesse wordt vanzelf een kans met status "lead".
// - Elke ochtend komen nieuwe afspraken met "talk" uit je agenda erbij (status
//   "geboekt"), en gaan geboekte talks waarvan de datum voorbij is naar "gegeven".
//
// Elke rij onthoudt zijn bron in "Bron-ID". Wat er al staat, komt er nooit dubbel in.

var KANSEN_SHEET = "CRM";
var KANSEN_HEADERS = ["ID", "Status", "Soort", "Spreker", "Datum aanvraag", "Datum talk", "Tijdstip", "Organisatie",
  "Contactpersoon", "E-mail", "Telefoon", "Via bureau", "Bureau contactpersoon", "Bureau e-mail", "Locatie", "Land",
  "Taal", "Deelnemers", "Type publiek", "Bedrag excl", "Factuurnummer", "Talkcode", "Reden", "Notities", "Opmerkingen",
  "Periode", "Bron", "Bron-ID"];

function kansenSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(KANSEN_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(KANSEN_SHEET);
    sheet.appendRow(KANSEN_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function kolom(naam) { return KANSEN_HEADERS.indexOf(naam); }

// Alle bron-ID's die al in Kansen staan, met hun rijnummer.
function bekendeKansen(values) {
  var out = {}, c = kolom("Bron-ID");
  for (var i = 1; i < values.length; i++) {
    String(values[i][c] || "").split(/\s+/).forEach(function (id) { if (id) out[id] = i + 1; });
  }
  return out;
}

function volgendId(values) {
  var max = 0;
  for (var i = 1; i < values.length; i++) {
    var m = String(values[i][0] || "").match(/^K(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function vandaag(d) { return Utilities.formatDate(d || new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"); }

// Voegt kansen toe die er nog niet zijn. velden: objecten met kolomnamen als sleutel.
function voegKansenToe(lijst) {
  if (!lijst.length) return 0;
  var sheet = kansenSheet();
  var values = sheet.getDataRange().getDisplayValues();
  var bekend = bekendeKansen(values);
  var nr = volgendId(values);
  var rows = [];
  lijst.forEach(function (k) {
    if (bekend[k["Bron-ID"]]) return;
    bekend[k["Bron-ID"]] = true;
    k.ID = "K" + ("0000" + nr++).slice(-5);
    if (!k.Spreker) k.Spreker = "Ynzo";
    if (!k.Periode) k.Periode = "zelfstandig";
    rows.push(KANSEN_HEADERS.map(function (h) { return clean(k[h] == null ? "" : k[h], 2000); }));
  });
  if (rows.length) {
    var r = sheet.getLastRow() + 1;
    sheet.getRange(r, 1, rows.length, KANSEN_HEADERS.length).setNumberFormat("@").setValues(rows);
  }
  return rows.length;
}

// Wordt aangeroepen vanuit doPost als iemand interesse aanvinkt.
function kansVanLead(rij) {
  voegKansenToe([{
    "Status": "lead",
    "Soort": "talk",
    "Datum aanvraag": vandaag(rij[0]),
    "Organisatie": rij[6],
    "E-mail": String(rij[5] || "").toLowerCase(),
    "Talkcode": rij[1],
    "Notities": "Interesse na talk " + rij[1] + ", gaf een " + rij[2],
    "Bron": "qr",
    "Bron-ID": "qr:" + rij[0].toISOString()
  }]);
}

// Nieuwe talks uit de agenda, plus geboekt > gegeven als de datum voorbij is.
function syncAgenda() {
  var cal = CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID) : CalendarApp.getDefaultCalendar();
  var re = new RegExp("\\b" + TALK_WORD + "\\b", "i");
  var tz = Session.getScriptTimeZone();
  var me = Session.getActiveUser().getEmail().toLowerCase();
  var start = new Date(Date.now() - 14 * 86400000), eind = new Date(Date.now() + 365 * 86400000);
  var nu = vandaag();
  var nieuw = cal.getEvents(start, eind).filter(function (ev) {
    return re.test(ev.getTitle() || "") || re.test(ev.getDescription() || "");
  }).map(function (ev) {
    var datum = Utilities.formatDate(ev.getStartTime(), tz, "yyyy-MM-dd");
    var gasten = ev.getGuestList().map(function (g) { return g.getEmail().toLowerCase(); })
      .filter(function (m) { return m && m !== me; });
    return {
      "Status": datum < nu ? "gegeven" : "geboekt",
      "Soort": "talk",
      "Datum talk": datum,
      "Tijdstip": ev.isAllDayEvent() ? "" : Utilities.formatDate(ev.getStartTime(), tz, "HH:mm"),
      "E-mail": gasten[0] || "",
      "Locatie": ev.getLocation() || "",
      "Notities": ev.getTitle(),
      "Opmerkingen": "nieuw uit agenda: organisatie en contact aanvullen",
      "Bron": "agenda",
      "Bron-ID": "agenda:" + ev.getId() + "|" + ev.getStartTime().getTime()
    };
  });
  var toegevoegd = voegKansenToe(nieuw);

  // Geboekte talks in het verleden zijn gegeven.
  var sheet = kansenSheet();
  var values = sheet.getDataRange().getDisplayValues();
  var cs = kolom("Status"), cd = kolom("Datum talk"), bijgewerkt = 0;
  for (var i = 1; i < values.length; i++) {
    if (values[i][cs] === "geboekt" && values[i][cd] && values[i][cd] < nu) {
      sheet.getRange(i + 1, cs + 1).setValue("gegeven");
      bijgewerkt++;
    }
  }
  Logger.log(toegevoegd + " nieuwe talk(s) uit de agenda, " + bijgewerkt + " op gegeven gezet.");
}

function dagelijks() {
  syncAgenda();
}

// Eén keer draaien in de editor: zet de dagelijkse controle om 6 uur 's ochtends aan.
function installeerDagelijks() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "dagelijks") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dagelijks").timeBased().everyDays(1).atHour(6).create();
  dagelijks();
}
