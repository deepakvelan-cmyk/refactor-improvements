/**
 * Optional helper for "Dee — Antler Sales Tracker".
 * No external APIs. Install: Extensions > Apps Script, paste this file, save.
 *
 * When a row in Calls has a Restaurant:
 *  - fills Call time (IST) with the current time if it is empty
 *  - copies "Stage after call" to Leads > Stage
 *  - copies "Next follow-up (IST)" to Leads > Next follow-up (IST)
 *  - copies Notes to Leads > Latest notes
 */
const CALLS = 'Calls';
const LEADS = 'Leads';
const CALL_COL = { time: 1, restaurant: 2, stage: 5, notes: 6, followUp: 7 };
const LEAD_COL = { restaurant: 1, stage: 2, followUp: 3, notes: 14 };

function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== CALLS || e.range.getRow() < 2) return;

  for (let r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
    syncCallRow_(sheet, r);
  }
}

function syncCallRow_(calls, row) {
  const values = calls.getRange(row, 1, 1, CALL_COL.followUp).getValues()[0];
  const restaurant = values[CALL_COL.restaurant - 1];
  if (!restaurant) return;

  if (!values[CALL_COL.time - 1]) {
    calls.getRange(row, CALL_COL.time).setValue(new Date());
  }

  // Only the latest call for a restaurant should update Leads.
  const lastRow = calls.getLastRow();
  const later = calls.getRange(row + 1, CALL_COL.restaurant, Math.max(lastRow - row, 1), 1)
    .getValues().some(v => v[0] === restaurant);
  if (later) return;

  const leads = SpreadsheetApp.getActive().getSheetByName(LEADS);
  const names = leads.getRange(2, LEAD_COL.restaurant, Math.max(leads.getLastRow() - 1, 1), 1).getValues();
  const index = names.findIndex(v => v[0] === restaurant);
  if (index < 0) return;
  const leadRow = index + 2;

  const stage = values[CALL_COL.stage - 1];
  const followUp = values[CALL_COL.followUp - 1];
  const notes = values[CALL_COL.notes - 1];
  if (stage) leads.getRange(leadRow, LEAD_COL.stage).setValue(stage);
  if (followUp) leads.getRange(leadRow, LEAD_COL.followUp).setValue(followUp);
  if (notes) leads.getRange(leadRow, LEAD_COL.notes).setValue(notes);
}
