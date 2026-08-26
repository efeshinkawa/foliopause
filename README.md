<p align="center">
  <img src="extension/icons/icon.svg" width="112" height="112" alt="FolioPause logo">
</p>

<h1 align="center">FolioPause</h1>

<p align="center"><strong>Swipe fast. Pause before Trash.</strong></p>

<p align="center">
  <a href="https://go.efeer.im/foliopauseextension"><img src="https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=googlechrome&logoColor=white" alt="Install from the Chrome Web Store"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
</p>

FolioPause is an independent, open-source review tool for cleaning up a Google
Photos library with swipe gestures. Swipe left to mark a photo, swipe right to
keep it, then review every selection before anything moves to Trash. A left
swipe never deletes a photo by itself.

> Google Photos is a trademark of Google LLC. FolioPause is an independent
> project and is not affiliated with, sponsored by, or endorsed by Google.

## Risk notice — read before installing

> [!WARNING]
> **Using FolioPause may put your Google account at risk. By installing or
> running it, you accept that risk.**

Google's official Photos Library API cannot list an entire existing library or
move arbitrary media to Trash. FolioPause therefore drives the same
undocumented, same-origin RPCs that the Google Photos website itself uses, from
the session you are already signed in to.

Google's [Terms of Service](https://policies.google.com/terms) prohibit "using
automated means to access content from any of our services in violation of the
machine-readable instructions on our web pages" and "bypassing our systems or
protective measures", and permit Google to "suspend or terminate your access to
the services or delete your Google Account" for a material or repeated breach.

Several things distinguish FolioPause from the bulk-scraping cases Google has
actually pursued:

- it reads only **your own** library, never content belonging to anyone else;
- it runs inside your own authenticated session, at human interaction rates,
  with no proxies, no credential sharing and no attempt to conceal identity;
- every request follows an action you took, and deleting only moves items to
  Google's Trash, which stays recoverable for 60 days.

What cannot be ruled out is that Google treats third-party use of an internal
interface as circumventing the intended one. **That exposure lands on your
Google account, not on this project.** Google may also change these interfaces
at any time without notice.

If that trade-off is not acceptable to you, do not install FolioPause.

**Before you rely on it:** run **Dry Run** first, keep independent backups of
anything you cannot lose, and check your Trash after every batch. FolioPause is
provided "as is", without warranty of any kind and without liability, under the
[MIT License](LICENSE).

## Install

### Recommended: Chrome extension

**[➜ Install FolioPause from the Chrome Web Store](https://go.efeer.im/foliopauseextension)**

Works in Chrome, Brave, Edge, and other Chromium browsers that support the
Chrome Web Store.

After installation:

1. Open [Google Photos](https://photos.google.com/).
2. Click the FolioPause toolbar icon or the FolioPause button on the page.
3. Start reviewing.

<details>
<summary><strong>Alternative: load the unpacked extension from source</strong></summary>

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
