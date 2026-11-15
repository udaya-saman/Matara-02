# Matara-02 review checklist

**Branch:** `improve/multi-outlet-daily-report-2026-11`  
**Do not merge to `main` until the app has been tested on devices and with actual outlet reports.**

## Test scenarios

1. **Outlet dialog:** Open Settings, choose another outlet, tap Save Outlet. Settings must close and the confirmation must be visible immediately. Cancel must leave the original outlet selected. Confirm must change the outlet.
2. **Saved outlet isolation:** Enter different data for Akuressa and Matara 02 on the same date, refresh the app and switch outlets. Each must retain its own values and MIS file.
3. **6 AM Sri Lankan operational boundary:** At 05:59 local, the active operational date is yesterday; at 06:00 it becomes today. This must work while the app remains open. Today's values and the specified MTD fields clear; appropriate monthly and yearly values continue. Check month and year changes.
4. **Reset + Restore:** With a previously uploaded MIS CSV, reset a report. The cleared values and targets must stay cleared after app reload. Restore must return that outlet/date report. Other outlet/date reports must be untouched. To re-enable MIS auto-fill on a reset report, upload and confirm a valid CSV again.
5. **MIS CSV:** Upload a valid Gamma MIS CSV for the selected reporting month/year, including a file with yearless date headers. Confirm the selected outlet and reporting month before saving. Upload invalid/mismatched/other-outlet CSVs; the previous MIS must remain available. Cross-check a genuine CSV against Gamma output.
6. **Monthly target:** For February use its real last day (28 or 29); for a 30-day month use day 30. A partial CSV without the last calendar day must not be treated as a confirmed monthly total.
7. **Input validation:** Enter negative percentages, percentages over 100, ratings over 5, and invalid numeric text. Reject invalid stored input while preserving calculations and accepted fields.
8. **Backups:** Export a JSON backup, import it, inspect the conflict summary, and verify existing outlet/date reports are preserved. Confirm Undo Import restores the pre-import database. Reject malformed JSON and invalid report dates without erasing local data.
9. **Historical/future dates:** Select an earlier date and confirm its values are isolated. A future date must show a confirmation and a future-draft notice. Preview WhatsApp to see historical/future warnings without changing the message text itself.
10. **Mobile UI:** On Android and iPhone check portrait/landscape readability, text sizes, touch targets, Settings, WhatsApp preview, and the Calendar. Verify Escape or system Back closes an open popup. Keyboard focus should remain in the active dialog.
11. **WhatsApp and calculations:** Compare both WhatsApp messages and outputs for MTD variance, Day variance, ADS, ADT, B2B, Top Box, OSAT, Smart GES, and manual Total Responses against the original working app.
12. **Offline:** Install as a PWA, then close and reopen offline. Verify cached assets, report values and switching between previously saved outlet/date reports.

## Automated checks

The GitHub Actions workflow `.github/workflows/validate.yml` runs:
- `node tests/report-store.test.js`
- `node tests/report-ui.test.js`
- JavaScript syntax checks for the storage script, service worker, and HTML app script.

**Manual phone tests and real Gamma MIS sample verification remain required.** Neither the review branch nor this checklist alters the live GitHub Pages site.
