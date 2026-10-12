# Antler sales tracker

Google Sheet: https://docs.google.com/spreadsheets/d/12428XClGvGbR1S3zpdZ9Oz1KXkng-ZSkcAxE-ZM9bVM/edit

Replaces the earlier "Dee — Antler Sales Call Tracker", which ran research through the OpenAI API.
This version uses no external API: the sheet is all formulas, and research is done by Claude.

## Tabs

| Tab | Purpose |
|---|---|
| Dashboard | Stage counts, calls and connects, overdue / due-today call list, calls by day chart |
| Leads | One row per restaurant. Teal columns are inputs, grey columns are formulas or written by Claude. Required: A Restaurant, B Stage, I Phone, M Address, O Restaurant timezone. Call pointers are in G, your notes in H |
| Calls | One row per call attempt. Restaurant, outcome and stage are dropdowns |
| Research | One row per finding, with Verified / Not verified and evidence links |
| Settings | Stages, call outcomes, timezones (with automatic US/UK daylight saving), research topics, approved Antler wording |
| Guide | How to use the sheet |

Restaurant name (Leads column A) is the key that Calls and Research look up, so names must be unique.

## Research

Research checks Google review replies, Google categories, competitors within 1 mile, Instagram and Facebook activity, and online ordering and delivery.

A lead is queued when **Research?** (column S) is ticked, or when its stage has **Research automatically** set in Settings
and it has never been researched. Claude researches queued leads:

- on request, in a Claude session ("research the queued leads"), and
- on a schedule: routine `Sales tracker research`, 08:52, 12:52 and 17:52 IST daily.

The routine prompt is in [research-routine.md](research-routine.md).

## Optional script

[Code.gs](Code.gs) is a simple `onEdit` trigger with no external calls. When a call is logged it fills the call
time if empty and copies Stage after call and Next follow-up onto the lead. It never writes to Latest notes. Install it from
Extensions > Apps Script in the sheet. Without it, update Stage and Next follow-up on Leads by hand.
