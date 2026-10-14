/**
 * Screenshots — three images built from the run's data (not from the Report tab):
 *   Full   – web / desktop report: KPI tiles, Agent Scorecard with notes, Hourly Call Trend  (JPG + PDF)
 *   Mobile – phone scorecard: KPI tiles, compact scorecard with a notes row under each agent    (JPG)
 *   Idle   – Idle Time & Call Gaps: every gap > GAP_MIN min as a coloured chip per agent       (JPG)
 * Each page is HTML sized to its content, converted to PDF by Apps Script, and Drive renders the image
 * from that PDF, always 1024 px wide: Full is laid out 1024 px wide so it is not shrunk, Mobile (500) and
 * Idle (720) come out sharper than 1:1. The Mobile and Idle PDFs are only kept when the image could not be made.
 */

var SHOT_COLORS = {
  text: '#1f2937', muted: '#555555', faint: '#777777', repBg: '#fdebd0',
  chip: {idle: ['#fde7e4', '#f4b6ae', '#c5221f'], trk: ['#e8f0fe', '#c6dafc', '#2b5fb4'], dialer: ['#fff3e0', '#f9cb8f', '#b45f06']}
};

// Everything the three pages need from one run.
function shotModel(agents, combined, fromKey, toKey, now) {
  var lastSlotEnd = CONFIG.SLOTS[CONFIG.SLOTS.length - 1][2];
  return {
    combined: combined, T: combined.TOTAL, fromKey: fromKey, toKey: toKey, now: now,
    active: agents.filter(function (a) { return !isAbsent(combined[a]); })
      .sort(function (p, q) { return combined[q].dialed - combined[p].dialed || p.localeCompare(q); }),
    absent: agents.filter(function (a) { return isAbsent(combined[a]); }),
    live: keyInstant(toKey, 24 * 60 + CONFIG.SHIFT_END) > now,
    done: keyInstant(toKey, lastSlotEnd) <= now,     // work slots over: absent agents are "Absent", not "No activity yet"
    multi: fromKey !== toKey,
    range: rangeLabel(fromKey, toKey),
    run: 'Run ' + Utilities.formatDate(now, 'Asia/Kolkata', 'd MMM HH:mm') + ' IST'
  };
}

// Saves the three screenshots into <project folder>/<SCREENSHOT_FOLDER>/<yyyy-MM>/ and lists them on the Screenshots tab.
function screenshotReport(kind, md) {
  var now = new Date();
  var month = monthFolder(now);
  var stamp = Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd HH-mm-ss') + ' IST';
  var T = md.T;
  var info = {taken: now.getTime(), shift: md.range, kind: kind,
              kpi: [String(T.dialed), T.conn + ' (' + pct(T.conn, T.dialed) + ')', String(T.entries), logPctOf(T),
                    String(T.gapsNoAct), md.done ? String(md.absent.length) : '–']};
  var desc = JSON.stringify(info), links = {};
  var pages = [shotFull(md), shotMobile(md), shotIdle(md)];
  // All PDFs first, so Drive renders their previews in parallel.
  pages.forEach(function (p) {
    p.file = month.createFile(renderPdf(p.html, p.w, p.h).setName(stamp + ' · ' + p.name + '.pdf')).setDescription(desc);
  });
  pages.forEach(function (p) {
    var img = pdfToImage(p.file.getId());
    if (img) links[p.name + 'Img'] = month.createFile(img.blob.setName(stamp + ' · ' + p.name + '.' + img.ext)).setDescription(desc).getUrl();
    if (p.keepPdf || !img) links[p.name + 'Pdf'] = p.file.getUrl();
    else p.file.setTrashed(true);
  });
  var sh = screenshotsSheet();
  sh.insertRowAfter(1);
  writeShotRows(sh, 2, [shotRow(info, links, month.getUrl(), month.getName())]);
}

// HTML → one-page PDF of w × h CSS px. If the content spilled onto a 2nd page, retries with a taller page.
function renderPdf(body, w, h) {
  var pdf;
  for (var i = 0; i < 4; i++) {
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:' + (w / 96).toFixed(2) + 'in ' +
               (h / 96).toFixed(2) + 'in;margin:0}' + SHOT_CSS + 'body{width:' + w + 'px}</style></head><body>' + body + '</body></html>';
    pdf = HtmlService.createHtmlOutput(html).getAs(MimeType.PDF);
    if (pdfPageCount(pdf) <= 1) return pdf;
    h = Math.round(h * 1.15);
  }
  return pdf;
}

function pdfPageCount(blob) {
  var m = blob.getDataAsString('ISO-8859-1').match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 1;
}

var SHOT_CSS = [
  // The PDF converter prints like a browser and drops background colours unless told to keep them.
  '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}',
  'body{margin:0;padding:16px;background:#ffffff;color:' + SHOT_COLORS.text + ';font-family:Arial,Helvetica,sans-serif;font-size:13px}',
  'table{border-collapse:collapse}',
  '.hd{width:100%;background:' + STYLE.title + ';color:#ffffff}',
  '.hd td{padding:12px 18px;vertical-align:middle}',
  '.hd .t{font-size:22px;font-weight:bold}',
  '.hd .r{text-align:right;font-size:13px;white-space:nowrap}',
  '.sub{color:' + SHOT_COLORS.muted + ';font-style:italic;font-size:12px;margin:6px 2px 10px}',
  '.tiles{width:100%;border-collapse:separate;border-spacing:6px 6px;margin:0 -6px}',
  '.tile{border:1px solid ' + STYLE.border + ';padding:0;text-align:center;vertical-align:top}',
  '.tile .l{background:' + STYLE.kpiLabel + ';color:' + STYLE.title + ';font-weight:bold;font-size:12px;padding:5px 2px}',
  '.tile .v{color:' + STYLE.header + ';font-weight:bold;font-size:20px;padding:8px 2px}',
  'h2{color:' + STYLE.title + ';font-size:16px;margin:12px 0 6px}',
  '.grid{width:100%;table-layout:fixed}',
  '.grid th{background:' + STYLE.header + ';color:#ffffff;font-weight:bold;font-size:12px;padding:6px 3px;border:1px solid ' + STYLE.border + '}',
  '.grid td{border:1px solid ' + STYLE.border + ';padding:4px 5px;text-align:center;vertical-align:middle}',
  '.grid td.a{text-align:left;font-weight:bold}',
  '.grid td.n{text-align:left;vertical-align:middle;line-height:17px}',
  '.grid tr.band td{background:' + STYLE.band + '}',
  '.grid tr.tot td{background:' + STYLE.total + ';font-weight:bold}',
  '.grid tr.abs td{background:' + STYLE.absent + ';color:' + SHOT_COLORS.faint + '}',
  '.s{font-size:10.5px;color:' + SHOT_COLORS.faint + '}',
  '.bars{margin:0 auto;border-collapse:collapse}',
  '.grid .bars td{border:0;padding:0 1px;vertical-align:bottom;height:24px}',
  '.chip{display:inline-block;border:1px solid;border-radius:12px;padding:3px 12px;margin:3px 0;font-size:12.5px;white-space:nowrap}',
  '.foot{color:' + SHOT_COLORS.muted + ';font-style:italic;font-size:11px;margin-top:8px;line-height:16px}',
  // Full layout: larger text, since its image cannot be wider than 1024 px.
  '.fx .grid td{font-size:14.5px}',
  '.fx .grid th{font-size:13px}',
  '.fx .s{font-size:12px}',
  '.fx .sub{font-size:13px}',
  '.fx .tile .l{font-size:13px}',
  '.fx h2{font-size:17px}',
  '.fx .foot{font-size:12px}'
].join('');

// ---------- Full (web) ----------
function shotFull(md) {
  var T = md.T, rowsH = 0, W = 1024;   // = Drive's preview width, so the image is 1:1
  var head = shotHeader('NIGHT SHIFT REPORT — ' + md.range, md.run) +
    shotSub(md, ' · Idle time & gaps: separate screenshot') +
    shotTiles(shotKpis(md), 8, 17);
  var cols = [['Agent', 104], ['Calls', 46], ['Connected', 90], ['On-call min', 56], ['Talk min', 50], ['Tracker', 58],
              ['Log %', 50], ['Repeat dials', 60], ['Status', 104], ['Notes / Observations', 0]];
  var rows = md.active.map(function (a, i) {
    var m = md.combined[a], notes = noteTexts(m, md.multi);
    var lines = notes.reduce(function (s, t) { return s + Math.max(1, Math.ceil(t.length / 48)); }, 0);
    var h = Math.max(48, lines * 20 + 12);
    rowsH += h;
    var flagged = isFlagged(m);
    return '<tr class="' + (i % 2 ? 'band' : '') + '" style="height:' + h + 'px">' +
      '<td class="a">' + esc(a) + '</td><td>' + fmtInt(m.dialed) + '</td>' +
      '<td>' + fmtInt(m.conn) + ' <span class="s">(' + pct(m.conn, m.dialed) + ')</span></td>' +
      td(fmtDur(m.durSec)) + td(fmtDur(m.talkSec)) + td(m.isTracker ? fmtInt(m.entries) : '–') +
      logCell(m) + repCell(m) +
      '<td style="color:' + statusColor(scoreStatus(a, m, !md.done)) + ';font-weight:bold;font-size:13.5px">' + esc(scoreStatus(a, m, !md.done)) + '</td>' +
      '<td class="n" style="font-size:14px;line-height:20px' + (flagged ? ';background:' + STYLE.flagBg : '') + '">' +
      notes.map(function (t) { return esc(t); }).join('<br>') + '</td></tr>';
  });
  rows.push('<tr class="tot" style="height:30px"><td class="a">TOTAL</td><td>' + fmtInt(T.dialed) + '</td><td>' + fmtInt(T.conn) +
    ' <span class="s">(' + pct(T.conn, T.dialed) + ')</span></td>' + td(fmtDur(T.durSec)) + td(fmtDur(T.talkSec)) +
    td(fmtInt(T.entries)) + logCell(T) + td(fmtInt(T.extra)) + '<td></td><td></td></tr>');
  md.absent.forEach(function (a) {
    var m = md.combined[a];
    rows.push('<tr class="abs" style="height:30px"><td class="a">' + esc(a) + '</td><td>0</td><td>0</td><td>–</td><td>–</td>' +
      td(m.isTracker ? '0' : '–') + '<td>–</td><td>0</td><td style="font-weight:bold">' + esc(scoreStatus(a, m, !md.done)) + '</td>' +
      '<td class="n">' + esc(absentNote(md)) + '</td></tr>');
  });
  var score = '<h2>1. Agent Scorecard</h2>' + gridTable(cols, rows);

  // Hourly trend: calls over minutes on call; red = extreme decline.
  var hl = hourLabels();
  var hcols = [['Agent', 104]].concat(hl.map(function (h) { return [h, 0]; })).concat([['Trend', 96], ['Direction', 176]]);
  var hrows = md.active.concat(['TOTAL']).map(function (a, i) {
    var m = a === 'TOTAL' ? T : md.combined[a], tr = hourlyTrend(m);
    var cells = m.hCalls.map(function (c, h) {
      if (!m.hWork[h]) return '<td></td>';
      var red = tr.red[h], col = red ? STYLE.red : '';
      return '<td style="' + (red ? 'color:' + col + ';font-weight:bold' : '') + '">' + c +
        '<div class="s"' + (red ? ' style="color:' + col + ';font-weight:bold"' : '') + '>' + Math.round(m.hDurSec[h] / 60) + ' min</div></td>';
    }).join('');
    return '<tr class="' + (a === 'TOTAL' ? 'tot' : i % 2 ? 'band' : '') + '" style="height:50px"><td class="a">' + esc(a) + '</td>' +
      cells + '<td>' + trendBars(m, tr.red) + '</td>' +
      '<td style="color:' + tr.color + ';font-weight:bold;font-size:13.5px">' + esc(tr.label) + '</td></tr>';
  });
  var hourly = '<h2>2. Hourly Call Trend — calls per hour (minutes on call)</h2>' + gridTable(hcols, hrows);

  var foot = '<div class="foot">Durations in minutes · Red bars/hours = extreme decline (below ' + CONFIG.DECLINE_PCT +
    '% of the agent\'s peak, after the peak) · Direction compares 1st vs 2nd half of the shift and the last hour (breaks excluded) · ' +
    'Pink notes = idle &gt; ' + CONFIG.GAP_MIN + ' min, no calls and no tracker</div>';
  var h = 32 + 50 + 30 + 76 + (36 + 40 + rowsH + 34 + 34 * md.absent.length) + (36 + 40 + 50 * (md.active.length + 1)) + 60 + 24;
  // Full is capped at 1024 px wide by Drive, so its text is set larger (class "fx") to stay readable.
  return {name: 'Full', keepPdf: true, w: W, h: h, html: '<div class="fx">' + head + score + hourly + foot + '</div>'};
}

// ---------- Mobile ----------
function shotMobile(md) {
  var T = md.T, rowsH = 0, W = 500;
  var head = shotHeader('NIGHT SHIFT · ' + md.range, md.run) + shotSub(md, '') + shotTiles(shotKpis(md), 4);
  var cols = [['Agent', 84], ['Calls', 42], ['Conn.', 50], ['On-call min', 44], ['Talk min', 42], ['Log %', 44], ['Rpt dials', 42], ['Status', 0]];
  var rows = [];
  md.active.forEach(function (a, i) {
    var m = md.combined[a], st = scoreStatus(a, m, !md.done), notes = noteTexts(m, md.multi);
    var len = notes.join(' · ').length, nh = Math.ceil(len / 56) * 19 + 14;
    rowsH += 54 + nh;
    rows.push('<tr class="' + (i % 2 ? 'band' : '') + '" style="height:54px"><td class="a">' + esc(a) + '</td>' +
      td(fmtInt(m.dialed)) + '<td>' + fmtInt(m.conn) + '<div class="s">' + pct(m.conn, m.dialed) + '</div></td>' +
      td(fmtDur(m.durSec)) + td(fmtDur(m.talkSec)) + logCell(m) + repCell(m) +
      '<td style="color:' + statusColor(st) + ';font-weight:bold;font-size:12px">' + esc(shortStatus(st)) + '</td></tr>');
    rows.push('<tr><td colspan="8" class="n" style="padding:7px 10px;line-height:19px' + (isFlagged(m) ? ';background:' + STYLE.flagBg : '') + '">' +
      notes.map(function (t) {
        return /^⚠/.test(t) ? '<span style="color:' + STYLE.red + ';font-weight:bold">' + esc(t) + '</span>' : esc(t);
      }).join(' · ') + '</td></tr>');
  });
  rows.push('<tr class="tot" style="height:54px"><td class="a">TOTAL</td>' + td(fmtInt(T.dialed)) + '<td>' + fmtInt(T.conn) +
    '<div class="s">' + pct(T.conn, T.dialed) + '</div></td>' + td(fmtDur(T.durSec)) + td(fmtDur(T.talkSec)) + logCell(T) +
    td(fmtInt(T.extra)) + '<td></td></tr>');
  md.absent.forEach(function (a) {
    rows.push('<tr class="abs" style="height:36px"><td class="a">' + esc(a) + '</td><td>0</td><td>0</td><td>–</td><td>–</td><td>–</td><td>0</td>' +
      '<td style="font-weight:bold">' + esc(scoreStatus(a, md.combined[a], !md.done)) + '</td></tr>' +
      '<tr><td colspan="8" class="n" style="padding:7px 10px">' + esc(absentNote(md)) + '</td></tr>');
  });
  var foot = '<div class="foot">Durations in minutes · On-call = dialing + ringing + talking · Repeat dials = extra dials to numbers ' +
    'already called · Pink = idle &gt; ' + CONFIG.GAP_MIN + ' min (no calls, no tracker) · Orange = check · Green OK · Blue dialer only · Grey absent</div>';
  var h = 32 + 46 + 28 + 140 + 36 + 46 + rowsH + 54 + 72 * md.absent.length + 80 + 24;
  return {name: 'Mobile', w: W, h: h, html: head + '<h2>Agent Scorecard</h2>' + gridTable(cols, rows) + foot};
}

// ---------- Idle Time & Call Gaps ----------
function shotIdle(md) {
  var T = md.T, rowsH = 0, W = 720;
  var head = shotHeader('NIGHT SHIFT · ' + md.range, md.run) +
    '<div class="sub">Gaps longer than ' + CONFIG.GAP_MIN + ' minutes inside working slots · sorted by idle minutes' +
    (md.live && !md.done ? ' · shift in progress' : '') + '</div>';
  var dialerOnly = function (a) { return !md.combined[a].isTracker; };
  var list = md.active.slice().sort(function (p, q) {
    var mp = md.combined[p], mq = md.combined[q];
    return mq.idleMin - mp.idleMin || dialerOnly(q) - dialerOnly(p) || p.localeCompare(q);
  });
  var order = {idle: 0, dialer: 1, trk: 2};
  var rows = list.map(function (a, i) {
    var m = md.combined[a];
    var gl = m.gapList.slice().sort(function (p, q) { return order[p.kind] - order[q.kind] || q.mins - p.mins; });
    var h = Math.max(52, gl.length * 34 + 12);
    rowsH += h;
    var st = dialerOnly(a) ? (m.gaps ? 'Dialer only · check' : 'Dialer only') : activityStatus(a, m, !md.done);
    return '<tr class="' + (i % 2 ? 'band' : '') + '" style="height:' + h + 'px"><td class="a" style="font-size:14px">' + esc(a) + '</td>' +
      '<td style="text-align:left;padding:5px 10px">' + (gl.length ? gl.map(function (g) {
        return '<span class="chip" style="' + chipStyle(g.kind) + '">' + (md.multi ? keyToDmy(g.d).slice(0, 5) + ' ' : '') +
          esc(fmtSpan(g.from, g.to)) + ' · ' + g.mins + 'm</span>';
      }).join('<br>') : '<span class="s">No gaps</span>') + '</td>' +
      '<td style="font-size:15px;font-weight:bold' + (m.idleMin ? ';color:' + STYLE.red : '') + '">' + (m.isTracker ? m.idleMin : '–') + '</td>' +
      '<td style="color:' + statusColor(st) + ';font-weight:bold">' + esc(st) + '</td></tr>';
  });
  var dial = T.gaps - T.gapsNoAct - T.gapsWithAct;
  rows.push('<tr class="tot" style="height:64px"><td class="a">TOTAL</td><td style="text-align:left;padding:5px 10px">' +
    pl(T.gaps, 'gap') + ' · ' + T.gapsNoAct + ' idle (no activity) · ' + T.gapsWithAct + ' with tracker updates' +
    (dial ? ' · ' + dial + ' dialer-only' : '') + '</td><td style="font-size:15px">' + T.idleMin + '</td><td></td></tr>');
  var cols = [['Agent', 150], ['Gaps &gt; ' + CONFIG.GAP_MIN + ' min (when · minutes)', 0], ['Idle min', 70], ['Status', 160]];
  var legend = '<div class="foot" style="line-height:30px">' +
    '<span class="chip" style="' + chipStyle('idle') + ';font-style:italic">red</span> idle — no calls and no tracker activity &nbsp; ' +
    '<span class="chip" style="' + chipStyle('trk') + ';font-style:italic">blue</span> no calls but tracker was updated &nbsp; ' +
    '<span class="chip" style="' + chipStyle('dialer') + ';font-style:italic">orange</span> dialer only, tracker not checked. ' +
    'Time on a call is never counted as idle. Breaks (11:00–11:20 PM, 1:00–1:30 AM, 3:00–3:20 AM) excluded.</div>';
  var h = 32 + 50 + 30 + 36 + 46 + rowsH + 64 + 100 + 24;
  return {name: 'Idle', w: W, h: h, html: head + '<h2>Idle Time &amp; Call Gaps</h2>' + gridTable(cols, rows) + legend};
}

// ---------- Building blocks ----------
function shotHeader(title, run) {
  return '<table class="hd"><tr><td class="t">' + esc(title) + '</td><td class="r">' + esc(run) + '</td></tr></table>';
}

function shotSub(md, extra) {
  return '<div class="sub">Excluded: ' + esc(CONFIG.EXCLUDE_AGENTS.join(', ')) +
    CONFIG.DIALER_ONLY.map(function (a) { return ' · ' + esc(a) + ': dialer only'; }).join('') +
    (md.live && !md.done ? ' · Shift in progress' : '') + esc(extra) + '</div>';
}

function shotKpis(md) {
  var T = md.T;
  return [['Calls Dialed', fmtInt(T.dialed)], ['Connected', fmtInt(T.conn) + ' · ' + pct(T.conn, T.dialed)],
          ['On-call', fmtDur(T.durSec) + ' min'], ['Talk', fmtDur(T.talkSec) + ' min'], ['Tracker Entries', fmtInt(T.entries)],
          ['Logging', logPctOf(T)], ['Repeat Dials', fmtInt(T.extra)],
          ['Idle &gt; ' + CONFIG.GAP_MIN + ' min', '<span style="color:' + STYLE.red + '">' + T.gapsNoAct + '</span>', true]];
}

// KPI tiles, perRow per line, value font size px (default 20). Values marked raw (3rd item) are already HTML.
function shotTiles(kpis, perRow, size) {
  var out = '<table class="tiles">';
  for (var i = 0; i < kpis.length; i += perRow) {
    out += '<tr>' + kpis.slice(i, i + perRow).map(function (k) {
      return '<td class="tile" style="width:' + Math.floor(100 / perRow) + '%"><div class="l">' + k[0] + '</div><div class="v"' +
        (size ? ' style="font-size:' + size + 'px"' : '') + '>' + (k[2] ? k[1] : esc(k[1])) + '</div></td>';
    }).join('') + '</tr>';
  }
  return out + '</table>';
}

// cols: [[label (HTML), width px or 0 = share the rest]]
function gridTable(cols, rows) {
  return '<table class="grid"><colgroup>' + cols.map(function (c) { return c[1] ? '<col style="width:' + c[1] + 'px">' : '<col>'; }).join('') +
    '</colgroup><tr>' + cols.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('') + '</tr>' + rows.join('') + '</table>';
}

function td(v) { return '<td>' + esc(v) + '</td>'; }

function logCell(m) {
  var v = logPctOf(m), n = parseInt(v, 10);
  if (isNaN(n)) return '<td>–</td>';
  return '<td style="font-weight:bold;color:' + (n >= 90 ? STYLE.green : n >= 70 ? STYLE.amber : STYLE.red) + '">' + v + '</td>';
}

function repCell(m) {
  var flag = m.extra >= CONFIG.REPEAT_DIAL_FLAG || m.noConnRepeat;
  return '<td style="' + (flag ? 'background:' + SHOT_COLORS.repBg + ';color:' + STYLE.amber + ';font-weight:bold' : '') + '">' +
    fmtInt(m.extra) + '</td>';
}

function trendBars(m, red) {
  var max = Math.max.apply(null, m.hCalls.concat([1]));
  var cells = m.hCalls.map(function (c, h) {
    if (!m.hWork[h]) return '';
    var ht = c ? Math.max(3, Math.round(c / max * 22)) : 2;
    var col = !c ? '#9aa5b8' : red[h] ? STYLE.red : STYLE.header;
    return '<td><div style="width:7px;height:' + ht + 'px;background:' + col + '"></div></td>';
  }).join('');
  return cells ? '<table class="bars"><tr>' + cells + '</tr></table>' : '';
}

function chipStyle(kind) {
  var c = SHOT_COLORS.chip[kind];
  return 'background:' + c[0] + ';border-color:' + c[1] + ';color:' + c[2] + (kind === 'trk' ? '' : ';font-weight:bold');
}

function noteTexts(m, multi) {
  var list = m.notes.map(function (n) { return (multi ? '[' + keyToDmy(n.d).slice(0, 5) + '] ' : '') + n.t; });
  return list.length ? list : ['—'];
}

function isFlagged(m) { return m.gapsNoAct > 0 || (!m.isTracker && m.gaps > 0); }

function absentNote(md) { return md.done ? 'No calls, no tracker entries all shift' : 'No calls or tracker entries yet'; }

function shortStatus(s) {
  return String(s).replace('Dialer only · check inactivity', 'Dialer only · idle')
    .replace('logging', 'log').replace('inactivity', 'idle');
}


function logPctOf(m) { return m.isTracker && m.trkUniq ? Math.round(m.matched / m.trkUniq * 100) + '%' : '–'; }

function fmtInt(n) { return String(n == null ? '' : n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
