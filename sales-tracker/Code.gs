/**
 * Script for "Dee — Antler Sales Tracker". No external APIs, no AI calls.
 * Install once: Extensions > Apps Script, replace everything with this file, save.
 *
 * 1. Paste lead tab: paste a lead message into A4. The script reads the labelled
 *    lines (Restaurant Name, Address, Number, Owner, E-mail, Website, Note, @agent),
 *    cleans them up and adds the lead to Leads, or fills in the blanks if the
 *    restaurant is already there. The result shows on the right of the tab.
 * 2. Calls tab: when a call is logged, fills the call time if it is empty and
 *    copies Stage after call and Next follow-up onto the lead.
 *    Latest notes on Leads is only ever added to, never overwritten.
 */

const SHEETS = { leads: 'Leads', calls: 'Calls', paste: 'Paste lead', settings: 'Settings' };
const TZ_IST = 'Asia/Kolkata';

// Leads columns (1-based).
const L = {
  agent: 1, restaurant: 2, stage: 3, followUp: 4, contact: 7, notes: 9, phone: 10,
  direct: 11, email: 12, website: 13, address: 14, cuisine: 15, timezone: 16, addedOn: 23,
};
// Calls columns (1-based).
const C = { time: 1, restaurant: 2, stage: 5, followUp: 7 };
// Paste lead tab layout.
const PASTE = { firstRow: 4, lastRow: 45, resultCol: 3 };

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tracker')
    .addItem('Add lead from Paste lead tab', 'processPasteBox')
    .addToUi();
}

function onEdit(e) {
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  if (name === SHEETS.paste && e.range.getColumn() === 1 && e.range.getRow() >= PASTE.firstRow) {
    processPasteBox();
  } else if (name === SHEETS.calls && e.range.getRow() >= 2) {
    for (let r = e.range.getRow(); r <= e.range.getLastRow(); r++) syncCallRow_(sheet, r);
  }
}

// ---------------------------------------------------------------------------
// Paste lead

function processPasteBox() {
  const ss = SpreadsheetApp.getActive();
  const paste = ss.getSheetByName(SHEETS.paste);
  const box = paste.getRange(PASTE.firstRow, 1, PASTE.lastRow - PASTE.firstRow + 1, 1);
  const text = box.getDisplayValues().map(r => r[0]).filter(v => v !== '').join('\n');
  if (!text.trim()) return;

  const ctx = readContext_(ss);
  const lead = parseLeadText(text, ctx);
  const result = lead.restaurant ? writeLead_(ss, lead, ctx) : { status: 'Not added: no restaurant name found' };

  showResult_(paste, result, lead);
  if (lead.restaurant) box.clearContent();
}

function readContext_(ss) {
  const s = ss.getSheetByName(SHEETS.settings);
  const now = new Date();
  const [y, m, d, dow] = Utilities.formatDate(now, TZ_IST, 'yyyy-M-d-u').split('-').map(Number);
  return {
    today: { y, m, d, dow: dow % 7 }, // dow: 0 = Sunday
    stages: s.getRange('A2:A13').getDisplayValues().map(r => r[0]).filter(String),
    tzRows: s.getRange('I2:M13').getValues()
      .filter(r => r[0]).map(r => ({ tz: String(r[0]), behind: Number(r[4]) || 0 })),
    agents: s.getRange('V2:V30').getDisplayValues().map(r => r[0]).filter(String),
    defaultStage: s.getRange('Y2').getDisplayValue(),
    defaultTime: s.getRange('Y3').getDisplayValue() || '11:00',
    defaultAgent: s.getRange('Y4').getDisplayValue(),
  };
}

function writeLead_(ss, lead, ctx) {
  const sheet = ss.getSheetByName(SHEETS.leads);
  const last = Math.max(sheet.getLastRow(), 2);
  const names = sheet.getRange(2, L.restaurant, last - 1, 1).getDisplayValues().map(r => r[0]);
  const key = lead.restaurant.trim().toLowerCase();
  let index = names.findIndex(n => n.trim().toLowerCase() === key);
  const isNew = index < 0;
  if (isNew) {
    let lastFilled = -1;
    names.forEach((n, i) => { if (n.trim()) lastFilled = i; });
    index = lastFilled + 1;
  }
  const row = index + 2;
  const today = pad_(ctx.today.d) + '/' + pad_(ctx.today.m) + '/' + ctx.today.y;

  const set = (col, value, overwrite) => {
    if (!value) return;
    const cell = sheet.getRange(row, col);
    if (overwrite || cell.getDisplayValue() === '') cell.setValue(value);
  };
  set(L.restaurant, lead.restaurant, isNew);
  set(L.agent, lead.agent, false);
  set(L.stage, lead.stage, Boolean(lead.stageFromText));
  set(L.followUp, lead.followUp, true);
  set(L.contact, lead.contact, false);
  set(L.phone, lead.phone, false);
  set(L.direct, lead.direct, false);
  set(L.email, lead.email, false);
  set(L.website, lead.website, false);
  set(L.address, lead.address, false);
  set(L.cuisine, lead.cuisine, false);
  set(L.timezone, lead.timezone, false);
  if (isNew) set(L.addedOn, today, true);
  if (lead.note) {
    const notes = sheet.getRange(row, L.notes);
    const entry = Utilities.formatDate(new Date(), TZ_IST, 'd MMM') + ': ' + lead.note;
    const old = notes.getDisplayValue();
    notes.setValue(old ? entry + '\n' + old : entry);
  }
  return { status: (isNew ? 'Added as new lead' : 'Updated existing lead') + ' in Leads row ' + row };
}

function showResult_(paste, result, lead) {
  const rows = [
    ['Status', result.status],
    ['Agent', lead.agent], ['Restaurant', lead.restaurant], ['Stage', lead.stage],
    ['Next follow-up (IST)', lead.followUp], ['Contact name', lead.contact],
    ['Phone', lead.phone], ['Direct phone', lead.direct], ['Email', lead.email],
    ['Website', lead.website], ['Address', lead.address], ['Cuisine', lead.cuisine],
    ['Restaurant timezone', lead.timezone], ['Latest notes', lead.note],
    ['Check', lead.warnings.join(' ') || 'Nothing to check'],
  ].map(r => [r[0], r[1] || '']);
  paste.getRange(PASTE.firstRow, PASTE.resultCol, rows.length, 2).setValues(rows);
}

// ---------------------------------------------------------------------------
// Parser. Pure functions, no Sheets calls, so it can be tested outside Sheets.

const STATE_TZ = {
  'America/New_York': 'CT DE DC FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV',
  'America/Chicago': 'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI',
  'America/Denver': 'CO ID MT NM UT WY',
  'America/Phoenix': 'AZ',
  'America/Los_Angeles': 'CA NV OR WA',
  'America/Anchorage': 'AK',
  'Pacific/Honolulu': 'HI',
  'America/Toronto': 'ON QC',
};
const ABBR_TZ = {
  EST: 'America/New_York', EDT: 'America/New_York', ET: 'America/New_York',
  CST: 'America/Chicago', CDT: 'America/Chicago', CT: 'America/Chicago',
  MST: 'America/Denver', MDT: 'America/Denver', MT: 'America/Denver',
  PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles', PT: 'America/Los_Angeles',
  IST: 'Asia/Kolkata',
};
const CUISINES = ['Indian', 'Nepali', 'Pakistani', 'Bangladeshi', 'Sri Lankan', 'Afghan', 'Yemeni',
  'Lebanese', 'Mediterranean', 'Middle Eastern', 'Turkish', 'Persian', 'Greek', 'Ethiopian', 'Thai',
  'Chinese', 'Japanese', 'Korean', 'Vietnamese', 'Filipino', 'Mexican', 'Italian', 'Caribbean',
  'Halal', 'Pizza', 'Burger', 'BBQ'];
const ROLES = ['owner', 'co-owner', 'manager', 'gm', 'chef', 'partner', 'director', 'staff', 'cashier'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseLeadText(text, ctx) {
  const raw = {};
  let current = null;
  text.replace(/\r/g, '').split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Za-z][A-Za-z .\/&'-]{0,40}?)\s*(?::-|:|=|-\s)\s*(.*)$/);
    const field = m && fieldFor_(m[1]);
    if (field) {
      current = field;
      raw[field] = raw[field] ? raw[field] + ' ' + m[2].trim() : m[2].trim();
    } else if (line.trim() && current === 'note') {
      raw.note += ' ' + line.trim();
    }
  });

  const warnings = [];
  // Owner name and owner number are sometimes typed into each other's line.
  if (looksLikePhone_(raw.contact) && raw.direct && !looksLikePhone_(raw.direct)) {
    [raw.contact, raw.direct] = [raw.direct, raw.contact];
    warnings.push('Owner name and number were swapped in the message; fixed.');
  }

  const lead = {
    restaurant: clean_(raw.restaurant),
    address: clean_(raw.address).replace(/^[:\s]+/, ''),
    phone: formatPhone_(raw.phone),
    direct: formatPhone_(raw.direct),
    contact: formatContact_(raw.contact),
    email: (String(raw.email || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0].toLowerCase(),
    website: (String(raw.website || '').match(/(https?:\/\/)?[\w-]+(\.[\w-]+)+[^\s]*/) || [''])[0],
    note: clean_(raw.note),
    warnings,
  };

  lead.agent = matchAgent_(raw.agent || (text.match(/@\s*([A-Za-z][A-Za-z .]{0,30})/) || [])[1], ctx, warnings);
  const stage = ctx.stages.find(s => s.toLowerCase() === clean_(raw.stage).toLowerCase());
  lead.stage = stage || ctx.defaultStage;
  lead.stageFromText = Boolean(stage);
  lead.timezone = timezoneFor_(lead.address);
  lead.cuisine = clean_(raw.cuisine) || findCuisine_(lead.restaurant) || findCuisine_(lead.note);
  lead.followUp = followUpIst_(raw.followup || lead.note, lead.timezone, ctx, warnings);

  if (!lead.restaurant) warnings.push('No restaurant name found.');
  if (!lead.phone) warnings.push('No restaurant phone found.');
  if (!lead.address) warnings.push('No address found.');
  if (lead.address && !lead.timezone) warnings.push('Could not tell the timezone from the address; pick it on Leads.');
  return lead;
}

function fieldFor_(label) {
  const l = label.toLowerCase().trim();
  if (/escalat|agent|assigned|caller|\brep\b/.test(l)) return 'agent';
  if (/e-?\s?mail/.test(l)) return 'email';
  if (/web|site|url/.test(l)) return 'website';
  if (/address|location/.test(l)) return 'address';
  if (/cuisine/.test(l)) return 'cuisine';
  if (/follow.?up|call.?back|next call/.test(l)) return 'followup';
  if (/note|comment|remark|summary/.test(l)) return 'note';
  if (/stage|status/.test(l)) return 'stage';
  if (/number|phone|tel|mobile|cell|contact no/.test(l)) {
    return /owner|direct|manager|personal|decision/.test(l) ? 'direct' : 'phone';
  }
  if (/owner|contact|manager|decision|poc/.test(l)) return 'contact';
  if (/restaurant|business|^name$/.test(l)) return 'restaurant';
  return null;
}

function clean_(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function pad_(n) { return (n < 10 ? '0' : '') + n; }

function looksLikePhone_(v) {
  const s = String(v || '');
  return s.replace(/\D/g, '').length >= 7 && s.replace(/[^A-Za-z]/g, '').length <= 3;
}

function formatPhone_(v) {
  const s = clean_(v);
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length === 10) return "'+1 " + d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return s ? "'" + s : '';
}

function formatContact_(v) {
  const s = clean_(v);
  if (!s) return '';
  return s.split(/[\[\]();,\/]|\band\b/i).map(part => {
    const words = part.replace(/\s-\s|\s-|-\s/g, ' ').trim().split(/\s+/).filter(Boolean);
    const roles = words.filter(w => ROLES.includes(w.toLowerCase()));
    const name = words.filter(w => !ROLES.includes(w.toLowerCase())).join(' ');
    if (!name && !roles.length) return '';
    return roles.length ? name + ' (' + roles.map(r => r[0].toUpperCase() + r.slice(1)).join(', ') + ')' : name;
  }).filter(Boolean).join('; ');
}

function matchAgent_(value, ctx, warnings) {
  const v = clean_(value).replace(/^@/, '');
  if (!v) return ctx.defaultAgent;
  const lower = v.toLowerCase();
  const hit = ctx.agents.find(a => a.toLowerCase() === lower)
    || ctx.agents.find(a => a.toLowerCase().split(' ')[0] === lower.split(' ')[0]);
  if (hit) return hit;
  warnings.push('Agent "' + v + '" is not in the Settings agent list; add it there.');
  return v;
}

function timezoneFor_(address) {
  const m = String(address || '').match(/\b([A-Z]{2})\s*\d{5}\b/) || String(address || '').match(/,\s*([A-Z]{2})\s*(,|$)/);
  if (!m) return '';
  return Object.keys(STATE_TZ).find(tz => STATE_TZ[tz].split(' ').includes(m[1])) || '';
}

function findCuisine_(text) {
  const t = String(text || '').toLowerCase();
  return CUISINES.find(c => new RegExp('\\b' + c.toLowerCase() + '\\b').test(t)) || '';
}

/** Returns "dd/mm/yyyy hh:mm" in IST, or '' when no call-back date is in the text. */
function followUpIst_(text, tz, ctx, warnings) {
  const t = String(text || '').toLowerCase();
  const { y, m, d, dow } = ctx.today;
  const base = Date.UTC(y, m - 1, d);
  const DAY = 86400000;
  let date = null;

  const monthFirst = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(st|nd|rd|th)?\b/);
  const dayFirst = t.match(/\b(\d{1,2})(st|nd|rd|th)?\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  const ordinal = t.match(/\b(\d{1,2})(st|nd|rd|th)\b/);
  const weekday = t.match(/\b(sun|mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?)(day)?\b/);

  if (monthFirst || dayFirst) {
    const mon = MONTHS.indexOf((monthFirst ? monthFirst[1] : dayFirst[4]).slice(0, 3));
    const day = Number(monthFirst ? monthFirst[2] : dayFirst[1]);
    date = Date.UTC(y, mon, day);
    if (date < base) date = Date.UTC(y + 1, mon, day);
  } else if (ordinal) {
    const day = Number(ordinal[1]);
    date = Date.UTC(y, m - 1, day);
    if (day < d) date = Date.UTC(y, m, day);
  } else if (/\btomorrow\b/.test(t)) {
    date = base + DAY;
  } else if (weekday) {
    const target = DAYS.indexOf(weekday[1].slice(0, 3));
    date = base + (((target - dow + 7) % 7) || 7) * DAY;
  } else if (/\btoday\b/.test(t)) {
    date = base;
  }
  if (date === null) return '';

  if (weekday && (monthFirst || dayFirst || ordinal)) {
    const target = DAYS.indexOf(weekday[1].slice(0, 3));
    if (new Date(date).getUTCDay() !== target) {
      warnings.push('The message names a weekday that does not match the date; check the follow-up.');
    }
  }

  let hour, minute, zone = tz;
  const time = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b(?:\s*(est|edt|et|cst|cdt|ct|mst|mdt|mt|pst|pdt|pt|ist)\b)?/);
  if (time) {
    hour = Number(time[1]) % 12 + (time[3] === 'pm' ? 12 : 0);
    minute = Number(time[2] || 0);
    if (time[4]) zone = ABBR_TZ[time[4].toUpperCase()];
  } else {
    [hour, minute] = String(ctx.defaultTime).split(':').map(Number);
    warnings.push('No call-back time in the message; used the default ' + ctx.defaultTime + ' restaurant time.');
  }

  const row = ctx.tzRows.find(r => r.tz === zone);
  const behind = zone === TZ_IST ? 0 : (row ? row.behind : 0);
  if (!row && zone !== TZ_IST) warnings.push('Unknown timezone, so the follow-up time was saved as IST; check it.');
  const ist = new Date(date + (hour * 60 + minute) * 60000 + behind * 3600000);
  return pad_(ist.getUTCDate()) + '/' + pad_(ist.getUTCMonth() + 1) + '/' + ist.getUTCFullYear()
    + ' ' + pad_(ist.getUTCHours()) + ':' + pad_(ist.getUTCMinutes());
}

// ---------------------------------------------------------------------------
// Calls sync

function syncCallRow_(calls, row) {
  const values = calls.getRange(row, 1, 1, C.followUp).getValues()[0];
  const restaurant = values[C.restaurant - 1];
  if (!restaurant) return;

  if (!values[C.time - 1]) calls.getRange(row, C.time).setValue(new Date());

  // Only the latest call for a restaurant should update Leads.
  const lastRow = calls.getLastRow();
  const later = calls.getRange(row + 1, C.restaurant, Math.max(lastRow - row, 1), 1)
    .getValues().some(v => v[0] === restaurant);
  if (later) return;

  const leads = SpreadsheetApp.getActive().getSheetByName(SHEETS.leads);
  const names = leads.getRange(2, L.restaurant, Math.max(leads.getLastRow() - 1, 1), 1).getValues();
  const index = names.findIndex(v => v[0] === restaurant);
  if (index < 0) return;
  const leadRow = index + 2;

  const stage = values[C.stage - 1];
  const followUp = values[C.followUp - 1];
  if (stage) leads.getRange(leadRow, L.stage).setValue(stage);
  if (followUp) leads.getRange(leadRow, L.followUp).setValue(followUp);
}

if (typeof module !== 'undefined') module.exports = { parseLeadText };
