# Jay Aesthetics V4

## Programme page redesign
The Admin → Programs page is reorganized into:
- pricing summary
- Natural Coaching group
- Enhanced Coaching group
- compact duration / price / live-status rows
- edit modal instead of multiple large editable forms
- add-new-programme dialog
- public pricing updates automatically from the database

## Excel exports
Admin can now download `.xlsx` files directly from the browser.

### Clients
Admin → Clients → Excel
Includes:
- Client ID
- name
- email
- phone
- account status
- programme
- subscription status
- join date

### Weekly check-ins
Admin → Check-ins → Download Excel
Includes progress/check-in data.

### Calls
Admin → Calls → Download Excel
Includes scheduled calls, contact details, reason and call status.

### Payments
Admin → Payments:
- Payments Excel
- Full Admin Report

Full Admin Report creates one Excel workbook with separate sheets:
1. Payments
2. Clients
3. Calls
4. Weekly Check-ins

The export is generated in the browser using SheetJS, so the database remains the source of truth.

## Setup after V3
Run:
```bash
npm install
npm run dev
```

No database schema reset is needed for these V4 changes.
