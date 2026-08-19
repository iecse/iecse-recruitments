/**
 * Management Committee interview sheet.
 *
 * A separate spreadsheet from the applications roll, deliberately. That sheet
 * is what the whole committee reconciles payment against; this one is what a
 * handful of interviewers score candidates in, and the two should not be the
 * same tab fighting over meaning. Pulls only Management Committee applicants
 * whose payment has already cleared, since there is no reason to schedule an
 * interview for someone who has not paid.
 *
 * The decision column (Yes / No / Review) lives only here. It does not write
 * back to the applications database: interview_status there tracks whether an
 * interview happened, not its outcome, and there is no column for an outcome.
 * If that changes later, add the field to the schema first and treat this file
 * as the thing that gets updated to match it, not the other way round.
 *
 * Setup, once:
 *   1. Create a new Google Sheet for this. Extensions > Apps Script, paste
 *      this in as InterviewSheet.gs. Delete the placeholder Code.gs the
 *      editor creates for you, or this file's onOpen never runs.
 *   2. Project Settings > Script properties, add:
 *        API_BASE      same value as the applications sheet uses
 *        EXPORT_TOKEN  same value as the applications sheet uses
 *        SHEET_ID      only if this project is standalone rather than bound
 *   3. Run refreshInterviews once from the editor to grant permissions.
 *   4. IECSE menu > Turn on auto refresh, once the menu appears.
 *
 * EXPORT_TOKEN is reused rather than issued fresh for this sheet. It already
 * reads every applicant's personal data in bulk for the main sheet; a second
 * token for a read-only pull of a subset of the same data protects nothing
 * further and is one more secret two committees have to keep in sync.
 */

var TAB_NAME = "Interviews";

/** Basic applicant info, pulled fresh from the API on every refresh. */
var INFO_COLUMNS = [
  { header: "Applied", key: "created_at", width: 140 },
  { header: "Name", key: "full_name", width: 190 },
  { header: "Reg no", key: "registration_number", width: 120 },
  { header: "Year", key: "year", width: 80 },
  { header: "Branch", key: "branch", width: 230 },
  { header: "Domains", key: "domain", width: 200 },
  { header: "Email", key: "learner_email", width: 230 },
  { header: "Phone", key: "phone_number", width: 120 },
  { header: "Why join", key: "why_join", width: 320 },
  { header: "Projects", key: "projects", width: 260 },
  { header: "Certifications", key: "certifications", width: 200 },
  { header: "GitHub", key: "github_url", width: 200 },
  { header: "LinkedIn", key: "linkedin_url", width: 200 },
  { header: "Portfolio", key: "portfolio_url", width: 180 },
  { header: "Other links", key: "other_links", width: 180 },
];

/**
 * The columns the committee fills in by hand. Read back before every refresh
 * and reapplied afterwards, keyed on registration number, the same way the
 * applications sheet preserves its Notes column. Without this every refresh
 * would erase whatever an interviewer just scored.
 */
var SCORE_DOMAINS = ["Technical", "AIML", "Dev", "Design", "Publicity"];
var SCORE_VALUES = ["1", "2", "3", "4", "5"];
var DECISION_VALUES = ["Yes", "No", "Review"];

/**
 * Who is taking this candidate's interview, assigned or actual: one field,
 * not two. Placed leftmost so it is the first thing visible scanning down the
 * sheet without scrolling, which is the point of it: this is what you check
 * to know whose queue a row is in before you have opened anything else about
 * them.
 */
var INTERVIEWER_HEADER = "Interviewer";

var EDITABLE_HEADERS = [INTERVIEWER_HEADER].concat(SCORE_DOMAINS).concat(["Decision"]);
var TOTAL_HEADER = "Total";

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("IECSE")
      .addItem("Refresh from database", "refreshInterviews")
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

function refreshInterviews() {
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty("API_BASE") || "").replace(new RegExp("/+$"), "");
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
    throw new Error(
      "The export route answered 404. Either the function has not been " +
      "deployed since the route was added, or EXPORT_TOKEN is unset on " +
      "Supabase. Deploy with: supabase functions deploy applications --no-verify-jwt"
    );
  }
  if (code !== 200) throw new Error("Export failed with HTTP " + code + ": " + response.getContentText().slice(0, 200));

  var rows = JSON.parse(response.getContentText()).rows || [];
  var candidates = rows.filter(function (r) {
    return r.tier === "mancomm" && r.payment_status === "verified";
  });

  var book = openBook();
  writeInterviewTab(book, candidates);
  toast(book, candidates.length + " candidate(s) ready for interview", "IECSE");
}

function writeInterviewTab(book, rows) {
  var sheet = book.getSheetByName(TAB_NAME) || book.insertSheet(TAB_NAME);

  // Read back what the committee has already filled in, before clearing.
  var saved = readEditable(sheet);

  sheet.clear();
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();

  // EDITABLE_HEADERS is Interviewer, the five scores, Decision, in that order,
  // but Interviewer sits leftmost of everything rather than with the rest, and
  // Total is inserted between the scores and Decision, so neither is part of
  // this concat directly.
  var headers = [INTERVIEWER_HEADER]
    .concat(INFO_COLUMNS.map(function (c) { return c.header; }))
    .concat(EDITABLE_HEADERS.slice(1, -1))
    .concat([TOTAL_HEADER])
    .concat(EDITABLE_HEADERS.slice(-1));

  var totalCol = headers.indexOf(TOTAL_HEADER) + 1;
  var firstScoreCol = headers.indexOf(SCORE_DOMAINS[0]) + 1;
  var lastScoreCol = headers.indexOf(SCORE_DOMAINS[SCORE_DOMAINS.length - 1]) + 1;

  var values = [headers];

  rows.forEach(function (row) {
    var prior = saved[row.registration_number] || {};
    var line = [prior[INTERVIEWER_HEADER] || ""];

    line = line.concat(INFO_COLUMNS.map(function (c) {
      var v = row[c.key];
      if (v === null || v === undefined) return "";
      if (c.key === "created_at") return formatWhen(v);
      return String(v);
    }));

    SCORE_DOMAINS.forEach(function (d) { line.push(prior[d] || ""); });
    line.push("");                          // Total: a formula, filled in below
    line.push(prior["Decision"] || "");
    values.push(line);
  });

  if (values.length === 1) {
    values.push(["No verified Management Committee applicants yet"].concat(
      new Array(headers.length - 1).fill("")
    ));
  }

  sheet.getRange(1, 1, values.length, headers.length).setValues(values);

  // Total is computed by the sheet, not by the script, so a corrected score
  // recalculates itself instead of going stale until the next refresh.
  if (rows.length > 0) {
    var firstLetter = columnLetter(firstScoreCol);
    var lastLetter = columnLetter(lastScoreCol);
    for (var r = 0; r < rows.length; r += 1) {
      var rowNum = r + 2;
      var range = firstLetter + rowNum + ":" + lastLetter + rowNum;
      sheet.getRange(rowNum, totalCol).setFormula("=SUM(" + range + ")");
    }
  }

  var head = sheet.getRange(1, 1, 1, headers.length);
  head.setFontWeight("bold");
  head.setBackground("#1f44a6");
  head.setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);

  sheet.setColumnWidth(headers.indexOf(INTERVIEWER_HEADER) + 1, 140);
  INFO_COLUMNS.forEach(function (c) { sheet.setColumnWidth(headers.indexOf(c.header) + 1, c.width); });
  SCORE_DOMAINS.forEach(function (d) { sheet.setColumnWidth(headers.indexOf(d) + 1, 90); });
  sheet.setColumnWidth(totalCol, 70);
  sheet.setColumnWidth(headers.indexOf("Decision") + 1, 100);

  sheet.getRange(1, 1, values.length, headers.length)
    .setVerticalAlignment("top")
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  if (rows.length > 0) {
    addDropdowns(sheet, headers, rows.length);
    highlightDecisions(sheet, headers, rows.length);
  }
}

/**
 * Dropdowns for the score and decision columns. Rows only, never the
 * placeholder: the placeholder is written into row 2 with no scores or
 * decision behind it, and a strict rule on that cell is what makes the very
 * next refresh fail trying to overwrite it. dataRows is rows.length, the
 * count of real candidates, never values.length.
 */
function addDropdowns(sheet, headers, dataRows) {
  SCORE_DOMAINS.forEach(function (d) {
    var col = headers.indexOf(d) + 1;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(SCORE_VALUES, true)
      .setAllowInvalid(false)
      .setHelpText("1 to 5")
      .build();
    sheet.getRange(2, col, dataRows, 1).setDataValidation(rule);
  });

  var decisionCol = headers.indexOf("Decision") + 1;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(DECISION_VALUES, true)
    .setAllowInvalid(false)
    .setHelpText("Pick one of: " + DECISION_VALUES.join(", "))
    .build();
  sheet.getRange(2, decisionCol, dataRows, 1).setDataValidation(rule);
}

/** Colour the Decision cell so a scroll down the sheet reads at a glance. */
function highlightDecisions(sheet, headers, dataRows) {
  var col = headers.indexOf("Decision") + 1;
  var range = sheet.getRange(2, col, dataRows, 1);
  var letter = columnLetter(col);
  var rules = [
    { value: "Yes", bg: "#b7e1cd" },     // green
    { value: "No", bg: "#f4c7c3" },      // red
    { value: "Review", bg: "#fce8b2" },  // yellow
  ].map(function (spec) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied("=$" + letter + "2=\"" + spec.value + "\"")
      .setBackground(spec.bg)
      .setRanges([range])
      .build();
  });
  sheet.setConditionalFormatRules(rules);
}

/** Interviewer, the five scores, and Decision, keyed by registration number. */
function readEditable(sheet) {
  var out = {};
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return out;

  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var regCol = header.indexOf("Reg no") + 1;
  if (!regCol) return out;

  var wanted = EDITABLE_HEADERS.filter(function (h) { return header.indexOf(h) !== -1; });
  var cols = wanted.map(function (h) { return header.indexOf(h) + 1; });

  var regs = sheet.getRange(2, regCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < regs.length; i += 1) {
    var reg = String(regs[i][0] || "").trim();
    if (!reg) continue;
    var entry = {};
    var any = false;
    for (var c = 0; c < cols.length; c += 1) {
      var v = String(sheet.getRange(i + 2, cols[c]).getValue() || "").trim();
      if (v) { entry[wanted[c]] = v; any = true; }
    }
    if (any) out[reg] = entry;
  }
  return out;
}

function installAutoRefresh() {
  var MINUTES = 15;

  var removed = removeAutoRefresh();
  ScriptApp.newTrigger("refreshInterviews")
    .timeBased()
    .everyMinutes(MINUTES)
    .create();

  var msg = "Auto refresh installed: every " + MINUTES + " minutes.";
  if (removed > 0) msg += " Replaced " + removed + " existing trigger(s).";
  msg += " Runs as " + Session.getEffectiveUser().getEmail() + ".";
  Logger.log(msg);
  return msg;
}

function removeAutoRefresh() {
  var all = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < all.length; i += 1) {
    if (all[i].getHandlerFunction() === "refreshInterviews") {
      ScriptApp.deleteTrigger(all[i]);
      n += 1;
    }
  }
  return n;
}

function countRefreshTriggers() {
  var all = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < all.length; i += 1) {
    if (all[i].getHandlerFunction() === "refreshInterviews") n += 1;
  }
  return n;
}

/** Same shape as the applications sheet's diagnose, scoped to this project. */
function diagnose() {
  var NL = String.fromCharCode(10);
  var out = [];
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty("API_BASE") || "").replace(new RegExp("/+$"), "");
  var token = props.getProperty("EXPORT_TOKEN");
  var sheetId = props.getProperty("SHEET_ID");

  out.push("API_BASE      " + (base || "NOT SET"));
  out.push("EXPORT_TOKEN  " + (token ? "set, " + token.length + " chars" : "NOT SET"));
  out.push("SHEET_ID      " + (sheetId ? "set, so this project is standalone" : "not set, so this project is bound to the sheet"));
  out.push("auto refresh  " + (countRefreshTriggers() > 0 ? "installed" : "NOT INSTALLED, nothing refreshes on its own"));

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

  var r = UrlFetchApp.fetch(base + "/applications/export", {
    method: "get",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  var code = r.getResponseCode();
  out.push("export        HTTP " + code);
  out.push("");

  if (code === 200) {
    var rows = JSON.parse(r.getContentText()).rows || [];
    var eligible = rows.filter(function (x) { return x.tier === "mancomm" && x.payment_status === "verified"; });
    out.push("The API is fine. " + eligible.length + " of " + rows.length + " applications are");
    out.push("Management Committee with payment verified, which is what this sheet shows.");
    out.push("If that number looks low, the payment has probably not been marked");
    out.push("verified yet on the applications sheet. Do that there first.");
  } else if (code === 401) {
    out.push("The token here does not match the one on Supabase.");
    out.push("It should be the same EXPORT_TOKEN the applications sheet uses.");
  } else if (code === 404) {
    out.push("The export route is not answering. Deploy the function, or check");
    out.push("EXPORT_TOKEN is set on Supabase.");
  } else if (code === 429) {
    out.push("Rate limited. Exports are capped per hour. Wait and retry.");
  } else {
    out.push("Unexpected: " + r.getContentText().slice(0, 300));
  }

  Logger.log(out.join(NL));
  return out.join(NL);
}

function openBook() {
  var id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (id) return SpreadsheetApp.openById(id.trim());

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error(
    "This script is not attached to a spreadsheet. Either open it from the " +
    "sheet via Extensions > Apps Script, or add a SHEET_ID script property " +
    "holding the id from the sheet's URL (the part between /d/ and /edit)."
  );
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

function toast(book, message, title) {
  try {
    book.toast(message, title, 5);
  } catch (e) {
    Logger.log(title + ": " + message);
  }
}

function formatWhen(iso) {
  try {
    return Utilities.formatDate(new Date(iso), "Asia/Kolkata", "dd MMM, HH:mm");
  } catch (e) {
    return String(iso);
  }
}
