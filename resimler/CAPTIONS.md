# FolioPause — social launch kit

All images live in `resimler/`. They use the project's own palette (Ink Navy /
Folio Violet / Pause Mint) — no Google logo, Google colour or Google font — and
each one carries the trademark notice in the footer.

| File | Size | Where |
|---|---|---|
| `threads-1.png` | 1080×1080 | Threads — post 1 (hook) |
| `threads-2.png` | 1080×1080 | Threads — post 2 (how it works) |
| `story-1.png` | 1080×1920 | Instagram Story — frame 1 |
| `story-2.png` | 1080×1920 | Instagram Story — frame 2 |
| `linkedin-1.png` | 1200×630 | LinkedIn — main image |
| `linkedin-2.png` | 1200×630 | LinkedIn — second image / carousel |

The story frames keep ~250 px clear at the top and bottom, so Instagram's own
UI never covers the text.

---

## THREADS

**Post 1 — image: `threads-1.png`**

```
My Google Photos library passed 350 GB and I realised deleting photos is
harder than taking them.

So I built FolioPause. You clear the library by swiping.
← mark · → keep

The important part: a left swipe does not delete anything. It only marks.
Nothing goes to Trash until you confirm it.

Open source, free, MIT 👇
github.com/efeshinkawa/foliopause
```

**Post 2 (reply in the same thread) — image: `threads-2.png`**

```
How it works:

1. Swipe — a left swipe only marks the photo
2. Review — everything you marked shows up on one screen
3. Confirm — only what you confirm goes to Trash, recoverable for 60 days

There's also a Dry Run mode, undo, a JSON deletion log and 5 languages.
No server, no account, no telemetry — everything stays in your browser.
```

**Post 3 (no image, end of the thread)**

```
The honest part:

Google's official Photos API can't enumerate an existing library or trash
arbitrary media. So FolioPause drives the same internal requests the Photos
website itself uses, from the session you're already signed in to.

That may put your Google account at risk under Google's Terms of Service.
Read the warning in the README before you install, and start with Dry Run.
```

---

## INSTAGRAM STORY

**Frame 1 — `story-1.png`**

Stickers to add:
- Link sticker: `github.com/efeshinkawa/foliopause` → label: **Open source · free**
- Optional poll: "How big is your gallery?" → *under 10 GB / 100 GB+ / don't ask*

The one-liner is already on the image, so no extra text is needed:

```
Clean your gallery by swiping. Left swipe marks, right swipe keeps.
```

**Frame 2 — `story-2.png`**

Stickers:
- Link sticker: `github.com/efeshinkawa/foliopause` → label: **Install**
- Optional small note on top:

```
Nothing is deleted until you confirm. Trash stays recoverable for 60 days.
```

**If you turn the story into a feed post (single-line caption):**

```
I built an open-source tool that cleans up Google Photos by swiping:
FolioPause. Left swipe marks, right swipe keeps, and nothing is deleted until
you confirm. Link in bio. #opensource #chromeextension
```

---

## LINKEDIN

**Images: `linkedin-1.png` (main), `linkedin-2.png` (second frame)**

```
My Google Photos library passed 350 GB and I realised deleting photos is
harder than taking them.

So I built FolioPause and open-sourced it.

What it does
You clear the library one photo at a time by swiping. A left swipe marks, a
right swipe keeps. Everything you marked collects in a single review screen and
moves to Trash only after you confirm — there is no "I deleted it by accident"
path, and Trash stays recoverable for 60 days.

Under the hood
• Chrome MV3 extension plus a no-install console build
• No server, account, OAuth, API key or telemetry; decisions and settings stay
  in the browser
• Undo, a Dry Run mode and a JSON deletion log
• 307 browser assertions and an extension load test
• EN, TR, IT, ES, DE · MIT licensed

One honest caveat: Google's official Photos Library API cannot enumerate an
existing library or trash arbitrary media, so FolioPause drives the same
undocumented, same-origin requests the Photos website itself uses. That may put
your Google account at risk under Google's Terms of Service. I state it plainly
in the README — please read it, and start with Dry Run.

Code, install notes and warnings: github.com/efeshinkawa/foliopause

Google Photos is a trademark of Google LLC. FolioPause is an independent project
and is not affiliated with, sponsored by, or endorsed by Google.

#opensource #chromeextension #javascript #sideproject #privacy
```

**Shorter variant, if you want the hook to land above the fold**

```
Deleting photos turned out to be harder than taking them.

FolioPause is a swipe-based cleanup tool for Google Photos, and it's open
source. Swipe left to mark, right to keep — then nothing moves to Trash until
you review the batch and confirm it.

No server, no account, no telemetry. Chrome MV3 extension, MIT licensed, five
languages.

Worth knowing before you install: Google's official API can't list a full
library, so FolioPause uses the same internal requests the Photos website does.
That carries Terms of Service risk for your account, and the README says so up
front.

github.com/efeshinkawa/foliopause

Google Photos is a trademark of Google LLC. FolioPause is an independent project.
```

---

## Suggested posting order

1. LinkedIn (weekday morning) — the longest copy, technical audience
2. Threads (afternoon) — 3 posts back to back as one thread
3. Instagram Story (evening) — both frames with a link sticker, pointing either
   at the LinkedIn post or straight at GitHub
