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
      .addToUi();
  } catch (e) {
    // No UI to attach to. Not an error worth surfacing.
  }
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

  book.toast(rows.length + " applications loaded", "IECSE", 5);
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
