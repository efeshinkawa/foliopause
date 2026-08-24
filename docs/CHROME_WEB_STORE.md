# Chrome Web Store release notes

This file is the prepared listing and submission checklist for FolioPause. Keep
Google Photos as a compatibility reference, lead with the independent
FolioPause identity, and do not use Google logos, fonts, screenshots as a logo,
or Google brand colors in listing artwork.

## Listing copy

**Store title**

> FolioPause — Photo Review for Google Photos™

**Short description**

> An independent, local review tool for Google Photos™. Swipe to mark or keep,
> then confirm before anything moves to Trash.

This matches the shipped `appDescription` in all five locales. Chrome's
[branding guidelines](https://developer.chrome.com/docs/webstore/branding)
permit referencing a Google product with "for", "for use with", or "compatible
with" provided the trademark symbol is present and attribution is given; they
forbid using a Google trademark *as* the extension or company name, and forbid
using a Google mark (or a modified one) as the extension logo. FolioPause does
neither. Keep the "for Google Photos™" text smaller than the FolioPause mark in
any promotional artwork.

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
- [x] ZIP with `manifest.json` at the archive root
- [ ] Private trusted-tester review
- [ ] Public listing review

## Installation-link placeholder

After approval, replace the Chrome Web Store notice in [`../README.md`](../README.md)
and this placeholder:

> `CHROME_WEB_STORE_URL`

## Known non-IP risk: Google's Terms of Service

This is the residual risk that trademark and copyright hygiene cannot remove,
and it is worth stating plainly in the listing and README.

FolioPause drives an **undocumented internal Google Photos RPC** (`lcxiM`,
`XwAOJf`, `VrseUb`, `EWgK9e`) from the user's own signed-in, same-origin
session. The [Google Terms of Service](https://policies.google.com/terms)
prohibit "using automated means to access content from any of our services in
violation of the machine-readable instructions on our web pages" and
"bypassing our systems or protective measures", and allow Google to "suspend or
terminate your access to the services or delete your Google Account" for a
material or repeated breach.

Points that materially distinguish FolioPause from the scraping cases Google
has actually enforced against:

- it reads only the signed-in user's **own** library, not content belonging to
  others, so "scraping content that doesn't belong to you" does not apply;
- it runs inside the user's own authenticated session at human interaction
  rates, with no proxies, no credential sharing and no identity concealment;
- every request is user-initiated, and deletion only moves items to Trash,
  which Google retains for 60 days.

What cannot be ruled out is that Google treats third-party use of an internal
RPC as circumventing the intended interface. The exposure lands on the
**end user's Google account**, not on the project's copyright position, so the
listing and README should say so before a user installs.

## Official references

- [Prepare an extension for the Chrome Web Store](https://developer.chrome.com/docs/webstore/prepare)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)
- [Store listing requirements](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
- [Privacy disclosures](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [Impersonation and intellectual-property policy](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property)
- [Chrome Web Store branding guidelines](https://developer.chrome.com/docs/webstore/branding)
- [Google brand permission request form](https://support.google.com/contact/brand_request_form)
- [Google Terms of Service](https://policies.google.com/terms)
