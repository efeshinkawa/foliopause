<p align="center">
  <img src="extension/icons/icon.svg" width="112" height="112" alt="FolioPause logo">
</p>

<h1 align="center">FolioPause</h1>

<p align="center"><strong>Swipe fast. Pause before Trash.</strong></p>

FolioPause is an independent, open-source review tool for cleaning up a Google
Photos library with swipe gestures. Swipe left to mark a photo, swipe right to
keep it, then review every selection before anything moves to Trash. A left
swipe never deletes a photo by itself.

> Google Photos is a trademark of Google LLC. FolioPause is an independent
> project and is not affiliated with, sponsored by, or endorsed by Google.

## Install

### Recommended: Chrome extension

> [!IMPORTANT]
> **Chrome Web Store: coming soon.** The approved installation link will be
> added here.

<!-- CHROME_WEB_STORE_LINK: replace the notice above with the approved URL. -->

After installation:

1. Open [Google Photos](https://photos.google.com/).
2. Click the FolioPause toolbar icon or the FolioPause button on the page.
3. Start reviewing.

<details>
<summary><strong>Developer preview: load the unpacked extension</strong></summary>

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome, Brave, or Edge.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the [`extension`](extension) folder.
6. Open Google Photos and click the FolioPause toolbar icon.

The committed extension folder is ready to load. Run `npm run build` only after
editing files under [`src`](src).

</details>

### Advanced / optional: console script

Use this method if you do not want to install the extension:

1. Open [`dist/foliopause-console.js`](dist/foliopause-console.js).
2. On GitHub, select **Raw**, then copy the entire file.
3. Open [Google Photos](https://photos.google.com/).
4. Open DevTools with `F12`, `Ctrl+Shift+J`, or `Cmd+Option+J`.
5. Paste the script into the **Console** and press Enter.

Chrome may show a self-XSS warning and ask you to type `allow pasting`. Never
bypass that warning for code you have not inspected and do not trust.

The interface closes when the page reloads, but saved decisions remain in
browser storage. Paste the script again to continue. Tampermonkey is not
required; an optional userscript build is also available at
[`dist/foliopause.user.js`](dist/foliopause.user.js).

## How it works

1. **Swipe left** to add a photo to the pending Review list. Nothing is
   deleted.
2. **Swipe right** to keep it and stop showing it again.
3. FolioPause asks for a review every 100 decisions by default. The interval can
   be changed or disabled in Settings.
4. The **Review** action remains available in both the top bar and the
   bottom action bar.
5. In Review, keep individual photos, change the entire batch, or use **Undo
   all** to return every marked photo to the swipe queue.
6. Only selected photos move to Google Photos Trash after explicit
   confirmation.
7. FolioPause checks Trash before treating an item as successfully moved.
   Failed or unknown results remain visible for review.
8. The most recent confirmed batch can be restored with **Undo** during the
   current app session.

The scoreboard shows **Reviewed**, **Kept**, **Pending**, and **Moved to
Trash**. FolioPause does not invent a “photos remaining” total because the
internal list response does not provide a reliable library total.

## Highlights

- Review-before-Trash workflow with explicit confirmation
- Persistent Review controls and a configurable 100-decision prompt
- Per-photo, keep-all, select-all, and undo-all review actions
- Undo for the latest decision and latest confirmed Trash batch
- Dry Run mode that never sends a Trash request
- Local deletion-log export as JSON
- Library, Archive, or combined source selection
- Optional video and favorite filters
- Light, dark, and system themes
- Keyboard, mouse, and touch controls
- English, Turkish, Italian, Spanish, and German

Automatic language selection first checks the Google Photos page language,
then the browser's ordered language preferences, which usually follow the
operating-system language. It can be changed at any time under **Settings →
Language**.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `←` | Mark for deletion review |
| `→` | Keep |
| `Z`, `↑`, `Backspace` | Undo the latest action |
| `R` | Open or close Review |
| `Space`, `Enter` | Open in Google Photos |
| `V` | Play or pause video |
| `S` | Open Settings |
| `?` | Show shortcuts |
| `Esc` | Close or go back |

## Privacy and permissions

FolioPause has no developer-operated server, account system, telemetry,
advertising, OAuth flow, or API key. Photos are never uploaded to FolioPause.
Settings, decisions, pending-review metadata, and the deletion log stay in
browser storage on the user's device.

Network activity is not zero: FolioPause uses the signed-in Google Photos web
session to communicate directly with Google and loads previews from
Google-hosted endpoints. It does not send data to a FolioPause server or a
third-party analytics service.

| Access | Purpose |
|---|---|
| `https://photos.google.com/*` | Runs the review interface only on Google Photos and uses its signed-in session |
| `activeTab` | Lets a toolbar click reopen FolioPause in the current Google Photos tab after an extension reload or update |

Chrome may describe the first entry as permission to read and change data on
`photos.google.com`. The extension cannot run on unrelated websites and does
not request all-sites, browsing-history, or Chrome Sync access.

Read the full [`PRIVACY.md`](PRIVACY.md) before installing.

## Safety model

- A swipe decision is committed locally before the next card appears.
- Pending deletions remain local until explicit review and confirmation.
- Review choices are saved atomically before a destructive request begins.
- Only one tab can make decisions for the same Google account at a time. If a
  safe per-account browser lock is unavailable, FolioPause blocks mutations.
- Trash results are reconciled before local pending records are cleared.
- Failed or ambiguous results remain selected instead of being silently
  treated as successful.
- Dry Run exercises the workflow without sending a Trash request.
- FolioPause moves items to Trash; it never requests permanent erasure.

Keep a current backup of important photos, try Dry Run first, and verify Trash
after important batches. Google controls Trash retention and recovery; consult
the current [Google Photos Help documentation](https://support.google.com/photos/answer/6128858).

## Compatibility notice

Google's official Photos Library API cannot list an entire existing library or
move arbitrary media to Trash. FolioPause therefore uses undocumented,
same-origin RPCs used by the Google Photos website.

Google may change those interfaces without notice. FolioPause is designed to
fail closed when a response cannot be understood or verified, but no
independent tool using an undocumented interface can guarantee compatibility
with future changes. Use Dry Run, maintain backups, and verify Trash.

## Development

FolioPause has no external npm runtime dependencies.

```bash
npm run build
npm test
npm run check
```

`npm run check` validates generated artifacts, runs the independent-brand
regression gate, exercises browser behavior and safety flows, covers the full
mock library without skips or duplicates, verifies batch limits and multi-tab
locking, and loads the real unpacked MV3 extension in a clean Chromium profile.

Project layout:

- [`src`](src) — source modules
- [`dist`](dist) — console and optional userscript builds
- [`extension`](extension) — unpacked Manifest V3 extension
- [`test`](test) — browser, safety, batching, multi-tab, and extension tests

Please do not include private photos, media identifiers, cookies, or Google
session tokens in bug reports.

## Project identity and license

The FolioPause mark, palette, and interface identity are original,
project-native assets; they do not use the Google Photos pinwheel, Google
colors, Google fonts, or copied icon files. Their construction and provenance
are documented in [`BRAND.md`](BRAND.md).

Source code and original project artwork are available under the
[MIT License](LICENSE). See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
for acknowledgements. The prepared store copy and release checklist live in
[`docs/CHROME_WEB_STORE.md`](docs/CHROME_WEB_STORE.md).
