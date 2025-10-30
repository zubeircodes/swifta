# IFTA Automator Chrome Extension

This repository contains a minimal Chrome extension that forms the foundation of the IFTA Automator workflow. It allows you to upload fuel card and ELD mileage CSV exports, automatically standardizes the headers, and produces a per-state tax summary using built-in fuel tax rates.

## Features

- Upload separate fuel and mileage CSV files directly in the extension popup.
- Automatic header standardization (supports common synonyms for state, gallons, miles, and tax paid columns).
- Calculates fleet MPG, per-state gallons used, estimated tax owed, and net tax position.
- Clean, responsive UI with instant error feedback and downloadable CSV results.

## Directory Structure

```
extension/
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup.css
├── popup.html
├── manifest.json
└── scripts/
    ├── iftaCalculator.js
    ├── stateTaxRates.js
    ├── popup.js
    └── utils/
        ├── csvParser.js
        └── dataStandardizer.js
```

## Getting Started

1. Open **chrome://extensions** in Google Chrome.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and choose the `extension/` folder from this repository.
4. Pin the “IFTA Automator” action and click it to open the popup.
5. Upload your fuel CSV (requires `state`, `gallons`, and optionally `tax_paid`) and mileage CSV (requires `state`, `miles`).
6. Click **Calculate** to see the per-state summary or **Download CSV** to export the results.

## CSV Expectations

The parser is case-insensitive and tolerant of additional columns. Supported header variations include:

- State: `state`, `jurisdiction`, `province`, `region`.
- Gallons: `gallons`, `gals`, `qty`, `quantity`, `fuel_gallons`.
- Tax Paid: `tax_paid`, `taxpaid`, `fuel_tax_paid`, `iftataxpaid`, `tax`.
- Miles: `miles`, `distance`, `trip_miles`, `total_miles`.

If required data is missing the extension provides actionable error messages so you can adjust the source export.

## Next Steps

This extension can be connected to the broader IFTA Automator platform by:

- Syncing calculated data with a backend for audit logs and historical storage.
- Integrating portal automation by injecting scripts on state tax sites.
- Adding authentication and preferences via the Chrome `storage` API.

For now, it serves as a streamlined, local-first calculator to validate your IFTA data before submission.
