# Antler sales tracker

Google Sheet: https://docs.google.com/spreadsheets/d/12428XClGvGbR1S3zpdZ9Oz1KXkng-ZSkcAxE-ZM9bVM/edit

Replaces the earlier "Dee — Antler Sales Call Tracker", which ran research through the OpenAI API.
This version uses no external API: the sheet is all formulas, and research is done by Claude.

## Tabs

| Tab | Purpose |
|---|---|
| Dashboard | Stage counts, calls and connects, overdue / due-today call list, calls by day chart |
| Paste lead | Paste a lead message into A4; the script adds it to Leads |
| Leads | One row per restaurant. Teal columns are inputs, grey columns are formulas or written by Claude. Required: A Agent, B Restaurant, C Stage, J Phone, N Address, P Restaurant timezone. Call pointers are in H, your notes in I |
| Calls | One row per call attempt. Restaurant, outcome and stage are dropdowns |
| Research | One row per finding, with Verified / Not verified and evidence links |
| Settings | Agents (column V), pasted-lead defaults (X:Y), stages, call outcomes, timezones (with automatic US/UK daylight saving), research topics, approved Antler wording |
| Guide | How to use the sheet |

Restaurant name (Leads column B) is the key that Calls and Research look up, so names must be unique.

## Research

Research checks Google review replies, Google categories, competitors within 1 mile, Instagram and Facebook activity, and online ordering and delivery.

A lead is queued when **Research?** (column T) is ticked, or when its stage has **Research automatically** set in Settings
and it has never been researched. Claude researches queued leads:

- on request, in a Claude session ("research the queued leads"), and
- on a schedule: routine `Sales tracker research`, 08:52, 12:52 and 17:52 IST daily.

The routine prompt is in [research-routine.md](research-routine.md).

## Script

[Code.gs](Code.gs) uses simple `onEdit` / `onOpen` triggers, with no external calls and no AI. Install it from
Extensions > Apps Script in the sheet.

- **Paste lead parser.** Paste a lead message into Paste lead!A4. It reads labelled lines (agent `@name`,
  restaurant name, address, restaurant number, owner name and number, email, website, note), formats phone
  numbers, fixes owner name and number typed into each other's line, sets the timezone from the US state in the
  address and the follow-up from dates in the note ("Thursday, the 15th", "Oct 15", "tomorrow 3pm CST"). New
  restaurants are added; existing ones only get blank cells filled and the note added on top of Latest notes.
- **Call sync.** When a call is logged it fills the call time if empty and copies Stage after call and Next
  follow-up onto the lead.

The parser is plain JavaScript and can be tested with Node: `require('./Code.gs')` after copying it to a `.js` file.
