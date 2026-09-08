/**
 * Dynamic font loader utility
 *
 * loadFont(url)
 *   Injects a <link rel="stylesheet"> into <head> for the given font URL.
 *   Subsequent calls with the same URL are no-ops (deduplication via
 *   a module-level Set and a DOM attribute selector).
 *
 * Usage:
 *   import { loadFont } from './font-loader.js';
 *   loadFont('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');
 *
 * Or inline in the card bundle:
 *   loadFont(config.font_url);
 */

const _loadedFontUrls = new Set();

/**
 * @param {string} url - Full stylesheet URL (Google Fonts, local, etc.)
 * @returns {void}
 */
function loadFont(url) {
  if (!url || typeof url !== 'string') return;

  // Normalise: trim whitespace; reject non-http(s) schemes.
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    console.warn('[word-clock] loadFont: rejected non-HTTP(S) URL:', trimmed);
    return;
  }

  // Fast path: already tracked in this module session.
  if (_loadedFontUrls.has(trimmed)) return;

  // DOM check: survive page navigations / multiple module loads by also
  // querying the live DOM before injecting.
  const existing = document.head.querySelector(
    `link[rel="stylesheet"][href="${CSS.escape ? trimmed : trimmed.replace(/"/g, '%22')}"]`
  );
  if (existing) {
    _loadedFontUrls.add(trimmed); // sync the in-memory set
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = trimmed;
  document.head.appendChild(link);
  _loadedFontUrls.add(trimmed);
}
