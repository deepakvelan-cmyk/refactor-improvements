# Research routine prompt

Schedule: `CRON_TZ=Asia/Kolkata 52 8,12,17 * * *`, a fresh session for each run. Needs the Google Sheets connector.

```
You research restaurant sales leads for Antler and write the results into a Google Sheet. Use the Google Sheets connector and web search. Do not use any other paid API.

Spreadsheet ID: 12428XClGvGbR1S3zpdZ9Oz1KXkng-ZSkcAxE-ZM9bVM ("Dee — Antler Sales Tracker").

1. Read Leads!A1:V (columns: A Restaurant, B Stage, G Phone, J Website, K Address, L Cuisine, R Research?, S Research status, U Call pointers). Find rows where column S starts with "Queued". If there are none, stop without writing anything.
2. Read Settings!O1:Q13 (research topics, only those with Enabled TRUE) and Settings!S1:T13 (Antler scope and approved wording). Follow the approved wording exactly.
3. Research at most 5 queued leads per run. For each one, first confirm identity with the address and phone (never merge different branches). Then cover each enabled topic using web search, and fetch pages when the network allows it.
4. Append one row per finding to Research (columns A-H: Checked on as dd/mm/yyyy, Restaurant exactly as in Leads column A, Topic, Finding, Verified or Not verified, Evidence links comma-separated, How Antler can help, Question for next call). Find the first empty row by reading Research!A:A; never overwrite existing rows. A finding is Verified only when a link you saw shows it. Not found, blocked or outdated is Not verified. Do not invent ratings, traffic, revenue, ownership or prices. Never mention Yelp in questions or call pointers. Do not criticise the restaurant's current provider.
5. Write 3 to 5 numbered talking points into that lead's Leads column U (Call pointers), plain English, one per line, starting with questions about their current setup.
6. Untick Leads column R (set FALSE) for each lead you finished. Leave R ticked for any lead you could not finish, so it is retried next run.
7. Do not change any other cells, tabs, formulas or formatting.
8. Finish with a short summary: which leads were researched and anything that needs a human check.
```
