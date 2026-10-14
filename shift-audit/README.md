# Shift Call Audit

Apps Script bound to the **Shift Call Audit Report** sheet. Paste both files into the sheet's
Extensions → Apps Script project (one script file each, same names), save, and reload the sheet.

| File | What it does |
|---|---|
| `Code.gs` | Reads the OpenPhone dialer and the agents' Call Trackers, writes the Report / Comparison / Dialer / Tracker / Daily / Exceptions tabs, menu, schedule |
| `Screenshots.gs` | Builds the three screenshots from each run's data and lists them on the Screenshots tab |

## Screenshots

Saved to `<project folder>/Shift Call Audit Screenshots/<yyyy-MM>/` on every scheduled run (11 PM, 1, 3, 7 AM IST)
and by **Shift Audit → Take screenshot now** (re-runs the Controls report first).

| Name | Layout | Files |
|---|---|---|
| Full | Web report: KPI tiles, Agent Scorecard with notes, Hourly Call Trend | JPG + PDF |
| Mobile | Phone scorecard: KPI tiles, scorecard with a notes row under each agent | JPG |
| Idle | Idle Time & Call Gaps: each gap > 20 min as a chip (red idle, blue tracker updated, orange dialer only) | JPG |

Each page is HTML sized to its content, converted to PDF by Apps Script; Drive renders the image from the PDF.
Drive's PDF images are always 1024 px wide, so Full is laid out exactly 1024 px wide (1:1, no shrinking) and
Mobile / Idle come out at about 2× / 1.4× their layout size. The PDF is vector and stays sharp at any zoom.
If an image can't be made, that page's PDF is kept and linked instead.

After updating from the earlier version, run **Shift Audit → Rebuild screenshot list** once: the Screenshots tab
columns changed (`Mobile — PDF` became `Idle — Image`).
