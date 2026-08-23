# Chrome Web Store release notes

This file is the prepared listing and submission checklist for FolioPause. Keep
Google Photos as a compatibility reference, lead with the independent
FolioPause identity, and do not use Google logos, fonts, screenshots as a logo,
or Google brand colors in listing artwork.

## Listing copy

**Store title**

> FolioPause — Review Before Trash

**Short description**

> An independent, local review tool for Google Photos. Swipe to mark or keep,
> then confirm before anything moves to Trash.

**Single purpose**

> FolioPause helps a signed-in user review their own Google Photos library and
> move only explicitly confirmed selections to Trash.

**Independence notice**

> Google Photos is a trademark of Google LLC. FolioPause is an independent
> project and is not affiliated with, sponsored by, or endorsed by Google.

## Permission justifications

**`https://photos.google.com/*`**

> Required to display the review interface on Google Photos and to use the
> user's already signed-in, same-origin session for listing media, loading
> previews, moving confirmed selections to Trash, restoring the latest batch,
> and verifying results. FolioPause cannot run on unrelated websites.

**`activeTab`**

> Required only so a toolbar click can recover and reopen FolioPause in the
> current Google Photos tab after an extension reload or update. It does not
> grant permanent access to unrelated tabs or websites.

## Privacy disclosure summary

- No developer-operated server, analytics, advertising, OAuth, or API key.
- Photos and decisions are not sent to the developer.
- Account-scoped media identifiers, decisions, settings, counters, and the
  deletion log are stored locally in browser storage.
- Signed-in session values are used in memory and are not persisted by
  FolioPause.
- Network traffic goes directly to Google Photos and Google-hosted media
  endpoints.
- JSON export occurs only after an explicit user action.
- Data is not sold, shared for advertising, or used for credit decisions or
  machine-learning training.

Full policy: [`../PRIVACY.md`](../PRIVACY.md)

> **Public privacy policy URL:** `PUBLIC_PRIVACY_POLICY_URL`

The Chrome Web Store requires a publicly reachable privacy-policy URL. A file
inside a private GitHub repository is not public; host this policy on a public
GitHub Pages site or another stable HTTPS page before submission.

## Package and artwork checklist

- [x] Original 128×128 extension icon
- [x] Independent name, palette, and product mark
- [x] English privacy policy and trademark disclaimer
- [x] Localized extension name and toolbar copy
- [ ] 1280×800 or 640×400 screenshots
- [ ] 440×280 promotional image
- [ ] Public privacy-policy URL
- [ ] ZIP with `manifest.json` at the archive root
- [ ] Private trusted-tester review
- [ ] Public listing review

## Installation-link placeholder

After approval, replace the Chrome Web Store notice in [`../README.md`](../README.md)
and this placeholder:

> `CHROME_WEB_STORE_URL`

## Official references

- [Prepare an extension for the Chrome Web Store](https://developer.chrome.com/docs/webstore/prepare)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)
- [Store listing requirements](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
- [Privacy disclosures](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [Impersonation and intellectual-property policy](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property)
