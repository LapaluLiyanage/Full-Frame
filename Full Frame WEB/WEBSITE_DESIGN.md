# Full Frame — Landing Page Design Brief

A design/content spec for a one-page marketing site that previews the
**Facebook Album Download Kit** ("Full Frame") Chrome extension and links out
to the Chrome Web Store listing. Use this as the brief for building the
frontend (static site, no backend needed).

## Goal & audience

Convince someone who wants to back up a Facebook album that this extension is
free, safe, and does the job — then get them to click "Add to Chrome" as fast
as possible. Audience: people who already know what a Chrome extension is;
don't over-explain the basics.

## Site structure (single page, scrolling sections)

1. **Hero**
2. **How it works** (3 steps)
3. **Features grid**
4. **Screenshots / preview**
5. **Privacy & permissions**
6. **FAQ**
7. **Footer**

---

## 1. Hero

- Extension name + tagline, one primary CTA button, no secondary CTA.
- Headline: **"Download your Facebook albums. Full resolution. One click."**
- Subheadline: "Save any Facebook album you can already view — as separate
  files or one ZIP. Free. No account, no server, no catch."
- CTA button: **"Add to Chrome — it's free"** → links to the Chrome Web Store
  listing.
- Visual: a mock-up or real screenshot of the side panel open next to a
  Facebook album (use the actual panel UI, not a generic illustration —
  people trust seeing the real product).
- Small trust line under the CTA: "Works in Chrome & Edge 116+ · No sign-up"

## 2. How it works (3 steps, horizontal on desktop / stacked on mobile)

1. **Open an album** — Icon: a photo grid. "Open any Facebook album you can
   already view."
2. **Scan** — Icon: a magnifying glass / radar sweep. "Click the extension
   icon, then Scan. It finds every photo, even ones Facebook hasn't loaded
   yet."
3. **Download** — Icon: a download arrow / zip folder. "Save as separate
   files or one ZIP — your choice."

## 3. Features grid (2×3 or 3×2 cards, icon + short title + one line)

- **Full resolution** — Opens each photo to get the real file, not the
  cropped thumbnail.
- **ZIP or files** — Pack the whole album into one ZIP, or save photos
  individually.
- **Nothing missed** — Shows exactly how many photos were found vs. how many
  the album claims to have.
- **Automatic retry** — If one image URL fails, it tries a fallback before
  giving up.
- **Your pace** — Adjustable delay and concurrency so you don't get rate
  limited.
- **100% private** — No account, no server, no analytics. Everything happens
  in your browser.

## 4. Screenshots / preview

- 2–3 real screenshots of the side panel in action: (a) the scan results grid
  with photos selected, (b) the download progress, (c) the settings panel.
- Use a simple browser-chrome frame around each screenshot (rounded corners,
  a faint address bar) so it reads as "this is the real product," not a
  mockup.
- Optional: a short (10–15s) looping screen-capture GIF/video of a scan +
  download instead of static images, if you can record one.

## 5. Privacy & permissions

People will be wary of an extension that touches Facebook — be upfront and
specific, don't just say "we respect your privacy."

- One paragraph: "This extension only runs on facebook.com and fbcdn.net. It
  never sends your data anywhere except back to Facebook's own servers to
  fetch the photos you asked for. There's no backend, no analytics, no
  tracking, no account required."
- A small table or list mapping each requested permission to why it's needed
  (downloads, storage, scripting, sidePanel, tabs, host access) — this
  doubles as content for the Chrome Web Store's permission justification, so
  keep language consistent with what you submit there.
- Link to the full privacy policy page (needs to exist as a real page/URL
  for the Chrome Web Store listing anyway).

## 6. FAQ (accordion, 4–6 items)

- "Does this work on private albums?" → Only albums your own account can
  already view — it doesn't bypass privacy settings.
- "Is it really free?" → Yes, no premium tier, no ads, no hidden limits.
- "Will it break if Facebook changes their site?" → Possibly — link to the
  GitHub repo/issues for bug reports.
- "Does it work on Edge?" → Yes, Chrome & Edge 116+.
- "Can I download other people's photos?" → Only what you can already see;
  reposting them elsewhere is a copyright/ToS question, not something this
  tool controls.

## 7. Footer

- Links: GitHub repo, Chrome Web Store listing, Privacy Policy, Report an
  issue.
- Small print: "Not affiliated with or endorsed by Meta/Facebook."

---

## Visual style

- **Tone**: clean, utilitarian, trustworthy — closer to a dev tool's landing
  page than a consumer app. Avoid stock-photo people; avoid Facebook's own
  blue (don't look like an official Meta product).
- **Palette**: pick a palette independent from Facebook blue — e.g. a dark
  ink/near-black text on off-white, with one accent color (teal, amber, or
  violet) used sparingly for the CTA button and icons. Support light and
  dark mode if this becomes a coded page (system preference, not a toggle).
- **Typography**: one system-ui or geometric sans for everything; use size
  and weight for hierarchy rather than multiple typefaces.
- **Layout**: generous whitespace, max content width ~1100px, single column
  on mobile. Section padding should breathe — this is a short page, let it
  feel spacious rather than dense.
- **Motion**: minimal — a subtle fade/slide-in on scroll for feature cards is
  enough; nothing that delays the CTA being clickable.

## Suggested stack

Static HTML/CSS (+ a sprinkle of JS for the FAQ accordion) is enough — no
framework needed for a single page like this. If you want to publish it as a
Claude Artifact for a quick preview before building it "for real," that's a
fine first step: draft it as one HTML file, iterate on layout there, then
promote it to the real project once you're happy with it.

## Copy checklist before publishing

- [ ] Every claim on the page matches what's actually true of v1.0.0 (don't
      promise features not yet built).
- [ ] "Free" is stated at least twice: hero subheadline and features grid.
- [ ] CTA button text matches exactly what the Chrome Web Store button will
      say, so there's no bait-and-switch feeling.
- [ ] Privacy section language matches the Chrome Web Store's data-disclosure
      form, word for word where possible.
- [ ] Footer disclaims Meta/Facebook affiliation.
