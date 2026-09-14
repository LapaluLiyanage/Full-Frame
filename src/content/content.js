/* Facebook Album Download Kit — content script
 * Runs on facebook.com. Responsibilities:
 *   1. Work out what kind of page we're on and what album it is.
 *   2. Scroll the album and harvest photo links WHILE scrolling
 *      (Facebook recycles DOM nodes, so harvesting only at the end loses photos).
 *   3. Resolve one photo permalink to its largest available image URL.
 * It never downloads anything itself — the side panel does that.
 */
(() => {
  'use strict';

  if (window.__FBADK_CONTENT__) return;
  window.__FBADK_CONTENT__ = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let scanAbort = false;

  /* ------------------------------------------------------------------ *
   * Page context
   * ------------------------------------------------------------------ */

  function albumIdFromUrl(href = location.href) {
    try {
      const u = new URL(href, location.origin);
      const set = u.searchParams.get('set');
      if (set) return set;
      const m = u.pathname.match(/\/media\/set\/?/) ? u.searchParams.get('set') : null;
      if (m) return m;
      const p = u.pathname.match(/\/photos\/([^/]+)\/?$/);
      if (p) return 'a.' + p[1];
      return null;
    } catch {
      return null;
    }
  }

  /** Facebook hydrates the page from JSON payloads it embeds in
   *  <script type="application/json"> tags — the same GraphQL response the
   *  server used to render it. An album page's payload includes a node
   *  shaped like { __isMediaSet: "Album", title: { text }, media: { count } }.
   *  Reading that directly is far more reliable than guessing at DOM
   *  structure or class names, which Facebook changes constantly and which,
   *  for the title specifically, isn't even a heading element in current
   *  markup (it's a plain styled <span>).
   *
   *  Facebook's client-side router never removes old script tags when you
   *  navigate to a different album in the same tab — it only appends new
   *  ones. So this: (1) prefers a node whose id matches the current URL's
   *  album id, and (2) otherwise scans newest-first, to avoid picking up a
   *  stale album's data left behind in the DOM from before you navigated. */
  function findAlbumNode() {
    const wantedId = (albumIdFromUrl() || '').replace(/^a\./, '');
    const scripts = [...document.querySelectorAll('script[type="application/json"]')].reverse();
    let firstMatch = null;
    for (const s of scripts) {
      const text = s.textContent;
      if (!text || text.indexOf('__isMediaSet') === -1) continue;
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }
      const found = deepFindAlbumNode(data, 0);
      if (!found) continue;
      if (wantedId && String(found.id) === wantedId) return found;
      if (!firstMatch) firstMatch = found;
    }
    return firstMatch;
  }

  function deepFindAlbumNode(node, depth) {
    if (!node || typeof node !== 'object' || depth > 14) return null;
    if (node.__isMediaSet === 'Album' && node.title) return node;
    for (const key in node) {
      const v = node[key];
      if (v && typeof v === 'object') {
        const found = deepFindAlbumNode(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  function albumTitle() {
    const clean = (s) =>
      (s || '')
        // Strip an unread-count badge, e.g. "(12) Album Name".
        .replace(/^\(\d+\)\s*/, '')
        .replace(/\s*[|\-–]\s*Facebook\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    const og = document.querySelector('meta[property="og:title"]')?.content;
    const candidates = [
      findAlbumNode()?.title?.text,
      og,
      document.querySelector('[role="main"] h1')?.textContent,
      document.querySelector('[role="main"] h2')?.textContent,
      document.title,
    ];
    for (const c of candidates) {
      const t = clean(c);
      if (t && !/^facebook$/i.test(t) && t.length > 1) return t;
    }
    return 'Facebook album';
  }

  /** Best-effort read of the album's stated photo count, so we can tell the
   *  user "found 118 of 120" instead of silently stopping short. */
  function statedCount() {
    const fromData = findAlbumNode()?.media?.count;
    if (Number.isFinite(fromData) && fromData > 0 && fromData < 100000) return fromData;

    const main = document.querySelector('[role="main"]');
    if (!main) return null;
    const text = main.innerText.slice(0, 4000);
    const m = text.match(/([\d.,\s]{1,12})\s*(photos|items|images)\b/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
  }

  function pageKind() {
    const path = location.pathname;
    if (/\/media\/set\/?$/.test(path) || /media_set/.test(path)) return 'album';
    if (/^\/photo\/?$/.test(path) || /photo\.php$/.test(path)) return 'photo';
    if (/\/photos(\/|$)/.test(path)) return 'album';
    if (/\/groups\//.test(path)) return 'group';
    return 'other';
  }

  /* ------------------------------------------------------------------ *
   * Harvesting
   * ------------------------------------------------------------------ */

  function parsePhotoHref(href) {
    let u;
    try {
      u = new URL(href, location.origin);
    } catch {
      return null;
    }
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;

    let fbid = u.searchParams.get('fbid');
    let set = u.searchParams.get('set');

    if (!fbid) {
      // /<user>/photos/a.123/456/  or  /photo/?fbid=
      const m = u.pathname.match(/\/photos\/(?:(a\.\d+|pcb\.\d+|\d+))\/(\d{6,})/);
      if (m) {
        set = set || m[1];
        fbid = m[2];
      }
    }
    if (!fbid) {
      const m2 = u.pathname.match(/\/photo\/(\d{6,})/);
      if (m2) fbid = m2[1];
    }
    if (!fbid || !/^\d{6,}$/.test(fbid)) return null;

    return { fbid, set: set || albumIdFromUrl() || null };
  }

  function biggestSrc(img) {
    if (!img) return null;
    if (img.srcset) {
      const best = img.srcset
        .split(',')
        .map((s) => s.trim().split(/\s+/))
        .map(([url, w]) => ({ url, w: parseInt(w, 10) || 0 }))
        .sort((a, b) => b.w - a.w)[0];
      if (best?.url) return best.url;
    }
    return img.currentSrc || img.src || null;
  }

  /** Pull every photo link currently in the DOM into `map`. Safe to call
   *  repeatedly — that is the point. */
  function harvest(map) {
    const anchors = document.querySelectorAll(
      'a[href*="fbid="], a[href*="/photos/"], a[href*="/photo/"], a[href*="photo.php"]'
    );
    for (const a of anchors) {
      const parsed = parsePhotoHref(a.getAttribute('href') || a.href);
      if (!parsed) continue;
      const existing = map.get(parsed.fbid);
      const thumb = biggestSrc(a.querySelector('img'));
      if (existing) {
        // Later passes sometimes carry a better thumbnail; keep the best one.
        if (thumb && !existing.thumb) existing.thumb = thumb;
        if (parsed.set && !existing.set) existing.set = parsed.set;
        continue;
      }
      map.set(parsed.fbid, {
        fbid: parsed.fbid,
        set: parsed.set,
        thumb: thumb || null,
        alt: a.querySelector('img')?.alt || '',
      });
    }
    return map.size;
  }

  /** Facebook sometimes scrolls an inner container rather than the window. */
  function scrollTargets() {
    const targets = [document.scrollingElement || document.documentElement];
    const main = document.querySelector('[role="main"]');
    let node = main;
    let guard = 0;
    while (node && guard++ < 30) {
      const style = getComputedStyle(node);
      if (
        /(auto|scroll)/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight + 40
      ) {
        targets.push(node);
      }
      node = node.parentElement;
    }
    return targets;
  }

  function clickLoadMore() {
    const buttons = document.querySelectorAll('[role="button"], a[role="link"]');
    for (const b of buttons) {
      const t = (b.innerText || '').trim().toLowerCase();
      if (t === 'see more photos' || t === 'see all photos' || t === 'show more') {
        b.click();
        return true;
      }
    }
    return false;
  }

  async function scan(opts) {
    const settleMs = Math.max(300, opts.settleMs || 900);
    const maxIdle = Math.max(2, opts.maxIdleRounds || 4);
    const maxRounds = Math.max(10, opts.maxRounds || 400);

    scanAbort = false;
    const map = new Map();
    harvest(map);

    let idle = 0;
    let last = map.size;
    let round = 0;

    const push = () => {
      try {
        chrome.runtime.sendMessage({
          type: 'SCAN_PROGRESS',
          found: map.size,
          round,
          stated: statedCount(),
        });
      } catch {
        /* panel closed — harmless */
      }
    };

    push();

    while (round < maxRounds && idle < maxIdle && !scanAbort) {
      round++;
      for (const t of scrollTargets()) {
        try {
          t.scrollTo({ top: t.scrollHeight, behavior: 'auto' });
        } catch {
          t.scrollTop = t.scrollHeight;
        }
      }
      await sleep(settleMs);
      harvest(map);

      if (map.size === last) {
        idle++;
        if (idle === 2) clickLoadMore();
      } else {
        idle = 0;
        last = map.size;
      }
      push();
    }

    return {
      ok: true,
      aborted: scanAbort,
      album: {
        title: albumTitle(),
        id: albumIdFromUrl(),
        url: location.href,
        kind: pageKind(),
        stated: statedCount(),
      },
      items: [...map.values()],
    };
  }

  /* ------------------------------------------------------------------ *
   * Full-resolution resolution
   * ------------------------------------------------------------------ */

  function decodeEntities(s) {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function unescapeJsonUrl(s) {
    return decodeEntities(
      s
        .replace(/\\\//g, '/')
        .replace(/\\u0025/gi, '%')
        .replace(/\\u0026/gi, '&')
        .replace(/\\\\/g, '\\')
    );
  }

  /** Slice out the `{ ... }` that a given index sits inside, bounded so a
   *  malformed page can't send us scanning megabytes. */
  function enclosingObject(html, index, limit = 600) {
    let start = html.lastIndexOf('{', index);
    if (start < 0 || index - start > limit) start = Math.max(0, index - limit);
    let end = html.indexOf('}', index);
    if (end < 0 || end - index > limit) end = Math.min(html.length, index + limit);
    return html.slice(start, end + 1);
  }

  /** Pick the largest real photo URL out of a Facebook photo page's HTML.
   *  Scores by the width/height that appear next to each URI in the embedded
   *  JSON, then falls back to filename conventions (_o > _n > rest). */
  function pickBestImage(html) {
    const seen = new Map();
    const re = /"uri"\s*:\s*"((?:https?:)?\\?\/\\?\/[^"]+?)"/g;
    let m;

    while ((m = re.exec(html)) !== null) {
      const url = unescapeJsonUrl(m[1]);
      if (!/^https?:\/\//i.test(url)) continue;
      if (!/scontent[^/]*\.fbcdn\.net/i.test(url)) continue;
      if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) continue;
      if (/\/rsrc\.php/.test(url)) continue;

      // Read width/height only from the JSON object this URI actually sits in.
      // A plain character window straddles neighbouring objects and happily
      // labels a 2048px original with a thumbnail's 206x206.
      const scope = enclosingObject(html, m.index);
      const w = parseInt(scope.match(/"width"\s*:\s*(\d+)/)?.[1] || '0', 10);
      const h = parseInt(scope.match(/"height"\s*:\s*(\d+)/)?.[1] || '0', 10);

      let bonus = 1;
      if (/_o\.(jpe?g|png|webp)/i.test(url)) bonus = 4;
      else if (/_n\.(jpe?g|png|webp)/i.test(url)) bonus = 3;
      else if (/_b\.(jpe?g|png|webp)/i.test(url)) bonus = 2;
      if (/[?&]stp=[^&]*_s\d/i.test(url)) bonus -= 1;
      if (/[?&]stp=[^&]*p\d+x\d+/i.test(url)) bonus -= 1;

      const area = w * h;
      const score = area * 10 + bonus;
      const prev = seen.get(url);
      if (!prev || prev.score < score) seen.set(url, { url, score, w, h });
    }

    const ranked = [...seen.values()].sort((a, b) => b.score - a.score);
    if (ranked.length) return ranked[0];

    const og = html.match(
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
    )?.[1];
    if (og) return { url: decodeEntities(og), score: 0, w: 0, h: 0 };

    return null;
  }

  async function resolve(item) {
    const params = new URLSearchParams({ fbid: item.fbid });
    if (item.set) params.set('set', item.set);
    const url = `${location.origin}/photo/?${params.toString()}`;

    const res = await fetch(url, {
      credentials: 'include',
      redirect: 'follow',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) throw new Error(`Facebook returned ${res.status}`);

    const html = await res.text();
    if (/id="login_form"|name="login_form"/.test(html) && html.length < 200000) {
      throw new Error('Facebook asked for a login on this photo');
    }

    const best = pickBestImage(html);
    if (!best) throw new Error('No image URL found in the photo page');
    return { url: best.url, width: best.w, height: best.h };
  }

  /* ------------------------------------------------------------------ *
   * Messaging
   * ------------------------------------------------------------------ */

  async function handle(msg) {
    switch (msg.cmd) {
      case 'PING':
        return { ok: true, version: 2 };

      case 'CONTEXT':
        return {
          ok: true,
          album: {
            title: albumTitle(),
            id: albumIdFromUrl(),
            url: location.href,
            kind: pageKind(),
            stated: statedCount(),
          },
          preview: harvest(new Map()),
        };

      case 'SCAN':
        return await scan(msg.opts || {});

      case 'STOP':
        scanAbort = true;
        return { ok: true };

      case 'RESOLVE':
        return { ok: true, ...(await resolve(msg.item)) };

      default:
        return { ok: false, error: `Unknown command: ${msg.cmd}` };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== 'content') return;
    handle(msg)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // keep the channel open for the async reply
  });

  /* ------------------------------------------------------------------ *
   * In-page launcher
   * ------------------------------------------------------------------ */

  function mountLauncher() {
    if (document.getElementById('fbadk-launch')) return;
    if (pageKind() === 'other') return;

    const btn = document.createElement('button');
    btn.id = 'fbadk-launch';
    btn.type = 'button';
    btn.textContent = 'Download this album';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Opening panel…';
      try {
        const r = await chrome.runtime.sendMessage({ target: 'sw', cmd: 'OPEN_PANEL' });
        btn.textContent = r?.ok
          ? 'Panel open'
          : 'Click the toolbar icon';
      } catch {
        btn.textContent = 'Click the toolbar icon';
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = 'Download this album';
      }, 2500);
    });
    document.body.appendChild(btn);
  }

  let lastHref = location.href;
  const watcher = () => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      scanAbort = true;
    }
    mountLauncher();
  };
  mountLauncher();
  setInterval(watcher, 1500);
})();
