// Plak dit in Extensies > Apps Script van je Google Sheet (zie README).
// Elke inzending wordt een nieuwe rij in het tabblad "Feedback".

var SHEET_NAME = "Feedback";
var HEADERS = ["Tijdstip", "Event", "Cijfer", "Waarom", "Interesse in talk", "E-mail", "Organisatie"];

// Vul je eigen adres in om bij elke lead een mail te krijgen. Leeg laten = geen mail.
var NOTIFY_EMAIL = "";

// Open de web-app-URL in je browser om te zien welke versie live staat.
var SCRIPT_VERSION = "3 (met organisatie)";

function doGet() {
  return respond({ ok: true, versie: SCRIPT_VERSION });
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

// Kapt lengte af en voorkomt dat tekst als formule in de sheet wordt uitgevoerd.
function clean(value, max) {
  var s = String(value == null ? "" : value).slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
