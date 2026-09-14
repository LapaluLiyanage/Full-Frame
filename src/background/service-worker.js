/* Facebook Album Download Kit — service worker
 *
 * Deliberately tiny. MV3 service workers get killed at unpredictable moments,
 * so no job state and no download loop lives here. The side panel is a real
 * document that stays alive while it is open, and it drives the work.
 * This file only handles: opening the panel, and first-run defaults.
 */

const DEFAULTS = {
  quality: 'original', // 'original' | 'quick'
  requestDelayMs: 700,
  concurrency: 3,
  settleMs: 900,
  maxIdleRounds: 4,
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({
    settings: { ...DEFAULTS, ...(stored.settings || {}) },
  });
});

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.warn('[FBADK] setPanelBehavior:', e));

// Chrome has a long-standing bug where a download started from a blob: URL
// sometimes ignores the filename passed to downloads.download() and names
// the file after the UUID baked into the blob URL instead (crbug 892133).
// onDeterminingFilename fires right before the file is saved and always
// wins, so it is used here as a safety net for our own ZIP downloads. The
// side panel tells us the intended name per blob URL just before it starts
// the download (EXPECT_ZIP_NAME below); scoped tightly (this extension's
// downloads, application/zip only, a name we were actually told to expect)
// so it never touches anything the user downloads themselves.
const expectedZipNames = new Map();

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (item.byExtensionId !== chrome.runtime.id || item.mime !== 'application/zip') return;
  const filename = expectedZipNames.get(item.url);
  if (!filename) return;
  expectedZipNames.delete(item.url);
  suggest({ filename, conflictAction: 'uniquify' });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'sw') return;

  if (msg.cmd === 'OPEN_PANEL') {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    const target = windowId != null ? { windowId } : tabId != null ? { tabId } : null;

    if (!target) {
      sendResponse({ ok: false, error: 'No tab context' });
      return false;
    }

    // Call open() as the very first synchronous thing this listener does —
    // Chrome ties the "user gesture" it requires to how directly the call
    // follows the click that triggered this message. Chrome also has a known
    // bug (crbug 355266358) where the very first call after a click spuriously
    // throws that gesture error even though one just happened; a second call
    // right after tends to succeed, so retry once before giving up.
    chrome.sidePanel.open(target).then(
      () => sendResponse({ ok: true }),
      () => {
        chrome.sidePanel.open(target).then(
          () => sendResponse({ ok: true }),
          (e) => sendResponse({ ok: false, error: String(e?.message || e) })
        );
      }
    );
    return true;
  }

  if (msg.cmd === 'DEFAULTS') {
    sendResponse({ ok: true, defaults: DEFAULTS });
    return false;
  }

  if (msg.cmd === 'EXPECT_ZIP_NAME') {
    expectedZipNames.set(msg.url, msg.filename);
    sendResponse({ ok: true });
    return false;
  }
});
