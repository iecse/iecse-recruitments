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

/**
 * The three tabs, and which applications land in each.
 *
 * Members is everyone, not just the people who picked the member tier: every
 * tier pays the membership fee with the application, so every applicant is a
 * member. A tab holding only the member tier would have been a list of the
 * people who asked for the least, which is not a membership roll.
 *
 * tier null means no filter. The committee tabs stay filtered, because those
 * are working lists for interviews.
 */
var TABS = [
  { tier: null, name: "Members" },
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
  /* Only meaningful since Members became everyone. Without it that tab cannot
     tell a member from a committee applicant. */
  { header: "Tier", key: "tier", width: 110 },
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
  out.push("auto refresh  " + (countTriggers("refreshFromApi") > 0 ? "installed" : "NOT INSTALLED, nothing refreshes on its own"));
  out.push("write-back    " + (countTriggers("onSheetEdit") > 0 ? "installed, sheet edits save to the database" : "NOT INSTALLED, edits will be overwritten on refresh"));

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
    if (countTriggers("refreshFromApi") > 0) {
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
 * The columns the committee may edit in the sheet, and what they map to.
 *
 * These values are duplicated from supabase/functions/_shared/rules.ts because
 * Apps Script cannot import it. The duplication is safe in one direction only:
 * the API validates every value against its own allowlist and rejects anything
 * else, so a stale entry here fails loudly on write rather than storing junk.
 * The dropdown is convenience; the API is the guard.
 */
var EDITABLE_COLUMNS = {
  "Payment": {
    field: "payment_status",
    values: ["pending", "verified", "rejected"],
  },
  "Interview": {
    field: "interview_status",
    values: ["pending", "not_required", "scheduled", "done"],
  },
};

/**
 * Push a Payment or Interview edit back to the database.
 *
 * Installed as an edit trigger, not written as a simple onEdit: a simple
 * onEdit runs without authorisation and cannot call UrlFetchApp at all, so it
 * would appear to work and silently never reach Supabase.
 *
 * The database stays authoritative. This sends the edit, and the next refresh
 * reads back whatever actually stuck. If the write fails the cell is put back
 * the way it was, because a cell showing "verified" when the database says
 * "pending" is worse than an edit that visibly did not take.
 */
function onSheetEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (!isManagedTab(sheet.getName())) return;
  if (e.range.getRow() === 1) return;

  var lastCol = sheet.getLastColumn();
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var regCol = header.indexOf("Reg no") + 1;
  if (!regCol) return;

  var failures = [];
  var sent = 0;

  // Iterate the edited range rather than reading e.value, so a paste down a
  // column of twenty rows works the same as changing one cell.
  for (var c = 0; c < e.range.getNumColumns(); c += 1) {
    var colIndex = e.range.getColumn() + c;
    var spec = EDITABLE_COLUMNS[header[colIndex - 1]];
    if (!spec) continue;

    for (var r = 0; r < e.range.getNumRows(); r += 1) {
      var rowIndex = e.range.getRow() + r;
      var cell = sheet.getRange(rowIndex, colIndex);
      var value = String(cell.getValue() || "").trim();
      var regNo = String(sheet.getRange(rowIndex, regCol).getValue() || "").trim();

      // The "No applications in this tier yet" placeholder has no reg number.
      if (!regNo) continue;

      if (spec.values.indexOf(value) === -1) {
        failures.push(regNo + ": " + value + " is not a valid " + spec.field);
        cell.setNote("Not a valid value. Allowed: " + spec.values.join(", "));
        continue;
      }

      var result = pushStatus(regNo, spec.field, value);
      if (result.ok) {
        sent += 1;
        cell.clearNote();
      } else {
        failures.push(regNo + ": " + result.error);
        cell.setNote("Not saved to the database: " + result.error);
      }
    }
  }

  if (sent > 0 && failures.length === 0) {
    toast(e.source, sent + " saved to the database", "IECSE");
  } else if (failures.length > 0) {
    toast(e.source, failures.length + " failed, see the cell note", "IECSE");
    Logger.log(failures.join(String.fromCharCode(10)));
  }
}

/** One status write. Returns { ok: true } or { ok: false, error: string }. */
function pushStatus(regNo, field, value) {
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty("API_BASE") || "").replace(new RegExp("/+$"), "");
  var token = props.getProperty("EXPORT_TOKEN");
  if (!base || !token) return { ok: false, error: "API_BASE or EXPORT_TOKEN not set" };

  var payload = { registration_number: regNo };
  payload[field] = value;

  try {
    var r = UrlFetchApp.fetch(base + "/applications/status", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    if (r.getResponseCode() === 200) return { ok: true };
    var msg;
    try {
      msg = JSON.parse(r.getContentText()).error || r.getContentText();
    } catch (parseErr) {
      msg = r.getContentText();
    }
    return { ok: false, error: "HTTP " + r.getResponseCode() + ", " + String(msg).slice(0, 160) };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 160) };
  }
}

function isManagedTab(name) {
  for (var i = 0; i < TABS.length; i += 1) {
    if (TABS[i].name === name) return true;
  }
  return false;
}

/** toast needs a UI. A standalone project has none. */
function toast(book, message, title) {
  try {
    book.toast(message, title, 5);
  } catch (e) {
    Logger.log(title + ": " + message);
  }
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

  // The write-back trigger. Installed here rather than in its own function so
  // there is one thing to run: a sheet that pulls but cannot push is the
  // problem this was added to solve.
  ScriptApp.newTrigger("onSheetEdit")
    .forSpreadsheet(openBook())
    .onEdit()
    .create();

  var lines = [];
  lines.push("Auto refresh installed: every " + MINUTES + " minutes.");
  lines.push("Edit write-back installed: Payment and Interview changes now");
  lines.push("save to the database as you make them.");
  if (removed > 0) lines.push("Replaced " + removed + " existing trigger(s).");
  lines.push("Both run as " + Session.getEffectiveUser().getEmail() + ".");
  var msg = lines.join(String.fromCharCode(10));
  Logger.log(msg);
  return msg;
}

/** Stop the sheet refreshing itself. Returns how many triggers were removed. */
function removeAutoRefresh() {
  var all = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < all.length; i += 1) {
    var fn = all[i].getHandlerFunction();
    if (fn === "refreshFromApi" || fn === "onSheetEdit") {
      ScriptApp.deleteTrigger(all[i]);
      n += 1;
    }
  }
  Logger.log("Removed " + n + " refresh trigger(s).");
  return n;
}

/** How many triggers are installed for a given handler. */
function countTriggers(handler) {
  var all = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < all.length; i += 1) {
    if (all[i].getHandlerFunction() === handler) n += 1;
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
    var forTab = tab.tier
      ? rows.filter(function (r) { return r.tier === tab.tier; })
      : rows;
    writeTab(book, tab.name, forTab);
  });

  // toast needs a UI. A standalone project has none, and this is the last line
  // of the refresh, so an unguarded call fails after all the work succeeded and
  // reads like the whole run failed.
  toast(book, rows.length + " applications loaded", "IECSE");
}

function writeTab(book, name, rows) {
  var sheet = book.getSheetByName(name) || book.insertSheet(name);

  // Read existing notes first, so a refresh does not throw away the
  // committee's own working column.
  var notes = readNotes(sheet);

  sheet.clear();
  // clear() drops content and formatting but leaves data validation rules
  // behind. A rule written by an earlier run stays bound to the cell, and the
  // next refresh throws trying to write a value the old rule rejects. Clearing
  // across the whole sheet, not just the range about to be written, catches
  // rules on rows and columns this run no longer touches.
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();

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
    values.push([
      name === "Members" ? "No applications yet" : "No applications in this tier yet",
    ].concat(new Array(headers.length - 1).fill("")));
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
  // rows, not values: values includes the placeholder row on an empty tab, and
  // a dropdown on that cell is what makes the next refresh fail to overwrite it.
  addStatusDropdowns(sheet, headers, rows.length);
}

/**
 * Dropdowns on the columns the committee edits.
 *
 * Stops the commonest write failure before it reaches the API: a typo, or
 * "Verified" with a capital V, which the database check constraint rejects.
 * Rejecting invalid input is the API's job; not offering it is this one.
 */
function addStatusDropdowns(sheet, headers, dataRows) {
  if (dataRows < 1) return;
  for (var name in EDITABLE_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(EDITABLE_COLUMNS, name)) continue;
    var col = headers.indexOf(name) + 1;
    if (!col) continue;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(EDITABLE_COLUMNS[name].values, true)
      .setAllowInvalid(false)
      .setHelpText("Pick one of: " + EDITABLE_COLUMNS[name].values.join(", "))
      .build();
    sheet.getRange(2, col, dataRows, 1).setDataValidation(rule);
  }
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
