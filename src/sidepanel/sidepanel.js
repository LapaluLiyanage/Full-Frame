/* Facebook Album Download Kit — side panel controller
 *
 * The panel is the orchestrator on purpose. It is a real document, so unlike
 * an MV3 service worker it will not be torn down halfway through a 400-photo
 * album. Everything that has to survive a whole job lives here.
 */
(() => {
  'use strict';

  const DEFAULTS = {
    quality: 'original',
    requestDelayMs: 700,
    concurrency: 3,
    settleMs: 900,
    maxIdleRounds: 4,
  };

  // Fixed, not user-configurable — and NOT read from chrome.storage, so a
  // stale value saved back when this used to be an editable setting can
  // never silently drop the {ext} token and produce extension-less files.
  const FILENAME_TEMPLATE = 'Facebook Albums/{album}/{index}-{fbid}.{ext}';

  const ZIP_WARN_AT = 300;

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const el = {
    title: $('albumTitle'),
    context: $('albumContext'),
    notice: $('notice'),
    stageScan: $('stageScan'),
    stageScanning: $('stageScanning'),
    stageResults: $('stageResults'),
    btnScan: $('btnScan'),
    btnStopScan: $('btnStopScan'),
    scanFound: $('scanFound'),
    scanLabel: $('scanLabel'),
    scanBar: $('scanBar'),
    resultSummary: $('resultSummary'),
    grid: $('grid'),
    btnAll: $('btnAll'),
    btnNone: $('btnNone'),
    btnRescan: $('btnRescan'),
    actionbar: $('actionbar'),
    progress: $('progress'),
    jobBar: $('jobBar'),
    jobText: $('jobText'),
    btnFiles: $('btnFiles'),
    btnZip: $('btnZip'),
    btnCancel: $('btnCancel'),
    btnRetry: $('btnRetry'),
    settings: $('settings'),
    setQuality: $('setQuality'),
    setDelay: $('setDelay'),
    setConcurrency: $('setConcurrency'),
    btnResetSettings: $('btnResetSettings'),
  };

  const state = {
    settings: { ...DEFAULTS },
    tabId: null,
    album: null,
    items: [], // { fbid, set, thumb, selected, status, url, error }
    running: false,
    cancelRequested: false,
  };

  /* ---------------------------------------------------------- utilities */

  function notify(text, tone = 'info') {
    if (!text) {
      el.notice.hidden = true;
      return;
    }
    el.notice.textContent = text;
    el.notice.dataset.tone = tone;
    el.notice.hidden = false;
  }

  function sanitizeSegment(s) {
    return String(s ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.]+|[\s.]+$/g, '')
      .slice(0, 80);
  }

  function sanitizePath(p) {
    return p
      .split('/')
      .map(sanitizeSegment)
      .filter(Boolean)
      .join('/');
  }

  function extFromUrl(url, fallback = 'jpg') {
    try {
      const path = new URL(url).pathname;
      const m = path.match(/\.([a-z0-9]{2,5})$/i);
      if (m) return m[1].toLowerCase();
    } catch {
      /* ignore */
    }
    return fallback;
  }

  function buildFilename(item, index, total, url) {
    const pad = String(total).length < 3 ? 3 : String(total).length;
    const today = new Date().toISOString().slice(0, 10);
    const ext = extFromUrl(url);
    // Sanitise each token BEFORE substitution. A "/" in an album name would
    // otherwise be read as a folder separator and scatter the album across
    // two directories.
    const raw = FILENAME_TEMPLATE.replaceAll(
      '{album}',
      sanitizeSegment(state.album?.title || 'Facebook album')
    )
      .replaceAll('{index}', String(index + 1).padStart(pad, '0'))
      .replaceAll('{fbid}', sanitizeSegment(item.fbid))
      .replaceAll('{date}', today)
      .replaceAll('{ext}', ext);
    const cleaned = sanitizePath(raw);
    return cleaned || `Facebook Albums/${item.fbid}.${ext}`;
  }

  /** Quick mode: try to talk the CDN out of the thumbnail crop. The signed
   *  original is kept as a fallback because stripping params sometimes
   *  invalidates the URL signature. */
  function quickCandidates(thumb) {
    if (!thumb) return [];
    const out = [];
    try {
      const u = new URL(thumb);
      if (u.searchParams.has('stp')) {
        u.searchParams.delete('stp');
        out.push(u.toString());
      }
    } catch {
      /* ignore */
    }
    out.push(thumb);
    return [...new Set(out)];
  }

  /* ------------------------------------------------------------ settings */

  async function loadSettings() {
    const stored = await chrome.storage.local.get('settings');
    state.settings = { ...DEFAULTS, ...(stored.settings || {}) };
    el.setQuality.value = state.settings.quality;
    el.setDelay.value = state.settings.requestDelayMs;
    el.setConcurrency.value = state.settings.concurrency;
  }

  async function saveSettings() {
    const delay = parseInt(el.setDelay.value, 10);
    const conc = parseInt(el.setConcurrency.value, 10);
    state.settings = {
      ...state.settings,
      quality: el.setQuality.value === 'quick' ? 'quick' : 'original',
      requestDelayMs: Number.isFinite(delay) ? Math.min(10000, Math.max(0, delay)) : DEFAULTS.requestDelayMs,
      concurrency: Number.isFinite(conc) ? Math.min(8, Math.max(1, conc)) : DEFAULTS.concurrency,
    };
    await chrome.storage.local.set({ settings: state.settings });
  }

  /* --------------------------------------------------------- tab plumbing */

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab || null;
  }

  async function ensureContentScript(tabId) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { target: 'content', cmd: 'PING' });
      if (r?.ok) return true;
    } catch {
      /* not injected yet */
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['src/content/overlay.css'],
    });
    // Give the listener a tick to register.
    await sleep(120);
    return true;
  }

  function send(cmd, extra = {}) {
    return chrome.tabs.sendMessage(state.tabId, { target: 'content', cmd, ...extra });
  }

  async function refreshContext() {
    const tab = await activeTab();
    if (!tab || !/^https:\/\/([a-z0-9-]+\.)?facebook\.com\//i.test(tab.url || '')) {
      state.tabId = null;
      el.title.textContent = 'No album open';
      el.context.textContent = 'Open a Facebook album in this tab, then scan.';
      el.btnScan.disabled = true;
      return;
    }

    state.tabId = tab.id;
    el.btnScan.disabled = false;

    try {
      await ensureContentScript(tab.id);
      const r = await send('CONTEXT');
      if (r?.ok) {
        state.album = r.album;
        el.title.textContent = r.album.title;
        const bits = [];
        if (r.album.kind === 'photo') bits.push('single photo view');
        else if (r.album.kind === 'group') bits.push('group photos');
        else bits.push('album');
        if (r.album.stated) bits.push(`${r.album.stated} photos listed`);
        el.context.textContent = bits.join(' · ');
        if (r.album.kind === 'photo') {
          notify(
            'This is the single-photo viewer. Go back to the album grid to get every photo.',
            'info'
          );
        } else {
          notify('');
        }
      }
    } catch (e) {
      el.context.textContent = 'Reload the Facebook tab, then scan.';
      notify(`Could not reach the page: ${e.message}`, 'error');
    }
  }

  /* ---------------------------------------------------------------- scan */

  function showStage(name) {
    el.stageScan.hidden = name !== 'idle';
    el.stageScanning.hidden = name !== 'scanning';
    el.stageResults.hidden = name !== 'results';
    el.actionbar.hidden = name !== 'results';
  }

  async function runScan() {
    if (!state.tabId) return;
    notify('');
    showStage('scanning');
    el.scanFound.textContent = '0';
    el.scanBar.classList.add('indeterminate');

    try {
      await ensureContentScript(state.tabId);
      const res = await send('SCAN', {
        opts: {
          settleMs: state.settings.settleMs,
          maxIdleRounds: state.settings.maxIdleRounds,
        },
      });

      if (!res?.ok) throw new Error(res?.error || 'Scan failed');

      state.album = res.album;
      el.title.textContent = res.album.title;

      state.items = res.items.map((it) => ({
        ...it,
        selected: true,
        status: 'pending',
        url: null,
        error: null,
      }));

      renderGrid();
      showStage('results');

      const stated = res.album.stated;
      if (stated && state.items.length < stated) {
        notify(
          `Found ${state.items.length} of the ${stated} photos Facebook lists. Scan again to pick up the rest, or raise the scroll pause in Settings.`,
          'info'
        );
      } else if (!state.items.length) {
        notify(
          'No photos found. Make sure the album grid is on screen and the tab is not minimised, then scan again.',
          'error'
        );
      } else {
        notify('');
      }
    } catch (e) {
      showStage('idle');
      notify(`Scan failed: ${e.message}`, 'error');
    } finally {
      el.scanBar.classList.remove('indeterminate');
    }
  }

  /* -------------------------------------------------------------- render */

  function renderGrid() {
    el.grid.replaceChildren();
    const frag = document.createDocumentFragment();

    state.items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'cell' + (item.selected ? ' on' : '');
      li.tabIndex = 0;
      li.dataset.index = String(i);
      li.dataset.state = item.status;
      li.setAttribute('role', 'checkbox');
      li.setAttribute('aria-checked', String(item.selected));
      li.title = `Photo ${item.fbid}`;

      if (item.thumb) {
        const img = document.createElement('img');
        img.src = item.thumb;
        img.alt = item.alt || `Photo ${i + 1}`;
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        li.appendChild(img);
      } else {
        const blank = document.createElement('div');
        blank.className = 'blank';
        blank.textContent = 'no preview';
        li.appendChild(blank);
      }

      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(i + 1);
      li.appendChild(idx);

      const dot = document.createElement('span');
      dot.className = 'state';
      li.appendChild(dot);

      frag.appendChild(li);
    });

    el.grid.appendChild(frag);
    updateSummary();
  }

  function updateCell(i) {
    const cell = el.grid.querySelector(`[data-index="${i}"]`);
    if (!cell) return;
    const item = state.items[i];
    cell.dataset.state = item.status;
    cell.classList.toggle('on', item.selected);
    cell.setAttribute('aria-checked', String(item.selected));
    if (item.error) cell.title = `Photo ${item.fbid} — ${item.error}`;
  }

  function selectedItems() {
    return state.items.filter((i) => i.selected);
  }

  function updateSummary() {
    const total = state.items.length;
    const sel = selectedItems().length;
    const done = state.items.filter((i) => i.status === 'done').length;
    const failed = state.items.filter((i) => i.status === 'failed').length;

    let text = `${sel} of ${total} selected`;
    if (done) text += ` · ${done} saved`;
    if (failed) text += ` · ${failed} failed`;
    el.resultSummary.textContent = text;

    el.btnFiles.disabled = state.running || sel === 0;
    el.btnZip.disabled = state.running || sel === 0;
    el.btnRetry.hidden = state.running || failed === 0;
  }

  el.grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const i = Number(cell.dataset.index);
    state.items[i].selected = !state.items[i].selected;
    updateCell(i);
    updateSummary();
  });

  el.grid.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    e.preventDefault();
    const i = Number(cell.dataset.index);
    state.items[i].selected = !state.items[i].selected;
    updateCell(i);
    updateSummary();
  });

  /* ------------------------------------------------------------ resolving */

  async function resolveOne(item) {
    if (state.settings.quality === 'quick') {
      const cands = quickCandidates(item.thumb);
      if (!cands.length) throw new Error('No image URL on this thumbnail');
      return cands;
    }

    let delay = state.settings.requestDelayMs;
    let lastError;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (state.cancelRequested) throw new Error('Cancelled');
      try {
        const r = await send('RESOLVE', { item: { fbid: item.fbid, set: item.set } });
        if (!r?.ok) throw new Error(r?.error || 'Could not read the photo page');
        const cands = [r.url, ...quickCandidates(item.thumb)];
        return [...new Set(cands.filter(Boolean))];
      } catch (e) {
        lastError = e;
        delay = Math.min(8000, Math.round(delay * 1.8) + 400);
        await sleep(delay);
      }
    }
    throw lastError || new Error('Could not resolve this photo');
  }

  /* ------------------------------------------------------------ downloads */

  function downloadAndWait(url, filename) {
    return new Promise((resolve, reject) => {
      let downloadId = null;
      let settled = false;

      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        chrome.downloads.onChanged.removeListener(onChanged);
        clearTimeout(timer);
        fn(arg);
      };

      const onChanged = (delta) => {
        if (downloadId === null || delta.id !== downloadId) return;
        if (delta.state?.current === 'complete') finish(resolve, downloadId);
        if (delta.state?.current === 'interrupted') {
          finish(reject, new Error(delta.error?.current || 'Download interrupted'));
        }
      };

      const timer = setTimeout(
        () => finish(reject, new Error('Download timed out after 90s')),
        90000
      );

      chrome.downloads.onChanged.addListener(onChanged);

      chrome.downloads.download(
        { url, filename, conflictAction: 'uniquify', saveAs: false },
        (id) => {
          if (chrome.runtime.lastError) {
            finish(reject, new Error(chrome.runtime.lastError.message));
            return;
          }
          downloadId = id;
        }
      );
    });
  }

  async function trySequential(urls, filename) {
    let lastError;
    for (const url of urls) {
      try {
        await downloadAndWait(url, filename);
        return url;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('All image URLs failed');
  }

  async function fetchBytes(urls) {
    let lastError;
    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length < 512) throw new Error('Image came back empty');
        return { bytes: buf, url };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('Could not fetch the image');
  }

  /* ----------------------------------------------------------------- jobs */

  function setRunning(on) {
    state.running = on;
    state.cancelRequested = false;
    el.btnCancel.hidden = !on;
    el.progress.hidden = !on;
    el.btnScan.disabled = on;
    el.btnRescan.disabled = on;
    updateSummary();
  }

  function jobProgress(done, total, note = '') {
    const pct = total ? Math.round((done / total) * 100) : 0;
    el.jobBar.style.width = `${pct}%`;
    el.jobText.textContent = note || `${done} of ${total} photos`;
  }

  async function runFilesJob(targets) {
    setRunning(true);
    notify('');

    const total = targets.length;
    let done = 0;
    let queue = targets.map((item) => state.items.indexOf(item));

    const worker = async () => {
      while (queue.length) {
        if (state.cancelRequested) return;
        const i = queue.shift();
        const item = state.items[i];
        item.status = 'working';
        item.error = null;
        updateCell(i);

        try {
          const urls = await resolveOne(item);
          const filename = buildFilename(item, i, state.items.length, urls[0]);
          const used = await trySequential(urls, filename);
          item.url = used;
          item.status = 'done';
        } catch (e) {
          item.status = state.cancelRequested ? 'pending' : 'failed';
          item.error = String(e.message || e);
        }

        updateCell(i);
        done++;
        jobProgress(done, total);
        updateSummary();

        if (state.settings.quality === 'original' && queue.length) {
          await sleep(state.settings.requestDelayMs);
        }
      }
    };

    const lanes = Math.min(state.settings.concurrency, Math.max(1, total));
    await Promise.all(Array.from({ length: lanes }, worker));

    setRunning(false);
    const failed = state.items.filter((i) => i.status === 'failed').length;
    if (state.cancelRequested) notify('Stopped. Selected photos that finished are saved.', 'info');
    else if (failed) notify(`${total - failed} saved, ${failed} failed. Retry the failed ones below.`, 'info');
    else notify(`Saved ${total} photos to your downloads folder.`, 'good');
  }

  async function runZipJob(targets) {
    if (targets.length > ZIP_WARN_AT) {
      const ok = confirm(
        `${targets.length} photos have to be held in memory to build one ZIP. ` +
          `Above about ${ZIP_WARN_AT} photos, "Save as files" is safer. Build the ZIP anyway?`
      );
      if (!ok) return;
    }

    setRunning(true);
    notify('');

    const zip = new ZipWriter();
    const total = targets.length;
    let done = 0;
    let failed = 0;
    let objectUrl = null;

    try {
      for (const item of targets) {
        if (state.cancelRequested) break;
        const i = state.items.indexOf(item);
        item.status = 'working';
        item.error = null;
        updateCell(i);

        try {
          const urls = await resolveOne(item);
          const { bytes, url } = await fetchBytes(urls);
          const full = buildFilename(item, i, state.items.length, url);
          // Inside a ZIP the album folder is the ZIP itself, so drop the
          // leading "Facebook Albums/" style prefix and keep the last segment.
          const inner = full.split('/').slice(-1)[0];
          zip.add(inner, bytes);
          item.status = 'done';
        } catch (e) {
          item.status = 'failed';
          item.error = String(e.message || e);
          failed++;
        }

        updateCell(i);
        done++;
        jobProgress(done, total, `${done} of ${total} collected`);
        updateSummary();

        if (state.settings.quality === 'original' && done < total) {
          await sleep(state.settings.requestDelayMs);
        }
      }

      const packed = total - failed;
      if (!packed) {
        notify('Nothing was collected, so no ZIP was written.', 'error');
        return;
      }

      jobProgress(total, total, 'Writing the ZIP…');
      const blob = zip.finish();
      objectUrl = URL.createObjectURL(blob);
      const name = `${sanitizeSegment(state.album?.title || 'Facebook album')}.zip`;

      // Chrome sometimes drops the filename passed to downloads.download()
      // for blob: URLs and names the file after the blob's own UUID instead
      // (crbug 892133). Tell the service worker's onDeterminingFilename
      // safety net which name to enforce for this specific download before
      // starting it.
      await chrome.runtime.sendMessage({ target: 'sw', cmd: 'EXPECT_ZIP_NAME', url: objectUrl, filename: name });

      await downloadAndWait(objectUrl, name);

      notify(
        failed
          ? `ZIP saved with ${packed} photos. ${failed} failed and were left out.`
          : `ZIP saved with ${packed} photos.`,
        failed ? 'info' : 'good'
      );
    } catch (e) {
      notify(`ZIP failed: ${e.message}`, 'error');
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      setRunning(false);
    }
  }

  /* -------------------------------------------------------------- wiring */

  el.btnScan.addEventListener('click', runScan);
  el.btnRescan.addEventListener('click', runScan);

  el.btnStopScan.addEventListener('click', async () => {
    try {
      await send('STOP');
    } catch {
      /* ignore */
    }
  });

  el.btnAll.addEventListener('click', () => {
    state.items.forEach((it, i) => {
      it.selected = true;
      updateCell(i);
    });
    updateSummary();
  });

  el.btnNone.addEventListener('click', () => {
    state.items.forEach((it, i) => {
      it.selected = false;
      updateCell(i);
    });
    updateSummary();
  });

  el.btnFiles.addEventListener('click', async () => {
    await saveSettings();
    const targets = selectedItems();
    if (targets.length) runFilesJob(targets);
  });

  el.btnZip.addEventListener('click', async () => {
    await saveSettings();
    const targets = selectedItems();
    if (targets.length) runZipJob(targets);
  });

  el.btnCancel.addEventListener('click', () => {
    state.cancelRequested = true;
    el.jobText.textContent = 'Finishing the photos already in flight…';
  });

  el.btnRetry.addEventListener('click', async () => {
    await saveSettings();
    const targets = state.items.filter((i) => i.status === 'failed');
    targets.forEach((t) => {
      t.status = 'pending';
      t.error = null;
    });
    renderGrid();
    if (targets.length) runFilesJob(targets);
  });

  el.btnResetSettings.addEventListener('click', async () => {
    state.settings = { ...DEFAULTS };
    await chrome.storage.local.set({ settings: state.settings });
    el.setQuality.value = state.settings.quality;
    el.setDelay.value = state.settings.requestDelayMs;
    el.setConcurrency.value = state.settings.concurrency;
    notify('Settings back to defaults.', 'good');
  });

  for (const input of [el.setQuality, el.setDelay, el.setConcurrency]) {
    input.addEventListener('change', saveSettings);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'SCAN_PROGRESS') return;
    el.scanFound.textContent = String(msg.found);
    el.scanLabel.textContent = msg.stated
      ? `of ${msg.stated} photos found`
      : 'photos found';
  });

  chrome.tabs.onActivated.addListener(() => {
    if (!state.running) refreshContext();
  });

  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (!state.running && tabId === state.tabId && info.status === 'complete') {
      refreshContext();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.running) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  (async function init() {
    await loadSettings();
    await refreshContext();
    showStage('idle');
  })();
})();
