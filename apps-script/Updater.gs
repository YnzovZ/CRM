// Werkt de scriptcode bij vanuit GitHub en zet de nieuwe versie meteen live,
// met dezelfde web-app-URL. Geen kopiëren en plakken meer.
//
// Eenmalig nodig:
//  1. Zet de Apps Script API aan op https://script.google.com/home/usersettings
//  2. Zet in Projectinstellingen "appsscript.json weergeven" aan en vervang dat
//     bestand door apps-script/appsscript.json uit de repo (de rechten die nodig zijn).
//  3. Draai bijwerken() één keer vanuit de editor en geef toestemming.
// Daarna via het menu "Ynzo" in je sheet: één klik, en jij bepaalt wanneer.

var GITHUB_BRON = "https://raw.githubusercontent.com/YnzovZ/CRM/claude/keynote-feedback-qr-0qna9k/apps-script/";
var GITHUB_BESTANDEN = ["Code", "CRM", "Verzamelen", "Updater"];
var API = "https://script.googleapis.com/v1/projects/";

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Ynzo")
    .addItem("Code bijwerken vanuit GitHub", "bijwerkenMenu")
    .addToUi();
}

// Via het menu: laat in een venstertje zien hoe het ging.
function bijwerkenMenu() {
  var ui = SpreadsheetApp.getUi();
  try {
    var uitkomst = bijwerken();
    ui.alert(uitkomst === "al bijgewerkt" ? "Alles is al bijgewerkt." : "Bijgewerkt en live gezet (" + uitkomst + ").");
  } catch (err) {
    ui.alert("Bijwerken lukte niet:\n\n" + err.message);
  }
}

function bijwerken() {
  var id = ScriptApp.getScriptId();
  var auth = { Authorization: "Bearer " + ScriptApp.getOAuthToken() };
  var huidig = apiJson("get", API + id + "/content", auth);
  var bestanden = huidig.files || [];

  // Sleutel en e-mailadres uit de oude code veiligstellen voordat die wordt vervangen.
  var oudeCode = bestanden.filter(function (f) { return f.name === "Code"; })[0];
  if (oudeCode) bewaarInstellingenUit(oudeCode.source);

  var veranderd = false;
  GITHUB_BESTANDEN.forEach(function (naam) {
    var res = UrlFetchApp.fetch(GITHUB_BRON + naam + ".gs?t=" + Date.now(), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error("Kon " + naam + ".gs niet ophalen van GitHub (" + res.getResponseCode() + ")");
    var bron = res.getContentText();
    var f = bestanden.filter(function (x) { return x.name === naam; })[0];
    if (f && f.source === bron) return;
    veranderd = true;
    if (f) f.source = bron;
    else bestanden.push({ name: naam, type: "SERVER_JS", source: bron });
  });

  // Rechten uit de repo samenvoegen met je huidige instellingen (tijdzone, web-app).
  var res = UrlFetchApp.fetch(GITHUB_BRON + "appsscript.json?t=" + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() === 200) {
    var gewenst = JSON.parse(res.getContentText()).oauthScopes || [];
    var m = bestanden.filter(function (x) { return x.name === "appsscript"; })[0];
    if (m) {
      var manifest = JSON.parse(m.source);
      var scopes = manifest.oauthScopes || [];
      gewenst.forEach(function (s) { if (scopes.indexOf(s) < 0) { scopes.push(s); veranderd = true; } });
      manifest.oauthScopes = scopes;
      m.source = JSON.stringify(manifest, null, 2);
    }
  }

  if (!veranderd) { Logger.log("Alles is al bijgewerkt."); return "al bijgewerkt"; }

  apiJson("put", API + id + "/content", auth, { files: bestanden });
  var versie = apiJson("post", API + id + "/versions", auth, { description: "GitHub " + vandaag() });

  // De web-app krijgt de nieuwe versie, de URL blijft gelijk. Alle implementaties
  // met een vaste versie (dus niet de testimplementatie) gaan mee.
  var alle = apiJson("get", API + id + "/deployments", auth).deployments || [];
  var deploys = alle.filter(function (d) { return d.deploymentConfig && d.deploymentConfig.versionNumber; });
  deploys.forEach(function (d) {
    apiJson("put", API + id + "/deployments/" + d.deploymentId, auth, {
      deploymentConfig: { scriptId: id, versionNumber: versie.versionNumber, manifestFileName: "appsscript", description: "GitHub " + vandaag() }
    });
  });
  var uitkomst = "versie " + versie.versionNumber + ", " + deploys.length + " van " + alle.length + " implementatie(s) live gezet";
  Logger.log(uitkomst + ". " + JSON.stringify(alle.map(function (d) {
    return { id: String(d.deploymentId).slice(0, 12), versie: d.deploymentConfig && d.deploymentConfig.versionNumber, type: (d.entryPoints || []).map(function (e) { return e.entryPointType; }) };
  })));
  return uitkomst;
}

function bewaarInstellingenUit(bron) {
  var props = PropertiesService.getScriptProperties();
  ["DASHBOARD_KEY", "NOTIFY_EMAIL"].forEach(function (naam) {
    var m = String(bron || "").match(new RegExp("var " + naam + "\\s*=\\s*\"([^\"]+)\""));
    if (m && !props.getProperty(naam)) props.setProperty(naam, m[1]);
  });
}

function apiJson(method, url, headers, body) {
  var opt = { method: method, headers: headers, muteHttpExceptions: true, contentType: "application/json" };
  if (body) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(url, opt);
  var text = res.getContentText();
  if (res.getResponseCode() >= 300) {
    if (/has not been used|is disabled|SERVICE_DISABLED|User has not enabled/i.test(text)) {
      throw new Error("Zet eerst de Apps Script API aan op https://script.google.com/home/usersettings en probeer het daarna opnieuw.");
    }
    throw new Error(method.toUpperCase() + " " + url.replace(API, "") + " gaf " + res.getResponseCode() + ": " + text.slice(0, 300));
  }
  return text ? JSON.parse(text) : {};
}
