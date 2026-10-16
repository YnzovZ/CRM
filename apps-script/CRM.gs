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

var ARCHIEF_SHEET = "Archief";

// Kolomnummer (vanaf 0) op naam, volgens de kopregel van het tabblad zelf.
// Zo maakt het niet uit als je kolommen verschuift of toevoegt.
function kolommen(values) {
  var out = {};
  (values[0] || []).forEach(function (h, i) { if (h) out[String(h).trim()] = i; });
  KANSEN_HEADERS.forEach(function (h) { if (!(h in out)) out[h] = -1; });
  return out;
}

function veld(row, c, naam) { return c[naam] >= 0 ? String(row[c[naam]] || "").trim() : ""; }

function archiefSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ARCHIEF_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ARCHIEF_SHEET);
    sheet.appendRow(KANSEN_HEADERS.concat(["Gearchiveerd", "Waarom"]));
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Alle bron-ID's in CRM en Archief. Wat in het archief staat, komt niet terug.
function bekendeKansen(values) {
  var out = {};
  [values, archiefSheet().getDataRange().getDisplayValues()].forEach(function (vals) {
    var c = kolommen(vals)["Bron-ID"];
    if (c < 0) return;
    for (var i = 1; i < vals.length; i++) {
      String(vals[i][c] || "").split(/\s+/).forEach(function (id) { if (id) out[id] = true; });
    }
  });
  return out;
}

function volgendId(values) {
  var max = 0;
  var archief = archiefSheet().getDataRange().getDisplayValues();
  [values, archief].forEach(function (vals) {
    var ci = kolommen(vals).ID;
    for (var i = 1; i < vals.length; i++) {
      var m = String(vals[i][ci] || "").match(/^K(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  });
  return max + 1;
}

function vandaag(d) { return Utilities.formatDate(d || new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"); }

// Voegt kansen toe die er nog niet zijn. velden: objecten met kolomnamen als sleutel.
function voegKansenToe(lijst) {
  if (!lijst.length) return 0;
  var sheet = kansenSheet();
  var values = sheet.getDataRange().getDisplayValues();
  var koppen = values[0];
  var bekend = bekendeKansen(values);
  var nr = volgendId(values);
  var rows = [];
  lijst.forEach(function (k) {
    if (bekend[k["Bron-ID"]]) return;
    bekend[k["Bron-ID"]] = true;
    k.ID = "K" + ("0000" + nr++).slice(-5);
    if (!k.Spreker) k.Spreker = "Ynzo";
    if (!k.Periode) k.Periode = "zelfstandig";
    rows.push(koppen.map(function (h) { return clean(k[h] == null ? "" : k[h], 2000); }));
  });
  if (rows.length) {
    var r = sheet.getLastRow() + 1;
    sheet.getRange(r, 1, rows.length, koppen.length).setNumberFormat("@").setValues(rows);
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
  var c = kolommen(values), cs = c.Status, cd = c["Datum talk"], bijgewerkt = 0;
  for (var i = 1; i < values.length; i++) {
    if (values[i][cs] === "geboekt" && values[i][cd] && values[i][cd] < nu) {
      sheet.getRange(i + 1, cs + 1).setValue("gegeven");
      bijgewerkt++;
    }
  }
  Logger.log(toegevoegd + " nieuwe talk(s) uit de agenda, " + bijgewerkt + " op gegeven gezet.");
}

// Grote schoonmaak. Maakt eerst een reservekopie van het tabblad CRM.
// Verhuist naar Archief: status "weg", lege aanvragen, bureau-rondmails en
// Tony's-regels zonder gegevens. Dubbele rijen (zelfde organisatie en talkdatum)
// worden samengevoegd tot één rij.
function opschonen(zonderKopie) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = kansenSheet();
  if (!zonderKopie) sheet.copyTo(ss).setName(KANSEN_SHEET + " kopie " + vandaag());
  var values = sheet.getDataRange().getDisplayValues();
  var c = kolommen(values), koppen = values[0];
  var houden = [], weg = [], telling = {}, nu = vandaag();
  var tel = function (w) { telling[w] = (telling[w] || 0) + 1; };

  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r.join("")) continue;
    var status = veld(r, c, "Status").toLowerCase(), periode = veld(r, c, "Periode");
    var org = veld(r, c, "Organisatie"), mail = veld(r, c, "E-mail"), bureau = veld(r, c, "Via bureau");
    var waarom = "";
    if (status === "weg") waarom = "handmatig";
    else if (status === "verlopen" && periode !== "Tony's" && !org && !mail) waarom = "lege aanvraag";
    else if (status === "verlopen" && periode !== "Tony's" && bureau && !mail) waarom = "bureau-rondmail";
    else if (periode === "Tony's" && !org && !mail) waarom = "Tony's zonder gegevens";
    if (waarom) { weg.push(r.concat([nu, waarom])); tel(waarom); } else houden.push(r);
  }

  // Dubbelen samenvoegen: de rij met de meeste gegevens blijft, de rest vult aan.
  var sleutel = function (r) {
    var o = veld(r, c, "Organisatie").toLowerCase().replace(/[^a-z0-9]/g, ""), d = veld(r, c, "Datum talk");
    return o && d ? o + "|" + d : "";
  };
  var groepen = {}, volgorde = [];
  houden.forEach(function (r) {
    var k = sleutel(r) || ("los" + volgorde.length);
    if (!groepen[k]) { groepen[k] = []; volgorde.push(k); }
    groepen[k].push(r);
  });
  var cb = c["Bron-ID"];
  houden = volgorde.map(function (k) {
    var g = groepen[k];
    if (g.length === 1) return g[0];
    g.sort(function (a, b) { return b.filter(String).length - a.filter(String).length; });
    var hoofd = g[0].slice();
    g.slice(1).forEach(function (r) {
      tel("dubbel samengevoegd");
      r.forEach(function (v, j) {
        if (j === cb) hoofd[j] = (hoofd[j] + " " + v).trim();
        else if (!hoofd[j] && v) hoofd[j] = v;
      });
    });
    return hoofd;
  });

  if (weg.length) {
    var a = archiefSheet();
    var ak = a.getRange(1, 1, 1, a.getLastColumn()).getDisplayValues()[0];
    var rows = weg.map(function (r) {
      return ak.map(function (h) {
        if (h === "Gearchiveerd") return r[koppen.length];
        if (h === "Waarom") return r[koppen.length + 1];
        var j = koppen.indexOf(h);
        return j >= 0 ? r[j] : "";
      });
    });
    a.getRange(a.getLastRow() + 1, 1, rows.length, ak.length).setNumberFormat("@").setValues(rows);
  }
  sheet.getRange(2, 1, Math.max(values.length - 1, 1), koppen.length).clearContent();
  if (houden.length) sheet.getRange(2, 1, houden.length, koppen.length).setNumberFormat("@").setValues(houden);
  Logger.log("Opgeschoond: " + JSON.stringify(telling) + ". Over in CRM: " + houden.length + " rijen.");
}

// Dagelijks: alleen rijen met status "weg" naar het archief, de rest blijft
// precies staan (ook je opmaak).
function archiveerWeg() {
  var sheet = kansenSheet();
  var values = sheet.getDataRange().getDisplayValues();
  var c = kolommen(values), koppen = values[0], nu = vandaag(), rijen = [];
  for (var i = values.length - 1; i >= 1; i--) {
    if (veld(values[i], c, "Status").toLowerCase() === "weg") rijen.push(i);
  }
  if (!rijen.length) return;
  var a = archiefSheet();
  var ak = a.getRange(1, 1, 1, a.getLastColumn()).getDisplayValues()[0];
  var rows = rijen.map(function (i) {
    return ak.map(function (h) {
      if (h === "Gearchiveerd") return nu;
      if (h === "Waarom") return "handmatig";
      var j = koppen.indexOf(h);
      return j >= 0 ? values[i][j] : "";
    });
  });
  a.getRange(a.getLastRow() + 1, 1, rows.length, ak.length).setNumberFormat("@").setValues(rows);
  rijen.forEach(function (i) { sheet.deleteRow(i + 1); });
}

function dagelijks() {
  syncAgenda();
  archiveerWeg();
}

// Eén keer draaien in de editor: zet de dagelijkse controle om 6 uur 's ochtends aan.
function installeerDagelijks() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "dagelijks") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dagelijks").timeBased().everyDays(1).atHour(6).create();
  dagelijks();
}
