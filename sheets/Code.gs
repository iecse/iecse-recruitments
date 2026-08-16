/**
 * IECSE recruitment -> Google Sheet.
 *
 * Pulls every application from the API and rewrites three tabs: Members,
 * Working Committee and Management Committee. Adds a "IECSE" menu to the sheet
 * with a Refresh item, and can be put on a timer.
 *
 * Setup, once:
 *   1. Open the Sheet, Extensions -> Apps Script, paste this in as Code.gs.
 *   2. Project Settings -> Script properties, add:
 *        API_BASE      https://<ref>.supabase.co/functions/v1
 *        EXPORT_TOKEN  the same value as the EXPORT_TOKEN Supabase secret
 *        SHEET_ID      only if this project is NOT bound to the sheet, ie if
 *                      you created it at script.google.com rather than from
 *                      Extensions -> Apps Script inside the sheet
 *   3. Run refreshFromApi once from the editor to grant permissions.
 *   4. Optional: Triggers -> add a time driven trigger on refreshFromApi.
 *
 * The token lives in Script Properties, not in this file, so it does not end up
 * in version control or visible to anyone with only view access to the sheet.
 * Anyone who can EDIT the Apps Script project can read it, so keep the editor
 * list to the committee members who need it.
 *
 * The sheet is a copy, not the source of truth. Editing a cell here changes
 * nothing in the database, and the next refresh overwrites it. Use the
 * Notes column for anything you want to keep: it is preserved across refreshes,
 * keyed on registration number.
 */

var TABS = [
  { tier: "member", name: "Members" },
  { tier: "workcomm", name: "Working Committee" },
  { tier: "mancomm", name: "Management Committee" },
];

/** Column order in the sheet, and where each comes from. */
var COLUMNS = [
  { header: "Applied", key: "created_at", width: 140 },
  { header: "Name", key: "full_name", width: 190 },
  { header: "Reg no", key: "registration_number", width: 120 },
  { header: "Year", key: "year", width: 80 },
  { header: "Branch", key: "branch", width: 230 },
  { header: "Domains", key: "domain", width: 200 },
  { header: "Email", key: "learner_email", width: 230 },
  { header: "Phone", key: "phone_number", width: 120 },
  { header: "Payment ref", key: "payment_id", width: 140 },
  { header: "Payment", key: "payment_status", width: 100 },
  { header: "Interview", key: "interview_status", width: 110 },
  { header: "Why join", key: "why_join", width: 320 },
  { header: "Projects", key: "projects", width: 260 },
  { header: "Certifications", key: "certifications", width: 200 },
  { header: "GitHub", key: "github_url", width: 200 },
  { header: "LinkedIn", key: "linkedin_url", width: 200 },
  { header: "Portfolio", key: "portfolio_url", width: 180 },
  { header: "Other links", key: "other_links", width: 180 },
];

/** Not written by the refresh. Whatever the committee types here survives. */
var NOTES_HEADER = "Notes";

/**
 * Only fires for a script bound to the sheet. A standalone project never runs
 * this, which is fine: there the refresh is run from the editor or a trigger.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("IECSE")
      .addItem("Refresh from database", "refreshFromApi")
      .addSeparator()
      .addItem("Turn on auto refresh", "installAutoRefresh")
      .addItem("Turn off auto refresh", "removeAutoRefresh")
      .addSeparator()
      .addItem("Why is this not updating?", "diagnose")
      .addToUi();
  } catch (e) {
    // No UI to attach to. Not an error worth surfacing.
  }
}

/**
 * Why the sheet is not updating.
 *
 * "It stopped working" has three causes that need three different fixes, and
 * they are indistinguishable from inside the sheet. Run this from the editor
 * and read the log: it checks each one in the order it can fail and says
 * which it is, rather than leaving whoever is on duty to guess.
 *
 * Run: pick diagnose in the function dropdown, press Run, then View > Logs.
 */
function diagnose() {
  // Built with fromCharCode so this file carries no escape sequences: the
  // last two times it was edited through a shell, a backslash was eaten and
  // the damage was invisible until it ran.
  var NL = String.fromCharCode(10);
  var out = [];
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty("API_BASE") || "").replace(new RegExp("/+$"), "");
  var token = props.getProperty("EXPORT_TOKEN");
  var sheetId = props.getProperty("SHEET_ID");

  out.push("API_BASE      " + (base || "NOT SET"));
  out.push("EXPORT_TOKEN  " + (token ? "set, " + token.length + " chars" : "NOT SET"));
  out.push("SHEET_ID      " + (sheetId ? "set, so this project is standalone" : "not set, so this project is bound to the sheet"));
  out.push("auto refresh  " + (countRefreshTriggers() > 0 ? countRefreshTriggers() + " trigger(s) installed" : "NOT INSTALLED, nothing refreshes on its own"));

  if (!base || !token) {
    out.push("");
    out.push("STOP. Set the missing property in Project Settings, Script properties.");
    Logger.log(out.join(NL));
    return out.join(NL);
  }

  try {
    var book = openBook();
    out.push("spreadsheet   OK, " + book.getName());
  } catch (e) {
    out.push("spreadsheet   FAILED, " + e.message);
  }

  try {
    var h = UrlFetchApp.fetch(base + "/applications/health", { muteHttpExceptions: true });
    out.push("health        HTTP " + h.getResponseCode());
  } catch (e2) {
    out.push("health        UNREACHABLE, " + e2.message);
  }

  var r = UrlFetchApp.fetch(base + "/applications/export", {
    method: "get",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  var code = r.getResponseCode();
  out.push("export        HTTP " + code);
  out.push("");

  if (code === 200) {
    var rows = (JSON.parse(r.getContentText()).rows || []).length;
    out.push("The API is fine and returned " + rows + " applications.");
    out.push("Nothing is broken. The data is there, the refresh just has not run.");
    out.push("");
    if (countRefreshTriggers() > 0) {
      out.push("A trigger IS installed, so this should be refreshing on its own.");
      out.push("Check Executions in the left sidebar for a failing run.");
    } else {
      out.push("Nothing refreshes this sheet automatically. To fix that for good:");
      out.push("  run installAutoRefresh once, from the function dropdown.");
      out.push("");
      out.push("To refresh once right now: run refreshFromApi.");
      if (sheetId) {
        out.push("");
        out.push("Note: SHEET_ID is set, so this project is standalone and the");
        out.push("IECSE menu does not appear in the sheet. Run functions from");
        out.push("this editor, or install the trigger and stop thinking about it.");
      }
    }
  } else if (code === 401) {
    out.push("The token here does not match the one on Supabase.");
    out.push("Usually because EXPORT_TOKEN was rotated on one side only.");
    out.push("Set both to the same value:");
    out.push("  supabase secrets set EXPORT_TOKEN=<value>");
    out.push("  then paste that same <value> into Script properties here.");
  } else if (code === 404) {
    out.push("The export route is not answering.");
    out.push("Either the function has not been deployed since the route was");
    out.push("added, which is the usual cause, or EXPORT_TOKEN is unset on");
    out.push("Supabase. Deploy with:");
    out.push("  supabase functions deploy applications --no-verify-jwt");
  } else if (code === 429) {
    out.push("Rate limited. Exports are capped per hour. Wait and retry.");
  } else {
    out.push("Unexpected: " + r.getContentText().slice(0, 300));
  }

  Logger.log(out.join(NL));
  return out.join(NL);
}

/**
 * Make the sheet refresh itself.
 *
 * This is the answer to "do I have to keep running it by hand". Run this
 * once. It installs a time driven trigger that calls refreshFromApi on a
 * schedule, and from then on the sheet keeps itself current.
 *
 * Safe to run more than once: it clears any refresh trigger it already
 * installed before adding one, so you cannot end up with four of them all
 * rewriting the sheet at once.
 *
 * The trigger runs as whoever installs it, using their authorisation. If that
 * person loses access to the sheet or the script, the trigger stops. Install
 * it from an account that will still be around at the end of recruitment.
 *
 * To change the interval, edit MINUTES below and run this again.
 */
function installAutoRefresh() {
  var MINUTES = 15;

  var removed = removeAutoRefresh();

  ScriptApp.newTrigger("refreshFromApi")
    .timeBased()
    .everyMinutes(MINUTES)
    .create();

  var msg = "Auto refresh installed: every " + MINUTES + " minutes.";
  if (removed > 0) {
    msg = msg + " Replaced " + removed + " existing trigger(s).";
  }
  msg = msg + " Runs as " + Session.getEffectiveUser().getEmail() + ".";
  Logger.log(msg);
  return msg;
}

/** Stop the sheet refreshing itself. Returns how many triggers were removed. */
function removeAutoRefresh() {
  var all = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < all.length; i += 1) {
    if (all[i].getHandlerFunction() === "refreshFromApi") {
      ScriptApp.deleteTrigger(all[i]);
      n += 1;
    }
  }
  Logger.log("Removed " + n + " refresh trigger(s).");
  return n;
}

/** How many refresh triggers are installed right now. */
function countRefreshTriggers() {
  var all = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < all.length; i += 1) {
    if (all[i].getHandlerFunction() === "refreshFromApi") n += 1;
  }
  return n;
}

function refreshFromApi() {
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty("API_BASE") || "").replace(/\/+$/, "");
  var token = props.getProperty("EXPORT_TOKEN");

  if (!base || !token) {
    throw new Error(
      "Set API_BASE and EXPORT_TOKEN in Project Settings, Script properties."
    );
  }

  var response = UrlFetchApp.fetch(base + "/applications/export", {
    method: "get",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code === 401) throw new Error("EXPORT_TOKEN here does not match the one set on Supabase.");
  if (code === 404) {
    // 404 has two causes and they need different fixes, so do not guess at one.
    throw new Error(
      "The export route answered 404. Either the function has not been " +
      "deployed since the route was added, which is the usual cause, or " +
      "EXPORT_TOKEN is unset on Supabase. Deploy with: " +
      "supabase functions deploy applications --no-verify-jwt"
    );
  }
  if (code !== 200) throw new Error("Export failed with HTTP " + code + ": " + response.getContentText().slice(0, 200));

  var rows = JSON.parse(response.getContentText()).rows || [];
  var book = openBook();

  TABS.forEach(function (tab) {
    writeTab(book, tab.name, rows.filter(function (r) { return r.tier === tab.tier; }));
  });

  // toast needs a UI. A standalone project has none, and this is the last line
  // of the refresh, so an unguarded call fails after all the work succeeded and
  // reads like the whole run failed.
  try {
    book.toast(rows.length + " applications loaded", "IECSE", 5);
  } catch (e) {
    Logger.log(rows.length + " applications loaded");
  }
}

function writeTab(book, name, rows) {
  var sheet = book.getSheetByName(name) || book.insertSheet(name);

  // Read existing notes first, so a refresh does not throw away the
  // committee's own working column.
  var notes = readNotes(sheet);

  sheet.clear();

  var headers = COLUMNS.map(function (c) { return c.header; }).concat([NOTES_HEADER]);
  var values = [headers];

  rows.forEach(function (row) {
    var line = COLUMNS.map(function (c) {
      var v = row[c.key];
      if (v === null || v === undefined) return "";
      if (c.key === "created_at") return formatWhen(v);
      return String(v);
    });
    line.push(notes[row.registration_number] || "");
    values.push(line);
  });

  if (values.length === 1) {
    // Headers only. Say so rather than leaving a bare row that looks broken.
    values.push(["No applications in this tier yet"].concat(
      new Array(headers.length - 1).fill("")
    ));
  }

  sheet.getRange(1, 1, values.length, headers.length).setValues(values);

  var head = sheet.getRange(1, 1, 1, headers.length);
  head.setFontWeight("bold");
  head.setBackground("#1f44a6");
  head.setFontColor("#ffffff");
  sheet.setFrozenRows(1);

  COLUMNS.forEach(function (c, i) { sheet.setColumnWidth(i + 1, c.width); });
  sheet.setColumnWidth(headers.length, 260);

  // Long free text is readable clipped; expanding every row to fit "Why join"
  // makes the sheet unusable for scanning.
  sheet.getRange(1, 1, values.length, headers.length)
    .setVerticalAlignment("top")
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  markUnpaid(sheet, values.length);
}

/** Rows still awaiting payment reconciliation, so they are easy to find. */
function markUnpaid(sheet, rowCount) {
  if (rowCount < 2) return;
  var paymentCol = COLUMNS.findIndex(function (c) { return c.key === "payment_status"; }) + 1;
  var range = sheet.getRange(2, 1, rowCount - 1, COLUMNS.length + 1);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(
      "=$" + columnLetter(paymentCol) + "2=\"pending\""
    )
    .setBackground("#fff4f4")
    .setRanges([range])
    .build();
  sheet.setConditionalFormatRules([rule]);
}

function columnLetter(n) {
  var s = "";
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = (n - m - 1) / 26;
  }
  return s;
}

/**
 * The spreadsheet to write to.
 *
 * getActiveSpreadsheet() only returns something when the script is bound to a
 * sheet, which happens if you open it through Extensions -> Apps Script from
 * inside the sheet. A project created at script.google.com is standalone and
 * gets null, which surfaces as "Cannot read properties of null".
 *
 * So a standalone project works too: put the spreadsheet's id in a SHEET_ID
 * script property. The id is the long string in its URL, between /d/ and /edit.
 */
function openBook() {
  var id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (id) return SpreadsheetApp.openById(id.trim());

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error(
    "This script is not attached to a spreadsheet. Either open it from the " +
    "sheet via Extensions -> Apps Script, or add a SHEET_ID script property " +
    "holding the id from the sheet's URL (the part between /d/ and /edit)."
  );
}

/** Registration number -> whatever is in the Notes column today. */
function readNotes(sheet) {
  var out = {};
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return out;

  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var notesCol = header.indexOf(NOTES_HEADER) + 1;
  var regCol = header.indexOf("Reg no") + 1;
  if (!notesCol || !regCol) return out;

  var regs = sheet.getRange(2, regCol, lastRow - 1, 1).getValues();
  var notes = sheet.getRange(2, notesCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < regs.length; i += 1) {
    var reg = String(regs[i][0] || "").trim();
    var note = String(notes[i][0] || "").trim();
    if (reg && note) out[reg] = note;
  }
  return out;
}

/** ISO timestamp to something a person reads, in India. */
function formatWhen(iso) {
  try {
    return Utilities.formatDate(new Date(iso), "Asia/Kolkata", "dd MMM, HH:mm");
  } catch (e) {
    return String(iso);
  }
}
