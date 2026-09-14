# Facebook Album Download Kit — v1.0.0

A Chrome/Edge extension (Manifest V3) for saving Facebook albums you can
already view, either as individual files or as one ZIP. No account, no server,
no paywall — the photos go straight from Facebook's CDN to your disk.

## Install

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick this folder
3. Open a Facebook album, click the extension icon (the side panel opens), then
   **Scan this album**

Works in Chrome 116+ and Edge 116+. The `sidePanel` API is what sets the floor.

## What's in here

```
manifest.json
src/background/service-worker.js   opens the side panel; holds no state
src/content/content.js             album detection, scrolling, harvesting, full-res lookup
src/content/overlay.css            the in-page launcher button
src/sidepanel/sidepanel.html/.css  the panel UI
src/sidepanel/sidepanel.js         the orchestrator: scan → resolve → download
src/sidepanel/zip.js               dependency-free ZIP writer (store method)
test/                              node tests for the parsing, naming, and ZIP code
```

Run the tests with `node test/extract.test.mjs && node test/naming.test.mjs && node test/zip.test.mjs`.

## Why it is built this way

**The side panel is the orchestrator, not the service worker.** MV3 service
workers are killed after ~30s idle and at other unpredictable moments. Any
extension that runs a 400-photo download loop inside one will stall partway
through and look broken. The side panel is a real document that lives as long
as it is open, so the job lives there. The service worker does nothing but open
the panel.

**Photos are harvested during scrolling, not after.** Facebook virtualises the
album grid — nodes that scroll far enough out of view are removed from the DOM.
Scrolling to the bottom and then reading the page gives you the last screenful.
Every scroll step here harvests into a `Map` keyed by photo id, so nothing is
lost when a node is recycled.

**Original quality means opening each photo.** The grid only ever holds
thumbnails. In *Original* mode the extension fetches each photo's permalink and
reads the largest `uri` out of the embedded JSON, scored by the width/height in
the same JSON object. *Quick* mode instead strips the `stp=` crop parameter off
the grid URL, which is much faster but sometimes gives a mid-size image — the
untouched URL is kept as a fallback in case stripping breaks the CDN signature.

**Every download has more than one candidate URL.** If the best URL 404s, the
next one is tried before the photo is marked failed.

**The completeness number is shown, not hidden.** If Facebook says the album
has 120 photos and the scan found 118, the panel says so instead of quietly
reporting success.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Image quality | Original | Quick is roughly 10× faster, lower resolution |
| Pause between photos | 700 ms | Raise it if Facebook starts refusing requests |
| Downloads at a time | 3 | Above ~5 the failure rate goes up |

Files save as `Facebook Albums/{album}/{index}-{fbid}.{ext}`, and the ZIP as
`{album}.zip`. Names are sanitised per path segment, so `..`, leading `/`,
`:*?"<>|`, control characters and trailing dots can never reach
`chrome.downloads`.

## Known limits — read these

- **Facebook's markup changes without notice.** Everything that reads the page
  is confined to `parsePhotoHref`, `harvest` and `pickBestImage` in
  `content.js`. When something breaks, that is where to look, and the tests in
  `test/extract.test.mjs` are where to reproduce it. Nobody can promise a
  scraper against Facebook is permanently bug-free; what this design buys you is
  that the breakage is small and localised.
- **Keep the side panel open and the tab visible** while a job runs. Chrome
  throttles timers in background tabs, which slows scrolling to a crawl.
- **ZIP mode holds every photo in memory** before writing. Past ~300 photos the
  panel asks you to confirm; past ~1000 use *Save as files*. ZIP32 limits are
  enforced with clear errors (4 GB, 65,535 files) rather than silent corruption.
- **Only content your account can already see** is reachable. This does not
  bypass privacy settings, and it will not touch an album you cannot open in a
  normal tab.
- Downloading other people's photos and reposting them is a copyright and
  Facebook-ToS question, not a technical one. This is built for backing up your
  own albums and pages.
