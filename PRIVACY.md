# FolioPause privacy policy

**Effective date:** 24 August 2026  
**Applies to:** the FolioPause browser extension, console build, and optional
userscript

FolioPause is a local-first, open-source review tool. It has no
developer-operated backend, analytics service, advertising network, account
system, or payment system. The project developer does not receive users'
photos, identifiers, decisions, or activity through FolioPause.

## Data handled on the device

FolioPause may handle the following data inside the browser:

- account-scoped Google Photos media identifiers;
- media metadata needed for review, such as capture time, media type, size,
  favorite/archive state, and Google-hosted preview URLs;
- keep and pending-review decisions;
- settings, progress counters, resume position, and language/theme choices;
- a local log of confirmed Trash actions; and
- the signed-in page's session values in memory while making same-origin
  requests to Google Photos.

Settings and counters are stored in `localStorage`. Potentially larger
account-scoped decision lists and the deletion log are stored in IndexedDB on
the `photos.google.com` origin. Session values are not written to storage by
FolioPause. A deletion log leaves the browser only when the user explicitly
exports it as a JSON file.

## Network activity

FolioPause is not an offline application. It communicates directly with Google
Photos through the already signed-in `photos.google.com` session and loads
media previews from Google-hosted endpoints. These requests are necessary to
list media, display previews, move confirmed items to Trash, restore the most
recent batch, and verify results.

FolioPause does not send data to a FolioPause server, analytics provider,
advertising company, data broker, or unrelated third party. Google's handling
of traffic to its services is governed by Google's own terms and privacy
policy.

## Extension access

| Access | Why it is needed |
|---|---|
| `https://photos.google.com/*` | Loads the review interface only on Google Photos and permits same-origin interaction with the signed-in site |
| `activeTab` | Lets a toolbar click recover the current Google Photos tab after an extension reload or update |

The extension does not request access to all websites, browsing history,
downloads, contacts, location, microphone, camera, or Chrome Sync.

## Sharing, sale, and secondary use

The project developer does not collect, sell, rent, share, transfer, or use
personal data for advertising, credit decisions, profiling, or any purpose
unrelated to the single photo-review function. FolioPause does not use or
transfer data to train machine-learning models.

## Retention and deletion

Local review data remains until the user changes it through FolioPause or
clears storage for `photos.google.com` in the browser. Removing the extension
does not necessarily clear site-scoped browser storage.

Users can remove pending decisions from Review, reset the kept list in
Settings, restore the most recent confirmed batch when available, or clear all
site data through the browser's privacy settings. Clearing all Google Photos
site data may also sign the user out of Google.

## Security

FolioPause uses HTTPS-only Google Photos URLs, does not execute remote code,
does not embed third-party scripts, and keeps its production page API limited
to opening, closing, and reporting the version. Mutations fail closed when the
per-account browser lock or required local persistence is unavailable.

No software can promise absolute security. Users should review the open source,
keep important photos backed up, use Dry Run first, and verify Trash after
important batches.

## Changes and contact

Material changes to this policy will be committed with an updated effective
date. Questions and security reports can be opened through the repository's
GitHub issue tracker. Do not attach private photos, media identifiers, cookies,
or Google session values to a report.

## Independent-project notice

Google Photos is a trademark of Google LLC. FolioPause is an independent
project and is not affiliated with, sponsored by, or endorsed by Google.
