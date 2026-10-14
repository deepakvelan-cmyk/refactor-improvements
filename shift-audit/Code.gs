/**
 * Shift Call Audit — OpenPhone dialer vs Call Tracker entries, per agent, per shift.
 * Reads the source sheets LIVE on every run (any shift or date range, not only today).
 * READ-ONLY on all source sheets; writes only to the spreadsheet this script is bound to.
 *
 * Tabs written: Comparison (dialer vs tracker, slot patterns, call gaps), Dialer Report, Unmapped,
 *               Tracker Report, Daily, Exceptions, Run Log, Screenshots. Inputs on Controls.
 *               Run Log and Unmapped are record-only and kept hidden.
 * Menu "Shift Audit":
 *   Run report (Controls dates)  – From / To on the Controls tab (blank = latest shift)
 *   Run latest shift             – current / most recent night shift
 *   Run for date range…          – e.g. 13/10/2026 or 01/10/2026-13/10/2026
 *   Auto-refresh ON / OFF        – re-runs the Controls report every 15 minutes
 *   Schedule ON / OFF            – latest shift at 11 PM, 1, 3, 7 AM IST (no Sunday-night shift) + screenshots
 *                                  into the project folder (see Screenshots.gs): Full (PNG + PDF), Mobile (PNG),
 *                                  Idle Time & Call Gaps (PNG)
 *   Take screenshot now          – re-runs the Controls report and saves the same three screenshots
 *   Rebuild screenshot list      – re-lists every screenshot in the month folders on the Screenshots tab
 * All runs share one script lock, so scheduled runs, auto-refresh and manual runs never overlap.
 */

var CONFIG = {
  OPENPHONE_ID: '1VpHs6DI6RpGhWIMpCJVPUrOHnfOc_yDx0Jyf4aeaW94',
  EXCLUDE_AGENTS: ['Radha Krishna'],   // left out of every report
  DIALER_ONLY: ['Srinath'],            // calls reported, no tracker comparison
  TRACKERS: {
    'Chetan': '1XHgB9KlGDWp4cf4hasAmwq_LxkNJJZziW2-ousNykk8',
    'Manohar': '1lTeQd8Grf_8Edmv0C7wtOoAW9PMppW4ECVmfkkdIgJE',
    'Pavan': '1It5gnHe8sFao7HQUUMv5Mk4d7tqr6NisskYbtmbhLic',
    'Prashanth': '10ZEgCK4CBeXfC-a8da-cnvyfrZ7n9qt9NyTB0DquizU',
    'Rohan': '1KJSeFLPIeXiWBrhkhv_DyzVtzA4KbtNM8wkeGTbDd7M',
    'Sainath': '1IOGvb5f9I_q7LFMTg1LfyQOgybi3WZoGejLkj2RPHyI',
    'Salman': '1NR9hVcX3wWWmfuevkipoRNnPXFAOsKxZ_nAk_eZFhj4',
    'Satish': '1mDeDtZrjIp3tZxSrhYB6wAYRtBMRPO1EFqEcPdYK4e4',
    'Shiva Prasad': '1t-AKw11kLBAR1P4FyPqiEZYv71_gPInRuFUX2f4nkjU',
    'Srikanth': '1_uug-5VPzPkHe_u4Cx2GwKtTInkthXef50hvP8YwuQA',
    'Sushant': '1M9RiTdNDZASvuzFbQDLph5KHagcciBVqtwwUhbPDXcY'
  },
  TRACKER_TABS: ['New Calls', 'Follow-Up', 'Not Interested', 'Converted'],
  // Minutes after midnight IST of the shift date (values > 1440 are next morning).
  DIAL_START: 20 * 60 + 45,
  ENTRY_START: 20 * 60 + 30,
  SHIFT_END: 7 * 60 + 30,
  // Work slots; the time between them (11:00–11:20, 1:00–1:30, 3:00–3:20) is treated as breaks.
  SLOTS: [['9:00–11:00 PM', 21 * 60, 23 * 60],
          ['11:20 PM–1:00 AM', 23 * 60 + 20, 25 * 60],
          ['1:30–3:00 AM', 25 * 60 + 30, 27 * 60],
          ['3:20–7:00 AM', 27 * 60 + 20, 31 * 60]],
  GAP_MIN: 20,              // a pause longer than this (inside a work slot, no call in progress) is flagged
  CONNECT_MIN_SEC: 15,
  HOUR_START: 21 * 60,      // hourly trend columns: 9 PM … 6 AM
  HOUR_COUNT: 10,
  LONG_CALL_MIN: 10,        // talk time that counts as a long call (explains fewer dials)
  BURST_NO_CONNECT: 5,      // this many consecutive dials with no connect is flagged
  REPEAT_DIAL_FLAG: 5,      // repeat dials at or above this are highlighted
  LOW_CONNECT_PCT: 50,      // connect rate below this (with 10+ dials) is flagged
  TRACKER_GAP_NOTE_MIN: 60, // a gap with tracker updates this long is still mentioned in the notes
  DECLINE_PCT: 40,          // an hour below this % of the agent's peak rate (after the peak) is an extreme decline
  HALF_CHANGE_PCT: 20,      // 2nd half vs 1st half change (calls per working hour) that counts as a drop / rise
  MAX_DAYS: 31,
  REFRESH_MINUTES: 15,
  // Scheduled runs (IST) + screenshots into <project folder>/<SCREENSHOT_FOLDER>/<yyyy-MM>/.
  SCHEDULE_HOURS: [23, 1, 3, 7],
  SKIP_SHIFT_WEEKDAYS: [0],  // 0 = Sunday: no Sunday-night shift runs (incl. its 1/3/7 AM runs)
  PROJECT_FOLDER_ID: '1s-jShFMGQXh1R9_G_NWziSr4JRDO7e6Z',
  SCREENSHOT_FOLDER: 'Shift Call Audit Screenshots'   // one sub-folder per month (yyyy-MM)
};

var IST_OFFSET_MS = 5.5 * 3600 * 1000;
var MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

// ---------- Menu / entry points ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Shift Audit')
    .addItem('Run report (Controls dates)', 'runFromControls')
    .addItem('Run latest shift', 'runLatestShift')
    .addItem('Run for date range…', 'runForRange')
    .addSeparator()
    .addItem('Auto-refresh ON (every ' + CONFIG.REFRESH_MINUTES + ' min)', 'autoRefreshOn')
    .addItem('Auto-refresh OFF', 'autoRefreshOff')
    .addSeparator()
    .addItem('Schedule ON (11 PM, 1, 3, 7 AM · Mon–Sat) + screenshots', 'scheduleOn')
    .addItem('Schedule OFF', 'scheduleOff')
    .addItem('Take screenshot now', 'takeScreenshotNow')
    .addItem('Rebuild screenshot list', 'rebuildScreenshotList')
    .addToUi();
  controls();
  hideRecordTabs();
}

function hideRecordTabs() {
  var ss = SpreadsheetApp.getActive();
  ['Run Log', 'Unmapped'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    try { if (sh && !sh.isSheetHidden()) sh.hideSheet(); } catch (e) {}
  });
}

function runLatestShift() { var k = latestShiftKey(); runAudit(k, k); }

function runFromControls() { var k = controlsRange(); runAudit(k[0], k[1]); }

// [from, to] shift keys from the Controls tab (blank = latest shift).
function controlsRange() {
  var c = controls();
  var from = parseKey(c.getRange('B1').getDisplayValue()), to = parseKey(c.getRange('B2').getDisplayValue());
  if (!from) { var k = latestShiftKey(); return [k, k]; }
  return [from, to || from];
}

function runForRange() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Shift Audit', 'Shift date DD/MM/YYYY, or a range DD/MM/YYYY-DD/MM/YYYY:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var parts = r.getResponseText().split(/\s*(?:-|to)\s*(?=\d{1,2}\/)/);
  var from = parseKey(parts[0]), to = parseKey(parts[1] || parts[0]);
  if (!from || !to) { ui.alert('Use DD/MM/YYYY or DD/MM/YYYY-DD/MM/YYYY'); return; }
  controls().getRange('B1:B2').setValues([[keyToDmy(from)], [keyToDmy(to)]]);
  runAudit(from, to);
}

function autoRefreshOn() {
  autoRefreshOff();
  ScriptApp.newTrigger('runFromControls').timeBased().everyMinutes(CONFIG.REFRESH_MINUTES).create();
  controls().getRange('B5').setValue('ON — every ' + CONFIG.REFRESH_MINUTES + ' min');
  runFromControls();
}

function autoRefreshOff() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runFromControls') ScriptApp.deleteTrigger(t);
  });
  controls().getRange('B5').setValue('OFF');
}

// ---------- Schedule + screenshots ----------
function scheduleOn() {
  scheduleOff();
  CONFIG.SCHEDULE_HOURS.forEach(function (h) {
    ScriptApp.newTrigger('scheduledRun').timeBased().everyDays(1).atHour(h).nearMinute(0).inTimezone('Asia/Kolkata').create();
  });
  controls().getRange('A6:B6').setValues([['Schedule', 'ON — ' + CONFIG.SCHEDULE_HOURS.map(hourLabel).join(', ') +
                                           ' IST, Mon–Sat shifts, screenshots to project folder']]);
  toast('Schedule installed');
}

function scheduleOff() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledRun') ScriptApp.deleteTrigger(t);
  });
  controls().getRange('A6:B6').setValues([['Schedule', 'OFF']]);
}

// Trigger handler: latest shift, skipped for Sunday-night shifts; screenshots after the report is written.
function scheduledRun() {
  var k = latestShiftKey();
  if (CONFIG.SKIP_SHIFT_WEEKDAYS.indexOf(new Date(k + 'T00:00:00Z').getUTCDay()) >= 0) return;
  runAudit(k, k, {screenshot: 'Scheduled'});
}

// Menu / button: re-runs the Controls report, then saves the screenshots from that run.
function takeScreenshotNow() {
  var k = controlsRange();
  if (runAudit(k[0], k[1], {screenshot: 'Manual'})) toast('Screenshots saved to Drive — listed on the Screenshots tab');
}

var SHOT_HEAD = ['Date (IST)', 'Time (IST)', 'Shift Date', 'Type', 'Calls Dialed', 'Connected', 'Tracker Entries', 'Logging %',
                 'Inactive > ' + CONFIG.GAP_MIN + ' min', 'Absent', 'Full — Image', 'Full — PDF', 'Mobile — Image', 'Idle — Image',
                 'Month Folder'];
function monthFolder(now) {
  var root = childFolder(DriveApp.getFolderById(CONFIG.PROJECT_FOLDER_ID), CONFIG.SCREENSHOT_FOLDER);
  return childFolder(root, Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM'));
}

function childFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// Image of the PDF page as rendered by Drive (the preview can take a few seconds to appear).
// Drive renders PDF previews 1024 px wide; the size is uncapped so tall pages keep that width.
// Asks for JPEG ('-rj'); returns {blob, ext} with ext 'jpg', or 'png' if Drive sent a PNG instead.
function pdfToImage(fileId) {
  var auth = {headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true};
  for (var i = 0; i < 10; i++) {
    Utilities.sleep(3000);
    var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=thumbnailLink', auth);
    var link = r.getResponseCode() === 200 && JSON.parse(r.getContentText()).thumbnailLink;
    if (!link) continue;
    var base = link.replace(/=[^=\/]*$/, '');
    var sizes = ['=s16000-rj', '=s3200-rj', '=s3200'];
    for (var k = 0; k < sizes.length; k++) {
      var img = UrlFetchApp.fetch(base + sizes[k], auth);
      if (img.getResponseCode() !== 200) continue;
      var bytes = img.getContent(), jpg = bytes[0] === -1 && bytes[1] === -40;   // JPEG starts FF D8
      return {blob: img.getBlob().setContentType(jpg ? 'image/jpeg' : 'image/png'), ext: jpg ? 'jpg' : 'png'};
    }
  }
  return null;   // the PDF is still saved and linked
}

// The Screenshots tab of this spreadsheet (created right after the Report tab on first use).
function screenshotsSheet() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Screenshots');
  if (sh) { sh.getRange(1, 1, 1, SHOT_HEAD.length).setValues([SHOT_HEAD]); return sh; }
  var rep = ss.getSheetByName('Report');
  sh = ss.insertSheet('Screenshots', rep ? rep.getIndex() : ss.getNumSheets());
  sh.getRange(1, 1, 1, SHOT_HEAD.length).setValues([SHOT_HEAD]).setFontWeight('bold')
    .setBackground(STYLE.header).setFontColor(STYLE.headerText).setHorizontalAlignment('center').setWrap(true);
  sh.setFrozenRows(1);
  sh.getRange('A:C').setNumberFormat('@');   // keep date / time / shift date as written (IST text)
  sh.setColumnWidths(1, SHOT_HEAD.length, 100);
  return sh;
}

function shotRow(info, links, folderUrl, folderName) {
  var t = new Date(info.taken);
  var link = function (u, label) { return u ? '=HYPERLINK("' + u + '","' + label + '")' : '–'; };
  return [Utilities.formatDate(t, 'Asia/Kolkata', 'dd MMM yyyy'), Utilities.formatDate(t, 'Asia/Kolkata', 'h:mm:ss a'),
          info.shift || '', info.kind || '–'].concat(info.kpi || ['', '', '', '', '', '']).concat([
          link(links.FullImg, 'View / download'), link(links.FullPdf, 'View / download'),
          link(links.MobileImg || links.MobilePdf, 'View / download'), link(links.IdleImg || links.IdlePdf, 'View / download'),
          link(folderUrl, folderName)]);
}

function writeShotRows(sh, r, rows) {
  if (!rows.length) return;
  sh.getRange(r, 1, rows.length, SHOT_HEAD.length).setValues(rows).setHorizontalAlignment('center')
    .setFontWeight('normal').setBackground(null).setFontColor('#000000');
}

// Rebuilds the Screenshots tab from the files in every month folder (newest first).
function rebuildScreenshotList() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) { toast('Another run is in progress — try again in a minute'); return; }
  var rows = [];
  try {
    var shots = {};
    var root = childFolder(DriveApp.getFolderById(CONFIG.PROJECT_FOLDER_ID), CONFIG.SCREENSHOT_FOLDER);
    var months = root.getFolders();
    while (months.hasNext()) {
      var mf = months.next(), files = mf.getFiles();
      while (files.hasNext()) {
        var f = files.next(), m = f.getName().match(/^(.+ IST) · (Full|Mobile|Idle)\.(jpe?g|png|pdf)$/i);
        if (!m) continue;
        var s = shots[m[1]] || (shots[m[1]] = {links: {}, folderUrl: mf.getUrl(), folderName: mf.getName()});
        s.links[m[2] + (m[3].toLowerCase() === 'pdf' ? 'Pdf' : 'Img')] = f.getUrl();
        try { s.info = s.info || JSON.parse(f.getDescription() || ''); } catch (e) {}
        if (!s.info) s.info = {taken: f.getDateCreated().getTime()};
      }
    }
    rows = Object.keys(shots).map(function (k) { return shots[k]; })
      .sort(function (p, q) { return q.info.taken - p.info.taken; })
      .map(function (s) { return shotRow(s.info, s.links, s.folderUrl, s.folderName); });
    var sh = screenshotsSheet();
    if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
    writeShotRows(sh, 2, rows);
  } finally { lock.releaseLock(); }
  toast('Screenshot list rebuilt — ' + rows.length + ' screenshot(s)');
}

// ---------- Core ----------
// Returns false when another run held the lock and this one was skipped.
function runAudit(fromKey, toKey, opts) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(300000)) { toast('Another run is in progress — skipped'); return false; }
  try { runAuditLocked(fromKey, toKey, opts || {}); } finally { lock.releaseLock(); }
  return true;
}

function runAuditLocked(fromKey, toKey, opts) {
  if (fromKey > toKey) { var x = fromKey; fromKey = toKey; toKey = x; }
  var keys = [];
  for (var k = fromKey; k <= toKey && keys.length < CONFIG.MAX_DAYS; k = addDays(k, 1)) keys.push(k);
  toKey = keys[keys.length - 1];
  toast('Reading dialer + trackers live for ' + keys.length + ' shift(s)…');

  var start = keyInstant(fromKey, Math.min(CONFIG.ENTRY_START, CONFIG.DIAL_START));
  var end = keyInstant(toKey, 24 * 60 + CONFIG.SHIFT_END);
  var excluded = {};
  CONFIG.EXCLUDE_AGENTS.forEach(function (a) { excluded[a] = true; });

  var allCalls = readDialer(start, end, excluded);
  var trk = readTrackers(start, end, excluded);
  var now = new Date();
  var inRange = {};
  keys.forEach(function (k) { inRange[k] = true; });
  // Calls from dialer numbers missing in Team Mapping are kept out of the main report (own tab).
  var calls = allCalls.filter(function (c) { return c.agent !== 'Unmapped'; });
  var unmapped = allCalls.filter(function (c) { return c.agent === 'Unmapped' && inRange[c.shift]; });

  var perDay = [], exc = [], gaps = [];
  keys.forEach(function (key) {
    var dayCalls = calls.filter(function (c) { return c.shift === key; });
    var dayTrk = {};
    Object.keys(trk).forEach(function (a) {
      var T = trk[a];
      dayTrk[a] = {entries: T.entries.filter(function (e) { return e.shift === key; }),
                   leadCount: T.leadCount, leadTabs: T.leadTabs, error: T.error};
    });
    var day = analyseShift(key, dayCalls, dayTrk, now);
    perDay.push(day);
    day.exceptions.forEach(function (r) { exc.push([keyToDmy(key)].concat(r)); });
    day.gaps.forEach(function (r) { gaps.push([keyToDmy(key)].concat(r)); });
  });

  // Combine shifts per agent.
  var byAgent = {};
  perDay.forEach(function (day) {
    Object.keys(day.metrics).forEach(function (a) { (byAgent[a] = byAgent[a] || []).push(day.metrics[a]); });
  });
  var agents = sortAgents(Object.keys(byAgent));
  var combined = {};
  agents.forEach(function (a) { combined[a] = combine(byAgent[a], true); });
  combined.TOTAL = combine(agents.map(function (a) { return combined[a]; }), false);

  writeReport(agents, combined, perDay, exc, gaps, fromKey, toKey, now);
  writePresentable(agents, combined, fromKey, toKey, now);
  writeUnmapped(unmapped, trk, fromKey, toKey, now);
  SpreadsheetApp.flush();
  hideRecordTabs();
  if (opts.screenshot) screenshotReport(opts.screenshot, shotModel(agents, combined, fromKey, toKey, now));
  toast('Done — ' + keys.length + ' shift(s)');
}

// ---------- Dialer ----------
function readDialer(start, end, excluded) {
  var op = SpreadsheetApp.openById(CONFIG.OPENPHONE_ID);
  var tm = op.getSheetByName('Team Mapping').getDataRange().getValues();
  var byPn = {}, byNum = {};
  for (var i = 1; i < tm.length; i++) {
    var name = String(tm[i][0]).trim();
    if (!name) continue;
    if (tm[i][2]) byPn[String(tm[i][2]).trim()] = name;
    var n = normPhone(tm[i][1]);
    if (n) byNum[n] = name;
  }
  var sh = op.getSheetByName('Raw Data');
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, 15).getValues() : [];
  var calls = {};
  rows.forEach(function (r) {
    if (String(r[4]).indexOf('call.') !== 0 || !r[5]) return;
    var t = parseDmy(r[1]);
    if (!t || t < start || t > end) return;
    var shift = shiftKey(t, CONFIG.DIAL_START);
    if (!shift) return;
    var agent = byPn[String(r[7]).trim()] || byNum[normPhone(r[8])] || 'Unmapped';
    if (excluded[agent]) return;
    var id = String(r[5]);
    var c = calls[id] || (calls[id] = {agent: agent, number: normPhone(r[9]) || String(r[9]), dir: String(r[10]).toLowerCase(),
                                       time: t, shift: shift, answered: false, talk: 0, dur: 0,
                                       pn: String(r[7]).trim(), dialer: normPhone(r[8]) || String(r[8])});
    if (t < c.time) c.time = t;
    if (String(r[12]).toLowerCase() === 'yes') c.answered = true;
    c.talk = Math.max(c.talk, Number(r[14]) || 0);
    c.dur = Math.max(c.dur, Number(r[13]) || 0);
  });
  return Object.keys(calls).map(function (k) { return calls[k]; });
}

// ---------- Trackers ----------
function readTrackers(start, end, excluded) {
  var out = {};
  Object.keys(CONFIG.TRACKERS).forEach(function (agent) {
    if (excluded[agent]) return;
    var res = {entries: [], leadCount: {}, leadTabs: {}, error: ''};
    out[agent] = res;
    var ss;
    try { ss = SpreadsheetApp.openById(CONFIG.TRACKERS[agent]); } catch (e) { res.error = 'Cannot open: ' + e.message; return; }
    CONFIG.TRACKER_TABS.forEach(function (tab) {
      var sh = ss.getSheetByName(tab);
      if (!sh || sh.getLastRow() < 3) return;
      var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
      var h = v[1].map(function (x) { return String(x).trim().toLowerCase(); });
      var cLead = h.indexOf('lead id'), cName = h.indexOf('restaurant name'), cRp = h.indexOf('restaurant phone'),
          cOp = h.indexOf('owner phone'), cLu = h.indexOf('last updated');
      for (var i = 2; i < v.length; i++) {
        var lead = cLead >= 0 ? String(v[i][cLead]).trim() : '';
        if (lead) {
          res.leadCount[lead] = (res.leadCount[lead] || 0) + 1;
          (res.leadTabs[lead] = res.leadTabs[lead] || []).push(tab + ' r' + (i + 1));
        }
        if (cLu < 0) continue;
        var t = parseLastUpdated(v[i][cLu]);
        if (!t || t < start || t > end) continue;
        var shift = shiftKey(t, CONFIG.ENTRY_START);
        if (!shift || (!lead && !(cName >= 0 && v[i][cName]))) continue;
        res.entries.push({tab: tab, row: i + 1, lead: lead, name: cName >= 0 ? String(v[i][cName]) : '', shift: shift,
                          phones: [cRp >= 0 ? normPhone(v[i][cRp]) : '', cOp >= 0 ? normPhone(v[i][cOp]) : ''].filter(String),
                          time: t});
      }
    });
  });
  return out;
}

// ---------- One shift ----------
function analyseShift(key, calls, trk, now) {
  var mid = keyInstant(key, 0);
  var minsOf = function (t) { return (t - mid) / 60000; };
  var slotOf = function (t) {
    var m = minsOf(t);
    for (var s = 0; s < CONFIG.SLOTS.length; s++) if (m >= CONFIG.SLOTS[s][1] && m < CONFIG.SLOTS[s][2]) return s;
    return -1;
  };
  // Elapsed hours of each slot (partial while the shift is live).
  var slotHours = CONFIG.SLOTS.map(function (s) {
    var a = keyInstant(key, s[1]), b = new Date(Math.min(keyInstant(key, s[2]), now));
    return Math.max(0, (b - a) / 3600000);
  });
  // Hourly buckets (9 PM … 6 AM) and the elapsed working minutes inside each hour (slots only).
  var hourOf = function (t) {
    return Math.max(0, Math.min(CONFIG.HOUR_COUNT - 1, Math.floor((minsOf(t) - CONFIG.HOUR_START) / 60)));
  };
  var nowMin = minsOf(now);
  var hourWork = [];
  for (var hi = 0; hi < CONFIG.HOUR_COUNT; hi++) {
    var h0 = CONFIG.HOUR_START + hi * 60, h1 = Math.min(h0 + 60, nowMin), w = 0;
    CONFIG.SLOTS.forEach(function (s) { w += Math.max(0, Math.min(h1, s[2]) - Math.max(h0, s[1])); });
    hourWork.push(w);
  }

  var A = {};
  var get = function (a) { return A[a] || (A[a] = {out: [], inc: [], nums: {}, numConn: {}}); };
  Object.keys(trk).forEach(get);
  calls.forEach(function (c) {
    var x = get(c.agent);
    if (c.dir === 'outgoing') {
      x.out.push(c);
      x.nums[c.number] = (x.nums[c.number] || 0) + 1;
      if (c.answered || c.talk > 0) x.numConn[c.number] = true;
    } else x.inc.push(c);
  });

  var loggedBy = {}, dialedBy = {};
  Object.keys(trk).forEach(function (a) {
    trk[a].entries.forEach(function (e) { e.phones.forEach(function (p) { (loggedBy[p] = loggedBy[p] || {})[a] = 1; }); });
  });
  Object.keys(A).forEach(function (a) {
    Object.keys(A[a].nums).forEach(function (n) { (dialedBy[n] = dialedBy[n] || {})[a] = 1; });
  });

  var metrics = {}, exc = [], gapRows = [];
  Object.keys(A).forEach(function (a) {
    var x = A[a], T = trk[a] || {entries: [], leadCount: {}, leadTabs: {}, error: ''};
    var n = CONFIG.SLOTS.length;
    var m = newMetric();
    m.isTracker = !!trk[a];
    m.sHours = slotHours.slice();
    m.hWork = hourWork.slice();
    var note = function (t) { m.notes.push({d: key, t: t}); };

    x.out.sort(function (p, q) { return p.time - q.time; });
    var run = 0, runStart = null, best = {n: 0};
    x.out.forEach(function (c) {
      var ok = c.answered || c.talk > 0;
      m.dialed++;
      if (ok) m.conn++;
      if (c.talk >= CONFIG.CONNECT_MIN_SEC) m.conn15++;
      m.talkSec += c.talk;
      m.durSec += c.dur;
      var h = hourOf(c.time);
      m.hCalls[h]++;
      if (ok) m.hConn[h]++;
      m.hDurSec[h] += c.dur;
      if (c.talk >= CONFIG.LONG_CALL_MIN * 60) {
        m.longCalls++;
        if (!m.longest || c.talk > m.longest.sec) m.longest = {sec: c.talk, time: c.time, end: new Date(c.time.getTime() + c.dur * 1000)};
      }
      // Longest run of consecutive dials with no connect.
      if (ok) run = 0;
      else {
        if (!run) runStart = c.time;
        run++;
        if (run > best.n) best = {n: run, from: runStart, to: c.time};
      }
      m.firstCall = minDate(m.firstCall, c.time);
      m.lastCall = maxDate(m.lastCall, c.time);
      var s = slotOf(c.time);
      if (s < 0) m.breakCalls++;
      else { m.sCalls[s]++; if (c.answered || c.talk > 0) m.sConn[s]++; m.sTalk[s] += c.talk; }
    });
    m.incoming = x.inc.length;
    m.missed = x.inc.filter(function (c) { return !c.answered && !(c.talk > 0); }).length;

    var uniq = Object.keys(x.nums);
    m.uniq = uniq.length;
    uniq.forEach(function (num) {
      if (x.nums[num] > 1) { m.repeats++; m.extra += x.nums[num] - 1; exc.push([a, 'Repeat number', num, 'Dialed x' + x.nums[num]]); }
    });
    var noConn = uniq.filter(function (num) { return x.nums[num] > 1 && !x.numConn[num]; });
    m.noConnRepeat = noConn.length;
    noConn.forEach(function (num) { exc.push([a, 'Redialed, never connected', num, 'Dialed x' + x.nums[num] + ', 0 connects']); });

    // Observations for the "Notes" column (Report tab and screenshots).
    // One redialed number is named; with several, only those dialed 3+ times are named.
    var numX = function (num) { return num + ' ×' + x.nums[num]; };
    var many = noConn.filter(function (num) { return x.nums[num] >= 3; });
    if (m.extra) note(pl(m.extra, 'repeat dial') + ' (' + pl(m.repeats, 'number') + ')');
    if (noConn.length) note(noConn.length + ' redialed, never connected' + (noConn.length === 1 ? ': ' + numX(noConn[0])
      : many.length ? ' (' + many.slice(0, 2).map(numX).join(', ') + (many.length > 2 ? '…' : '') + ')' : ''));
    if (best.n >= CONFIG.BURST_NO_CONNECT) note(best.n + ' dials in a row, no connect ' + fmtSpan(best.from, best.to));
    if (m.dialed >= 10 && m.conn / m.dialed * 100 < CONFIG.LOW_CONNECT_PCT)
      note('Low connect ' + Math.round(m.conn / m.dialed * 100) + '% (' + m.conn + '/' + m.dialed + ')');
    if (m.longest) {
      var longSpan = fmtDur(m.longest.sec) + ' min ' + fmtSpan(m.longest.time, m.longest.end);
      note(m.longCalls === 1 ? 'Long call ' + longSpan + ' (on call)' : m.longCalls + ' long calls, longest ' + longSpan);
    }

    var logged = {};
    T.entries.forEach(function (e) {
      m.entries++;
      m.tabs[e.tab] = (m.tabs[e.tab] || 0) + 1;
      m.firstEntry = minDate(m.firstEntry, e.time);
      m.lastEntry = maxDate(m.lastEntry, e.time);
      var s = slotOf(e.time);
      if (s >= 0) m.sEntries[s]++; else m.breakEntries++;
      e.phones.forEach(function (p) { logged[p] = 1; });
    });
    if (m.isTracker) m.trkUniq = uniq.length;
    uniq.forEach(function (num) {
      if (!m.isTracker) return;
      if (logged[num]) { m.matched++; return; }
      m.notLogged++;
      if (x.numConn[num]) m.connNotLogged++;
      var others = Object.keys(loggedBy[num] || {});
      exc.push([a, x.numConn[num] ? 'Connected, not logged' : 'Dialed, not logged', num,
                others.length ? 'Logged in tracker of: ' + others.join(', ') : '']);
    });
    if (m.connNotLogged) note(pl(m.connNotLogged, 'connected call') + ' not logged');
    var seen = {};
    T.entries.forEach(function (e) {
      if (!e.phones.length) { m.noPhone++; exc.push([a, 'Entry without phone', e.lead, e.tab + ' r' + e.row + ' ' + e.name + ' @ ' + fmt(e.time)]); }
      else if (!e.phones.some(function (p) { return x.nums[p]; })) {
        m.loggedNotDialed++;
        exc.push([a, 'Logged, not dialed', e.phones[0], e.tab + ' r' + e.row + ' ' + e.lead + ' ' + e.name + ' @ ' + fmt(e.time)]);
      }
      if (e.lead) {
        if (seen[e.lead]) { m.dupShift++; exc.push([a, 'Duplicate Lead ID (this shift)', e.lead, e.tab + ' r' + e.row + ' ' + e.name]); }
        seen[e.lead] = 1;
      }
    });
    m.dupAll = Object.keys(T.leadCount).filter(function (l) { return T.leadCount[l] > 1; }).length;
    m.totalLeads = Object.keys(T.leadCount).length;
    if (T.error) exc.push([a, 'Error', '', T.error]);

    // Gaps between calls inside each work slot, and whether the tracker was being updated meanwhile.
    // Dialer-only agents get their gaps listed without the tracker check.
    // Each gap is kept in m.gapList (kind idle / trk / dialer) for the notes and the Idle screenshot.
    var lastSlot = CONFIG.SLOTS.length - 1;
    if (a !== 'Unmapped' && (m.dialed || m.entries)) {
      var acts = x.out.concat(x.inc).map(function (c) { return {from: c.time, to: new Date(c.time.getTime() + c.dur * 1000)}; })
        .sort(function (p, q) { return p.from - q.from; });
      CONFIG.SLOTS.forEach(function (s, si) {
        var sStart = keyInstant(key, s[1]);
        var sEnd = new Date(Math.min(keyInstant(key, s[2]), now));
        if (sEnd <= sStart) return;
        var cursor = sStart;
        var check = function (to) {
          var mins = (to - cursor) / 60000;
          if (mins > CONFIG.GAP_MIN) {
            var g = {d: key, from: cursor, to: to, mins: Math.round(mins), entries: 0,
                     lateStart: si === 0 && cursor.getTime() === sStart.getTime(),
                     atEnd: si === lastSlot && to.getTime() === keyInstant(key, s[2]).getTime()};
            m.gapList.push(g);
            m.gaps++;
            m.maxGap = Math.max(m.maxGap, g.mins);
            if (!m.isTracker) {
              g.kind = 'dialer';
              gapRows.push([a, s[0], fmt(cursor), fmt(to), Math.round(mins), 'n/a', '', 'Call gap (dialer only — tracker not checked)']);
              return;
            }
            var inGap = T.entries.filter(function (e) { return e.time >= cursor && e.time <= to; });
            g.entries = inGap.length;
            if (inGap.length) {
              g.kind = 'trk';
              m.gapsWithAct++;
            } else {
              g.kind = 'idle';
              m.gapsNoAct++;
              m.idleMin += Math.round(mins);
            }
            gapRows.push([a, s[0], fmt(cursor), fmt(to), Math.round(mins), inGap.length,
                          inGap.slice(0, 5).map(function (e) { return e.name || e.lead; }).join('; '),
                          inGap.length ? 'Tracker activity during gap (' + inGap.length + ' entries)' : 'No calls and no tracker activity']);
          }
        };
        acts.forEach(function (c) {
          if (c.to < sStart || c.from > sEnd) return;
          if (c.from > cursor) check(c.from);
          if (c.to > cursor) cursor = c.to;
        });
        if (sEnd > cursor) check(sEnd);
      });
      gapNotes(m.gapList).forEach(note);
    }
    metrics[a] = m;
  });

  Object.keys(dialedBy).forEach(function (num) {
    var who = Object.keys(dialedBy[num]);
    if (who.length > 1) exc.push([who.join(' + '), 'Dialed by multiple agents', num, '']);
  });
  return {key: key, metrics: metrics, exceptions: exc, gaps: gapRows};
}

// Notes for one shift's gaps: idle gaps (no calls, no tracker), dialer-only gaps, and long gaps with tracker updates.
function gapNotes(list) {
  var out = [], of = function (k) { return list.filter(function (g) { return g.kind === k; }); };
  var idle = of('idle'), dial = of('dialer').sort(function (p, q) { return q.mins - p.mins; });
  if (idle.length) out.push('⚠ Idle ' + joinAnd(idle.map(function (g) {
    return g.mins + ' min ' + fmtSpan(g.from, g.to) + (g.lateStart ? ' (late start)' : '');
  })));
  if (dial.length) out.push('⚠ No calls ' + dial[0].mins + ' min ' + fmtSpan(dial[0].from, dial[0].to) + (dial.length > 1
    ? ' (+ ' + dial.slice(1).map(function (g) { return g.mins + ' min'; }).join(', ') + ' gap' + (dial.length > 2 ? 's' : '') + ')' : ''));
  of('trk').forEach(function (g) {
    if (g.mins < CONFIG.TRACKER_GAP_NOTE_MIN) return;
    out.push('No calls ' + g.mins + ' min ' + (g.atEnd ? 'after ' + fmtT(g.from) : fmtSpan(g.from, g.to)) +
             ' but ' + g.entries + ' tracker entr' + (g.entries === 1 ? 'y' : 'ies'));
  });
  return out;
}

function newMetric() {
  var z = function () { return CONFIG.SLOTS.map(function () { return 0; }); };
  var zh = function () { var a = []; for (var i = 0; i < CONFIG.HOUR_COUNT; i++) a.push(0); return a; };
  return {durSec: 0, hCalls: zh(), hConn: zh(), hDurSec: zh(), hWork: zh(), longCalls: 0, longest: null,
          noConnRepeat: 0, notes: [], gapList: [],
          dialed: 0, conn: 0, conn15: 0, talkSec: 0, uniq: 0, trkUniq: 0, repeats: 0, extra: 0, incoming: 0, missed: 0,
          firstCall: null, lastCall: null, breakCalls: 0,
          entries: 0, tabs: {}, firstEntry: null, lastEntry: null, breakEntries: 0, noPhone: 0,
          matched: 0, notLogged: 0, connNotLogged: 0, loggedNotDialed: 0, dupShift: 0, dupAll: 0, totalLeads: 0,
          sCalls: z(), sConn: z(), sTalk: z(), sEntries: z(), sHours: z(),
          gaps: 0, gapsWithAct: 0, gapsNoAct: 0, idleMin: 0, maxGap: 0, isTracker: false};
}

// Combine metrics: over shifts of one agent (allTimeLatest = true) or over agents for the TOTAL row.
function combine(list, allTimeLatest) {
  var r = newMetric();
  list.forEach(function (m) {
    Object.keys(m).forEach(function (k) {
      var v = m[k];
      if (k === 'sHours' || k === 'hWork') { r[k] = allTimeLatest ? r[k].map(function (h, i) { return h + v[i]; }) : v.slice(); }
      else if (k === 'notes' || k === 'gapList') r[k] = r[k].concat(v);
      else if (k === 'longest') { if (v && (!r.longest || v.sec > r.longest.sec)) r.longest = v; }
      else if (Array.isArray(v)) r[k] = r[k].map(function (x, i) { return x + v[i]; });
      else if (k === 'tabs') Object.keys(v).forEach(function (t) { r.tabs[t] = (r.tabs[t] || 0) + v[t]; });
      else if (k === 'firstCall' || k === 'firstEntry') r[k] = minDate(r[k], v);
      else if (k === 'lastCall' || k === 'lastEntry') r[k] = maxDate(r[k], v);
      else if (k === 'maxGap') r[k] = Math.max(r[k], v);
      else if (k === 'isTracker') r[k] = r[k] || v;
      else if ((k === 'dupAll' || k === 'totalLeads') && allTimeLatest) r[k] = v;
      else if (typeof v === 'number') r[k] += v;
    });
  });
  return r;
}

// ---------- Table rows ----------
var COMP_HEAD = ['Agent', 'Calls Dialed', 'Unique Numbers', 'Connected', 'Talk Min', 'Tracker Entries',
                 'Unique Dialed − Entries', 'Logging % (dialed & logged / unique)', 'Dialed & Logged',
                 'Connected Not Logged', 'Logged Not Dialed', 'Repeat Numbers', 'Status'];
function compRow(a, m) {
  var pctV = m.trkUniq ? Math.round(m.matched / m.trkUniq * 100) : '';
  var t = m.isTracker;
  var status = a === 'Unmapped' ? 'Dialer number not in Team Mapping'
    : CONFIG.DIALER_ONLY.indexOf(a) >= 0 ? 'Dialer only (no tracker comparison)'
    : !m.dialed && !m.entries ? 'No activity'
    : !m.dialed ? 'Entries but no calls'
    : !m.entries ? 'Calls but no tracker entries'
    : pctV >= 90 ? 'OK' : pctV >= 70 ? 'Check' : 'Low logging';
  return [a, m.dialed, m.uniq, m.conn, round1(m.talkSec / 60), t ? m.entries : '',
          t ? m.trkUniq - m.entries : '', pctV === '' ? '' : pctV + '%', t ? m.matched : '', t ? m.connNotLogged : '',
          t ? m.loggedNotDialed : '', m.repeats, a === 'TOTAL' ? '' : status];
}

function patHead() {
  var h = ['Agent'];
  CONFIG.SLOTS.forEach(function (s) { h.push(s[0] + ' Calls', s[0] + ' Connected', s[0] + ' Tracker Entries', s[0] + ' Calls/hr'); });
  return h.concat(['Calls in breaks', 'Entries in breaks', 'Peak Slot', 'Lowest Slot', 'Trend (last vs first slot)',
                   'Gaps ≥ ' + CONFIG.GAP_MIN + ' min', 'Gaps with tracker activity', 'Gaps with NO activity',
                   'Idle min (no activity)', 'Longest gap (min)']);
}
function patRow(a, m) {
  var r = [a], rates = [];
  CONFIG.SLOTS.forEach(function (s, i) {
    var rate = m.sHours[i] && a !== 'TOTAL' ? round1(m.sCalls[i] / m.sHours[i]) : '';
    rates.push(rate);
    r.push(m.sCalls[i], m.sConn[i], m.isTracker ? m.sEntries[i] : '', rate);
  });
  var lab = CONFIG.SLOTS.map(function (s) { return s[0]; });
  var live = rates.map(function (x, i) { return {x: x, i: i}; }).filter(function (o) { return o.x !== ''; });
  var peak = '', low = '', trend = '';
  if (live.length && m.dialed) {
    peak = lab[live.reduce(function (p, q) { return q.x > p.x ? q : p; }).i];
    low = lab[live.reduce(function (p, q) { return q.x < p.x ? q : p; }).i];
    var f = live[0].x, l = live[live.length - 1].x;
    if (live.length > 1) trend = f ? (l >= f ? '+' : '') + Math.round((l - f) / f * 100) + '%' : (l ? 'up from 0' : '0');
  }
  return r.concat([m.breakCalls, m.isTracker ? m.breakEntries : '', peak, low, trend,
                   m.gaps, m.gapsWithAct, m.gapsNoAct, m.idleMin, m.maxGap]);
}

var GAP_HEAD = ['Shift Date', 'Agent', 'Slot', 'Gap From', 'Gap To', 'Minutes', 'Tracker entries in gap', 'Entries (first 5)', 'Verdict'];

var DIAL_HEAD = ['Agent', 'Calls Dialed', 'Connected (answered)', 'Connected (15s+)', 'Talk Min', 'Unique Numbers',
                 'Repeat Numbers', 'Extra Dials', 'Incoming', 'Missed', 'First Call', 'Last Call', 'Calls in breaks']
  .concat(CONFIG.SLOTS.map(function (s) { return s[0] + ' Calls'; }));
function dialRow(a, m) {
  return [a, m.dialed, m.conn, m.conn15, round1(m.talkSec / 60), m.uniq, m.repeats, m.extra, m.incoming, m.missed,
          fmt(m.firstCall), fmt(m.lastCall), m.breakCalls].concat(m.sCalls);
}

var TRK_HEAD = ['Agent', 'Tracker Entries'].concat(CONFIG.TRACKER_TABS)
  .concat(['First Entry', 'Last Entry', 'Entries without phone', 'Dup Lead IDs (shift)', 'Dup Lead IDs (all time)', 'Total Leads Ever'])
  .concat(CONFIG.SLOTS.map(function (s) { return s[0] + ' Entries'; }));
function trkRow(a, m) {
  return [a, m.entries].concat(CONFIG.TRACKER_TABS.map(function (t) { return m.tabs[t] || 0; }))
    .concat([fmt(m.firstEntry), fmt(m.lastEntry), m.noPhone, m.dupShift, m.dupAll, m.totalLeads]).concat(m.sEntries);
}

// ---------- Presentable "Report" tab (summary of the detailed tabs) ----------
var STYLE = {
  title: '#1f3864', header: '#2f5597', headerText: '#ffffff', section: '#1f3864',
  band: '#f3f6fb', total: '#d9e2f3', kpiLabel: '#dde7f5', border: '#b4c6e7', absent: '#eeeeee',
  green: '#188038', amber: '#e37400', red: '#d93025', blue: '#1a73e8',
  flagBg: '#fde7e4', warnBg: '#fff3e0'
};
var REPORT_W = 13;   // Report tab width (A–M); Notes are merged across K–M in the scorecard.

function statusColor(s) {
  s = String(s);
  if (/^OK/.test(s)) return STYLE.green;
  if (/^Check/.test(s)) return STYLE.amber;
  if (/^Dialer only/.test(s)) return STYLE.blue;
  if (/^(Absent|No activity yet)/.test(s)) return '#777777';
  return s ? STYLE.red : null;
}

function isAbsent(m) { return !m.dialed && !m.entries; }

// Scorecard status: logging status, downgraded to "Check" when there was an inactive gap.
function scoreStatus(a, m, live) {
  if (isAbsent(m)) return live ? 'No activity yet' : 'Absent';
  var s = compRow(a, m)[12];
  if (m.gapsNoAct || (!m.isTracker && m.gaps)) {
    if (s === 'OK') return 'Check inactivity';
    if (s === 'Check') return 'Check logging + inactivity';
    if (/^Dialer only/.test(s)) return 'Dialer only · check inactivity';
  }
  return s;
}

function activityStatus(a, m, live) {
  if (isAbsent(m)) return live ? 'No activity yet' : 'Absent';
  if (m.gapsNoAct > 0 || (!m.isTracker && m.gaps > 0)) return 'Check inactivity';
  return 'OK';
}

// Hourly direction from calls per working hour (breaks excluded), ignoring hours with < 20 working minutes so far.
// red[i] = extreme decline: below DECLINE_PCT of the agent's peak rate, in an hour after the peak.
// Direction compares the average rate of the 1st and 2nd half of the hours, and whether the last hour is red.
function hourlyTrend(m) {
  var red = m.hCalls.map(function () { return false; }), pts = [];
  for (var i = 0; i < CONFIG.HOUR_COUNT; i++) if (m.hWork[i] >= 20) pts.push({i: i, y: m.hCalls[i] / m.hWork[i] * 60});
  if (pts.length < 4 || !m.dialed) return {label: pts.length && m.dialed ? 'Too early' : '', color: '#777777', red: red};
  var top = 0;
  pts.forEach(function (p, k) { if (p.y > pts[top].y) top = k; });
  pts.forEach(function (p, k) { if (k > top && p.y < pts[top].y * CONFIG.DECLINE_PCT / 100) red[p.i] = true; });
  var avg = function (list) { return list.reduce(function (s, p) { return s + p.y; }, 0) / list.length; };
  var half = Math.ceil(pts.length / 2), a1 = avg(pts.slice(0, half)), a2 = avg(pts.slice(half));
  var chg = a1 ? Math.round((a2 - a1) / a1 * 100) : 0, sign = (chg > 0 ? '+' : '') + chg + '%';
  var last = pts[pts.length - 1], endDrop = red[last.i], lim = CONFIG.HALF_CHANGE_PCT;
  var out = chg <= -lim && endDrop ? {label: 'Drop in 2nd half & at end ↓↓ (' + sign + ')', color: STYLE.red}
    : endDrop ? {label: 'Drop at end of shift ↓ (' + hourLabel(CONFIG.HOUR_START / 60 + last.i) + ')', color: STYLE.red}
    : chg <= -lim ? {label: 'Slower 2nd half ↓ (' + sign + ')', color: STYLE.amber}
    : chg >= lim ? {label: 'Rising ↑ (' + sign + ')', color: STYLE.green}
    : {label: 'Steady →', color: STYLE.blue};
  out.red = red;
  return out;
}

function hourLabels() {
  var out = [];
  for (var i = 0; i < CONFIG.HOUR_COUNT; i++) out.push(hourLabel(Math.floor(CONFIG.HOUR_START / 60 + i) % 24));
  return out;
}

function writePresentable(agents, combined, fromKey, toKey, now) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Report') || ss.insertSheet('Report', 0);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  sh.setFrozenRows(0);
  var W = REPORT_W, T = combined.TOTAL;
  var live = keyInstant(toKey, 24 * 60 + CONFIG.SHIFT_END) > now;
  var multi = fromKey !== toKey;
  var active = agents.filter(function (a) { return !isAbsent(combined[a]); })
    .sort(function (p, q) { return combined[q].dialed - combined[p].dialed || p.localeCompare(q); });
  var absent = agents.filter(function (a) { return isAbsent(combined[a]); });

  sh.getRange(1, 1, 1, W).merge().setValue('NIGHT SHIFT CALL REPORT — ' + rangeLabel(fromKey, toKey))
    .setBackground(STYLE.title).setFontColor('#ffffff').setFontSize(16).setFontWeight('bold').setVerticalAlignment('middle');
  sh.setRowHeight(1, 40);
  sh.getRange(2, 1, 1, W).merge().setValue('Run at ' + fmt(now) + ' IST' + (live ? '  •  SHIFT IN PROGRESS (live)' : '') +
    '  •  Excluded: ' + CONFIG.EXCLUDE_AGENTS.join(', ') + '  •  Dialer only: ' + CONFIG.DIALER_ONLY.join(', ') +
    '  •  Unmapped numbers: Unmapped tab  •  Details: Comparison / Dialer / Tracker tabs')
    .setFontColor('#555555').setFontStyle('italic');

  // KPI strip (positions are read by screenshotReport for the Screenshots tab).
  var logPct = T.trkUniq ? Math.round(T.matched / T.trkUniq * 100) + '%' : '–';
  var kpis = [['Calls Dialed', T.dialed], ['Connected', T.conn + ' (' + pct(T.conn, T.dialed) + ')'],
              ['On-call (min)', fmtDur(T.durSec) + ' min'], ['Talk (min)', fmtDur(T.talkSec) + ' min'], ['Tracker Entries', T.entries],
              ['Logging %', logPct], ['Repeat Dials', T.extra], ['Inactive > ' + CONFIG.GAP_MIN + ' min', T.gapsNoAct],
              ['Absent', live ? '–' : absent.length]];
  sh.getRange(4, 1, 1, kpis.length).setValues([kpis.map(function (k) { return k[0]; })])
    .setBackground(STYLE.kpiLabel).setFontWeight('bold').setFontColor(STYLE.title).setHorizontalAlignment('center').setWrap(true);
  sh.getRange(5, 1, 1, kpis.length).setValues([kpis.map(function (k) { return k[1]; })])
    .setFontSize(15).setFontWeight('bold').setFontColor(STYLE.header).setHorizontalAlignment('center');
  sh.setRowHeight(5, 36);
  sh.getRange(4, 1, 2, kpis.length).setBorder(true, true, true, true, true, true, STYLE.border, SpreadsheetApp.BorderStyle.SOLID);

  var r = 7;
  // 1. Scorecard + Notes
  var head1 = ['Agent', 'Calls Dialed', 'Connected', 'Connect %', 'On-call (min)', 'Talk (min)', 'Tracker Entries',
               'Logging %', 'Repeat Dials', 'Status', 'Notes / Observations', '', ''];
  var notesOf = function (m) {
    return m.notes.map(function (n) { return (multi ? '[' + keyToDmy(n.d).slice(0, 5) + '] ' : '') + n.t; }).join('\n') || '—';
  };
  var rows1 = active.map(function (a) {
    var m = combined[a], c = compRow(a, m);
    return [a, m.dialed, m.conn, pct(m.conn, m.dialed), fmtDur(m.durSec), fmtDur(m.talkSec), m.isTracker ? m.entries : '–',
            m.isTracker ? (c[7] || '–') : '–', m.extra, scoreStatus(a, m, live), notesOf(m), '', ''];
  });
  rows1.push(['TOTAL', T.dialed, T.conn, pct(T.conn, T.dialed), fmtDur(T.durSec), fmtDur(T.talkSec), T.entries, logPct,
              T.extra, '', '', '', '']);
  absent.forEach(function (a) {
    rows1.push([a, 0, 0, '–', '–', '–', combined[a].isTracker ? 0 : '–', '–', 0, scoreStatus(a, combined[a], live),
                live ? 'No calls or tracker entries yet' : 'No calls and no tracker entries all shift', '', '']);
  });
  var top1 = r;
  r = presentTable(sh, r, '1. Agent Scorecard — calls vs talk time vs tracker (absent agents at the bottom)', head1, rows1,
                   {status: [9], pct: [7]});
  for (var i = 0; i < rows1.length; i++) {
    var rowN = top1 + 2 + i, row = rows1[i];
    sh.getRange(rowN, 11, 1, 3).merge().setHorizontalAlignment('left').setVerticalAlignment('top').setWrap(true).setFontSize(9);
    if (row[0] === 'TOTAL') continue;
    if (absent.indexOf(row[0]) >= 0) { sh.getRange(rowN, 1, 1, W).setBackground(STYLE.absent).setFontColor('#777777'); continue; }
    var m = combined[row[0]];
    if (m.gapsNoAct || (!m.isTracker && m.gaps)) sh.getRange(rowN, 11, 1, 3).setBackground(STYLE.flagBg);
    if (m.extra >= CONFIG.REPEAT_DIAL_FLAG || m.noConnRepeat) sh.getRange(rowN, 9).setBackground(STYLE.warnBg).setFontColor(STYLE.amber).setFontWeight('bold');
    if (m.dialed >= 10 && m.conn / m.dialed * 100 < CONFIG.LOW_CONNECT_PCT) sh.getRange(rowN, 4).setFontColor(STYLE.red).setFontWeight('bold');
  }
  sh.getRange(top1 + 1, 11, 1, 3).merge();

  // 2. Hourly trend
  var hl = hourLabels();
  var head2 = ['Agent'].concat(hl).concat(['Trend', 'Direction']);
  var rows2 = active.map(function (a) {
    var m = combined[a];
    return [a].concat(m.hCalls.map(function (c, i) { return m.hWork[i] ? c + ' (' + Math.round(m.hDurSec[i] / 60) + ' min)' : ''; }))
      .concat(['', hourlyTrend(m).label]);
  });
  rows2.push(['TOTAL'].concat(T.hCalls.map(function (c, i) { return T.hWork[i] ? c + ' (' + Math.round(T.hDurSec[i] / 60) + ' min)' : ''; }))
    .concat(['', hourlyTrend(T).label]));
  var top2 = r;
  r = presentTable(sh, r, '2. Hourly Call Trend — calls (minutes on call) per hour; breaks 11:00–11:20 PM, 1:00–1:30 AM, 3:00–3:20 AM',
                   head2, rows2, {});
  active.concat(['TOTAL']).forEach(function (a, i) {
    var m = combined[a], vals = [];
    for (var h = 0; h < CONFIG.HOUR_COUNT; h++) if (m.hWork[h]) vals.push(m.hCalls[h]);
    if (vals.length) sh.getRange(top2 + 2 + i, CONFIG.HOUR_COUNT + 2)
      .setFormula('=SPARKLINE({' + vals.join(',') + '},{"charttype","column";"color","' + STYLE.header + '"})');
    var tr = hourlyTrend(m);
    sh.getRange(top2 + 2 + i, CONFIG.HOUR_COUNT + 3).setFontColor(tr.color).setFontWeight('bold');
    tr.red.forEach(function (isRed, h) {
      if (isRed) sh.getRange(top2 + 2 + i, h + 2).setFontColor(STYLE.red).setFontWeight('bold');
    });
  });

  // 3. Idle time & gaps
  var head3 = ['Agent', 'First Call', 'Last Call', 'Calls Dialed', 'On-call (min)', 'Talk (min)', 'Gaps > ' + CONFIG.GAP_MIN + ' min',
               'Gaps with Tracker Activity', 'Inactive Gaps (no calls, no tracker)', 'Inactive Min', 'Longest Gap (min)', 'Activity Status', ''];
  var rows3 = active.map(function (a) {
    var m = combined[a];
    return [a, fmt(m.firstCall), fmt(m.lastCall), m.dialed, fmtDur(m.durSec), fmtDur(m.talkSec), m.gaps,
            m.isTracker ? m.gapsWithAct : '–', m.isTracker ? m.gapsNoAct : '–', m.isTracker ? m.idleMin : '–', m.maxGap,
            activityStatus(a, m, live), ''];
  });
  rows3.push(['TOTAL', fmt(T.firstCall), fmt(T.lastCall), T.dialed, fmtDur(T.durSec), fmtDur(T.talkSec), T.gaps,
              T.gapsWithAct, T.gapsNoAct, T.idleMin, T.maxGap, '', '']);
  var top3 = r;
  r = presentTable(sh, r, '3. Idle Time & Call Gaps (> ' + CONFIG.GAP_MIN + ' min inside work slots; time on a call is never counted as idle)',
                   head3, rows3, {status: [11]});
  rows3.forEach(function (row, i) {
    if (row[0] !== 'TOTAL' && Number(row[8]) > 0) sh.getRange(top3 + 2 + i, 9, 1, 2).setBackground(STYLE.flagBg).setFontColor(STYLE.red).setFontWeight('bold');
  });

  sh.getRange(r, 1, 1, W).merge().setValue(
    'Key:  On-call (min) = dialing + ringing + talking (line busy)  •  Talk (min) = connected conversation  •  All durations in minutes  •  Repeat Dials = extra dials to numbers already called  •  ' +
    'Green OK  •  Orange Check  •  Red = low logging / extreme decline (below ' + CONFIG.DECLINE_PCT + '% of the agent\'s peak, after the peak) / inactive  •  ' +
    'Blue = dialer only  •  Grey = absent  •  ' +
    'Pink notes = inactive > ' + CONFIG.GAP_MIN + ' min with no calls and no tracker activity')
    .setFontColor('#555555').setFontStyle('italic').setWrap(true);
  sh.setRowHeight(r, 44);

  sh.setColumnWidth(1, 120);
  for (var c = 2; c <= W; c++) sh.setColumnWidth(c, 92);
  sh.setColumnWidths(11, 3, 150);
  sh.setHiddenGridlines(true);
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);
}

// Styled table: section title, coloured header, banded rows, bold TOTAL row,
// opt.status / opt.pct (0-based columns) get bold coloured text.
function presentTable(sh, r, label, head, rows, opt) {
  var W = REPORT_W;
  head = head.concat([]);
  while (head.length < W) head.push('');
  rows = rows.map(function (x) { x = x.concat([]); while (x.length < W) x.push(''); return x; });
  var used = 0;
  head.forEach(function (h, i) { if (h !== '') used = i + 1; });
  if (head[10] === 'Notes / Observations') used = W;
  sh.getRange(r, 1, 1, W).merge().setValue(label).setFontWeight('bold').setFontSize(12).setFontColor(STYLE.section);
  sh.getRange(r + 1, 1, 1, used).setValues([head.slice(0, used)]).setBackground(STYLE.header).setFontColor(STYLE.headerText)
    .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(r + 1, 36);
  sh.getRange(r + 2, 1, rows.length, used).setValues(rows.map(function (x) { return x.slice(0, used); }))
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(r + 2, 1, rows.length, 1).setHorizontalAlignment('left').setFontWeight('bold');
  rows.forEach(function (row, i) {
    var line = sh.getRange(r + 2 + i, 1, 1, used);
    if (row[0] === 'TOTAL') line.setBackground(STYLE.total).setFontWeight('bold');
    else if (i % 2) line.setBackground(STYLE.band);
    (opt.status || []).forEach(function (c) {
      var col = statusColor(row[c]);
      if (col) sh.getRange(r + 2 + i, c + 1).setFontColor(col).setFontWeight('bold');
    });
    (opt.pct || []).forEach(function (c) {
      var v = parseInt(row[c], 10);
      if (!isNaN(v)) sh.getRange(r + 2 + i, c + 1).setFontWeight('bold')
        .setFontColor(v >= 90 ? STYLE.green : v >= 70 ? STYLE.amber : STYLE.red);
    });
  });
  sh.getRange(r + 1, 1, rows.length + 1, used).setBorder(true, true, true, true, true, true, STYLE.border, SpreadsheetApp.BorderStyle.SOLID);
  return r + 2 + rows.length + 2;
}

// ---------- Output ----------
function rangeLabel(fromKey, toKey) {
  return fromKey === toKey ? keyToDmy(fromKey) : keyToDmy(fromKey) + ' → ' + keyToDmy(toKey);
}

function reportTitle(fromKey, toKey, now) {
  var live = keyInstant(toKey, 24 * 60 + CONFIG.SHIFT_END) > now ? ' | SHIFT IN PROGRESS (live, partial)' : '';
  return 'SHIFT CALL AUDIT — shift(s) ' + rangeLabel(fromKey, toKey) + ' | Run at ' + fmt(now) + ' IST' + live +
         ' | Excluded: ' + CONFIG.EXCLUDE_AGENTS.join(', ') +
         (CONFIG.DIALER_ONLY.length ? ' | Dialer only: ' + CONFIG.DIALER_ONLY.join(', ') : '') +
         ' | Unmapped dialer numbers: see Unmapped tab';
}

// Separate tab: activity of OpenPhone numbers that are not in Team Mapping.
function writeUnmapped(calls, trk, fromKey, toKey, now) {
  var loggedBy = {};
  Object.keys(trk).forEach(function (a) {
    trk[a].entries.forEach(function (e) {
      e.phones.forEach(function (p) { (loggedBy[p] = loggedBy[p] || []).push({agent: a, name: e.name, shift: e.shift}); });
    });
  });
  var by = {};
  calls.forEach(function (c) {
    var k = c.dialer + '|' + c.pn;
    var x = by[k] || (by[k] = {dialer: c.dialer, pn: c.pn, out: 0, conn: 0, talk: 0, inc: 0, missed: 0, nums: {}, first: null, last: null, links: {}});
    x.first = minDate(x.first, c.time);
    x.last = maxDate(x.last, c.time);
    if (c.dir === 'outgoing') {
      x.out++;
      if (c.answered || c.talk > 0) x.conn++;
      x.talk += c.talk;
      x.nums[c.number] = (x.nums[c.number] || 0) + 1;
      (loggedBy[c.number] || []).forEach(function (l) {
        if (l.shift === c.shift) x.links[c.number] = l;
      });
    } else {
      x.inc++;
      if (!c.answered && !(c.talk > 0)) x.missed++;
    }
  });
  var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (p, q) { return q.out - p.out || q.inc - p.inc; });
  var rows = list.map(function (x) {
    var uniq = Object.keys(x.nums);
    var agentsSeen = {};
    Object.keys(x.links).forEach(function (n) { agentsSeen[x.links[n].agent] = (agentsSeen[x.links[n].agent] || 0) + 1; });
    return [x.dialer, x.pn, x.out, x.conn, round1(x.talk / 60), uniq.length,
            uniq.filter(function (n) { return x.nums[n] > 1; }).length, x.inc, x.missed, fmt(x.first), fmt(x.last),
            Object.keys(agentsSeen).map(function (a) { return a + ' (' + agentsSeen[a] + ')'; }).join(', ')];
  });
  var tot = ['TOTAL', ''];
  for (var c = 2; c <= 8; c++) tot.push(round1(rows.reduce(function (s, r) { return s + r[c]; }, 0)));
  rows.push(tot.concat(['', '', '']));
  var detail = [];
  list.forEach(function (x) {
    Object.keys(x.links).forEach(function (n) { detail.push([x.dialer, n, x.links[n].agent, x.links[n].name]); });
  });

  var sh = resetSheet(SpreadsheetApp.getActive(), 'Unmapped', reportTitle(fromKey, toKey, now));
  if (!sh.isSheetHidden()) sh.hideSheet();   // record-only tab
  var r = section(sh, 3, 'OpenPhone numbers not in Team Mapping — add them to Team Mapping to credit an agent',
                  ['Dialer Number', 'Phone Number ID', 'Calls Dialed', 'Connected', 'Talk Min', 'Unique Numbers',
                   'Repeat Numbers', 'Incoming', 'Missed', 'First Call', 'Last Call', 'Called numbers found in tracker of'],
                  rows, true);
  section(sh, r, 'Numbers dialed from unmapped lines that appear in an agent\'s tracker (same shift)',
          ['Dialer Number', 'Number Called', 'Tracker of', 'Restaurant'], detail, false);
}

function writeReport(agents, combined, perDay, exc, gaps, fromKey, toKey, now) {
  var ss = SpreadsheetApp.getActive();
  var range = rangeLabel(fromKey, toKey);
  var title = reportTitle(fromKey, toKey, now);
  var rowsFor = function (fn, withTracker) {
    var list = agents.filter(function (a) { return !withTracker || combined[a].isTracker; });
    return list.map(function (a) { return fn(a, combined[a]); }).concat([fn('TOTAL', combined.TOTAL)]);
  };

  var old = ss.getSheetByName('Summary');
  if (old) ss.deleteSheet(old);

  var c = resetSheet(ss, 'Comparison', title);
  var r = 3;
  r = section(c, r, '1. Dialer vs Call Tracker (per agent)', COMP_HEAD, rowsFor(compRow, false), true);
  r = section(c, r, '2. Call fluctuations & patterns by slot (breaks: 11:00–11:20 PM, 1:00–1:30 AM, 3:00–3:20 AM)',
              patHead(), rowsFor(patRow, false), true);
  r = section(c, r, '3. Call gaps ≥ ' + CONFIG.GAP_MIN + ' min inside work slots — was the tracker being updated?', GAP_HEAD, gaps, false);
  c.setFrozenColumns(1);

  var d = resetSheet(ss, 'Dialer Report', title);
  section(d, 3, 'OpenPhone dialer activity (Raw Data + Team Mapping)', DIAL_HEAD, rowsFor(dialRow, false), true);
  d.setFrozenColumns(1);

  var t = resetSheet(ss, 'Tracker Report', title);
  section(t, 3, 'Call Tracker sheet entries (Last Updated in shift)', TRK_HEAD, rowsFor(trkRow, true), true);
  t.setFrozenColumns(1);

  var dl = resetSheet(ss, 'Daily', title);
  var dHead = ['Shift Date'].concat(COMP_HEAD).concat(CONFIG.SLOTS.map(function (s) { return s[0] + ' Calls'; }));
  var dRows = [];
  perDay.forEach(function (day) {
    sortAgents(Object.keys(day.metrics)).forEach(function (a) {
      var m = day.metrics[a];
      dRows.push([keyToDmy(day.key)].concat(compRow(a, m)).concat(m.sCalls));
    });
  });
  section(dl, 3, 'Per shift, per agent', dHead, dRows, false);
  dl.setFrozenColumns(2);

  var e = resetSheet(ss, 'Exceptions', title);
  section(e, 3, 'Exceptions', ['Shift Date', 'Agent', 'Type', 'Number / Lead ID', 'Detail'], exc, false);

  var log = ss.getSheetByName('Run Log') || ss.insertSheet('Run Log');
  if (!log.isSheetHidden()) log.hideSheet();   // record-only tab
  if (log.getLastRow() === 0) log.appendRow(['Run At (IST)', 'Shift(s)', 'Run By', 'Exceptions', 'Gaps']);
  log.appendRow([fmt(now), range, Session.getActiveUser().getEmail() || 'auto-refresh', exc.length, gaps.length]);
}

function resetSheet(ss, name, title) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.setFrozenRows(0);
  sh.getRange(1, 1).setValue(title).setFontWeight('bold').setFontSize(12);
  return sh;
}

// Writes a titled table at row r; returns the next free row (with 2 blank rows of spacing).
function section(sh, r, label, head, rows, hasTotal) {
  sh.getRange(r, 1).setValue(label).setFontWeight('bold').setFontSize(11);
  sh.getRange(r + 1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eaed').setWrap(true);
  if (rows.length) sh.getRange(r + 2, 1, rows.length, head.length).setValues(rows);
  else sh.getRange(r + 2, 1).setValue('(none)');
  if (hasTotal && rows.length) sh.getRange(r + 1 + rows.length, 1, 1, head.length).setFontWeight('bold').setBackground('#f1f3f4');
  return r + 2 + Math.max(rows.length, 1) + 2;
}

function controls() {
  var ss = SpreadsheetApp.getActive();
  var c = ss.getSheetByName('Controls');
  if (c) return c;
  c = ss.insertSheet('Controls', 0);
  c.getRange('A1:A5').setValues([['From shift date (DD/MM/YYYY)'], ['To shift date (DD/MM/YYYY)'], [''],
                                 ['Leave dates blank = latest shift. Then use menu Shift Audit → Run report.'], ['Auto-refresh']]);
  c.getRange('B1:B2').setNumberFormat('@');
  c.getRange('B5').setValue('OFF');
  c.getRange('A1:A5').setFontWeight('bold');
  c.setColumnWidth(1, 330);
  return c;
}

function toast(msg) { try { SpreadsheetApp.getActive().toast(msg, 'Shift Audit', 10); } catch (e) {} }

// ---------- Helpers ----------
function sortAgents(list) {
  return list.sort(function (x, y) { return (x === 'Unmapped') - (y === 'Unmapped') || x.localeCompare(y); });
}

function normPhone(v) {
  var d = String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
  if (d.length === 10) d = '1' + d;
  return d.length === 11 && d[0] === '1' ? d : '';
}

function istInstant(y, m, d, h, mi) { return new Date(Date.UTC(y, m, d, h, mi) - IST_OFFSET_MS); }

function istParts(dt) {
  var x = new Date(dt.getTime() + IST_OFFSET_MS);
  return {y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes()};
}

// Shift keys are 'YYYY-MM-DD' of the evening the shift starts.
function makeKey(y, m, d) { return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); }
function addDays(key, n) { var p = key.split('-'); return makeKey(+p[0], +p[1] - 1, +p[2] + n); }
function keyInstant(key, minutes) { var p = key.split('-'); return istInstant(+p[0], +p[1] - 1, +p[2], 0, minutes); }
function keyToDmy(key) { var p = key.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function parseKey(s) {
  var m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? makeKey(+m[3], +m[2] - 1, +m[1]) : null;
}

// Which shift a timestamp belongs to (null if it falls in the daytime gap).
function shiftKey(t, startMin) {
  var p = istParts(t), mins = p.h * 60 + p.mi;
  if (mins >= startMin) return makeKey(p.y, p.m, p.d);
  if (mins <= CONFIG.SHIFT_END) return makeKey(p.y, p.m, p.d - 1);
  return null;
}

function latestShiftKey() {
  var p = istParts(new Date());
  var k = makeKey(p.y, p.m, p.d);
  return p.h * 60 + p.mi < CONFIG.ENTRY_START ? addDays(k, -1) : k;
}

// "13/10/2026 21:48:41" (IST) or a Date cell
function parseDmy(v) {
  if (v instanceof Date) return v;
  var m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(istInstant(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime() + (+(m[6] || 0)) * 1000);
}

// "13 Oct 2026 09:14 pm" (IST) or a Date cell
function parseLastUpdated(v) {
  if (v instanceof Date) return v;
  var m = String(v).trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([ap]m)?/i);
  if (!m || MONTHS[m[2].toLowerCase()] == null) return null;
  var h = +m[4];
  if (m[6]) { var pm = m[6].toLowerCase() === 'pm'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return istInstant(+m[3], MONTHS[m[2].toLowerCase()], +m[1], h, +m[5]);
}

function fmt(d) { return d ? Utilities.formatDate(d, 'Asia/Kolkata', 'dd MMM HH:mm') : ''; }
function round1(x) { return Math.round(x * 10) / 10; }
function minDate(a, b) { return !a ? b : !b ? a : (b < a ? b : a); }
function maxDate(a, b) { return !a ? b : !b ? a : (b > a ? b : a); }

function pl(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
function pct(a, b) { return b ? Math.round(a / b * 100) + '%' : '–'; }
function fmtDur(sec) {
  return String(Math.round((sec || 0) / 60)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtT(d) { return d ? Utilities.formatDate(d, 'Asia/Kolkata', 'h:mm a') : ''; }
// "10:06–10:26 PM", or "11:37 PM–12:01 AM" when the range crosses AM / PM.
function fmtSpan(a, b) {
  var x = fmtT(a), y = fmtT(b);
  return x.slice(-2) === y.slice(-2) ? x.slice(0, -3) + '–' + y : x + '–' + y;
}
function joinAnd(list) { return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
function hourLabel(h) { h = ((h % 24) + 24) % 24; return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); }
