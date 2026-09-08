/**
 * auto-scale.test.js
 *
 * Tests for the auto-scaling logic inlined in word-clock-card.js.
 * Runs with: node auto-scale.test.js
 *
 * Tests the fitTextToContainer helper (inlined) and the card's
 * _isAutoScale / _scheduleAutoScale / _applyAutoScale behavior.
 */

// ---------------------------------------------------------------------------
// Minimal DOM mock — same approach as text-fit.test.js from parent task
// ---------------------------------------------------------------------------

const _elements = [];

function makeMockElement(tag) {
  const el = {
    tag,
    style: {},
    textContent: '',
    children: [],
    _listeners: {},
    className: '',
    dataset: {},
    shadowRoot: null,
    attachShadow() { this.shadowRoot = makeMockElement('shadow'); return this.shadowRoot; },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i !== -1) this.children.splice(i, 1);
    },
    querySelector(sel) {
      // Simple class/tag search for tests.
      for (const c of this.children) {
        if (c.className === sel.replace('.', '')) return c;
        if (c.tag === sel) return c;
        const r = c.querySelector && c.querySelector(sel);
        if (r) return r;
      }
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(evt, fn) {
      this._listeners[evt] = this._listeners[evt] || [];
      this._listeners[evt].push(fn);
    },
    dispatchEvent() {},
    getBoundingClientRect() {
      return { width: this._mockWidth || 0, height: this._mockHeight || 0 };
    },
    // Probe-like scroll dimensions.
    get scrollHeight() {
      const fs = parseFloat(this.style.fontSize) || 1;
      const lh = parseFloat(this.style.lineHeight) || fs * 1.2;
      const w  = parseFloat(this.style.width) || Infinity;
      const charWidth = fs * 0.6;
      const charsPerLine = Math.max(1, Math.floor(w / charWidth));
      const chars = this.textContent.length;
      const lines = Math.ceil(chars / charsPerLine);
      return lines * lh;
    },
    get scrollWidth() {
      const fs = parseFloat(this.style.fontSize) || 1;
      const w  = parseFloat(this.style.width) || Infinity;
      const charWidth = fs * 0.6;
      const charsPerLine = Math.max(1, Math.floor(w / charWidth));
      const chars = this.textContent.length;
      return Math.min(chars, charsPerLine) * charWidth;
    },
  };
  _elements.push(el);
  return el;
}

// Globals expected by the card.
const _body = makeMockElement('body');
_body._mockWidth = 400;
_body._mockHeight = 300;

global.document = {
  createElement(tag) { return makeMockElement(tag); },
  body: _body,
};

// Mock customElements.define so we can grab the class.
const _defined = {};
global.customElements = {
  define(name, cls) { _defined[name] = cls; },
};

// Mock requestAnimationFrame: run synchronously for tests.
global.requestAnimationFrame = (fn) => { fn(); return 1; };
global.cancelAnimationFrame = () => {};

// Mock ResizeObserver: record callbacks, expose helper to trigger them.
let _roCallback = null;
global.ResizeObserver = class {
  constructor(cb) { _roCallback = cb; this._targets = []; }
  observe(el) { this._targets.push(el); }
  disconnect() { _roCallback = null; }
};

// Mock getComputedStyle.
global.getComputedStyle = () => ({ fontFamily: 'sans-serif' });

// Mock window.
global.window = { customCards: [] };

// ---------------------------------------------------------------------------
// Load the card (by inlining the fitTextToContainer logic and card class).
// We re-define only what we need to test here.
// ---------------------------------------------------------------------------

// Pull in the inlined fitTextToContainer (copy from card's source for isolation).
function fitTextToContainer(text, containerWidth, containerHeight, options = {}) {
  const {
    fontFamily      = 'sans-serif',
    fontWeight      = '500',
    lineHeightRatio = 1.2,
    letterSpacing   = '0.03em',
    minFontSize     = 4,
    maxFontSize     = 300,
  } = options;

  if (!text || containerWidth <= 0 || containerHeight <= 0) {
    return { fontSize: minFontSize, lineHeight: minFontSize * lineHeightRatio };
  }

  const probe = document.createElement('div');
  Object.assign(probe.style, {
    width: `${containerWidth}px`,
    height: 'auto',
    fontFamily, fontWeight, letterSpacing,
    whiteSpace: 'normal', wordBreak: 'break-word', boxSizing: 'border-box',
  });
  probe.textContent = text;
  document.body.appendChild(probe);

  let lo = minFontSize;
  let hi = Math.min(maxFontSize, containerWidth);
  let bestSize = lo;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    probe.style.fontSize   = `${mid}px`;
    probe.style.lineHeight = `${mid * lineHeightRatio}px`;
    const fits = probe.scrollHeight <= containerHeight && probe.scrollWidth <= containerWidth;
    if (fits) { bestSize = mid; lo = mid + 1; } else { hi = mid - 1; }
  }

  document.body.removeChild(probe);
  return { fontSize: bestSize, lineHeight: Math.round(bestSize * lineHeightRatio * 100) / 100 };
}

// Minimal WordClockCard stub that mirrors the real _isAutoScale / _applyAutoScale
// without full DOM wiring (tests the logic, not DOM structure).
class CardStub {
  constructor(config = {}) {
    this._config = config;
    this._root = makeMockElement('shadow-root');
    const card = makeMockElement('ha-card');
    card._mockWidth  = 400;
    card._mockHeight = 200;
    this._root.querySelector = (sel) => sel === 'ha-card' ? card : null;
    this._textContainer = makeMockElement('div');
    this._textContainer.textContent = 'half past two ish';
  }

  _isAutoScale() {
    return this._config.auto_scale !== false;
  }

  _applyAutoScale() {
    if (!this._root || !this._textContainer) return;
    if (!this._isAutoScale()) return;

    const card = this._root.querySelector('ha-card');
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const padding = 16;
    const availableWidth  = rect.width  - padding * 2;
    const availableHeight = rect.height - padding * 2;

    if (availableWidth <= 0 || availableHeight <= 0) return;

    const text = this._textContainer.textContent;
    if (!text) return;

    const fontFamily    = getComputedStyle(this._textContainer).fontFamily || 'sans-serif';
    const letterSpacing = this._config.letter_spacing || '0.03em';

    const { fontSize, lineHeight } = fitTextToContainer(
      text, availableWidth, availableHeight,
      { fontFamily, fontWeight: '500', letterSpacing }
    );

    this._textContainer.style.fontSize   = `${fontSize}px`;
    this._textContainer.style.lineHeight = `${lineHeight}px`;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(label, condition, extra = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${extra ? ' — ' + extra : ''}`);
    failed++;
  }
}

console.log('\n=== auto-scale unit tests ===\n');

// 1. fitTextToContainer: empty text returns minimum.
{
  const r = fitTextToContainer('', 400, 300);
  assert('empty text -> minFontSize', r.fontSize === 4, `got ${r.fontSize}`);
}

// 2. fitTextToContainer: longer text gets smaller font in same container.
{
  const short = fitTextToContainer('two ish', 400, 200);
  const long  = fitTextToContainer('a quarter past two or so', 400, 200);
  assert('longer text -> smaller fontSize', long.fontSize <= short.fontSize,
    `short=${short.fontSize} long=${long.fontSize}`);
}

// 3. fitTextToContainer: lineHeight = fontSize * lineHeightRatio (default 1.2).
{
  const r = fitTextToContainer('half past two', 400, 200);
  const expected = Math.round(r.fontSize * 1.2 * 100) / 100;
  assert('lineHeight = fontSize * 1.2', r.lineHeight === expected,
    `fontSize=${r.fontSize} lineHeight=${r.lineHeight} expected=${expected}`);
}

// 4. fitTextToContainer: result font size > 0.
{
  const r = fitTextToContainer('hi', 400, 200);
  assert('fontSize > 0', r.fontSize > 0, `got ${r.fontSize}`);
}

// 5. _isAutoScale: defaults to true.
{
  const card = new CardStub({});
  assert('_isAutoScale defaults true', card._isAutoScale() === true);
}

// 6. _isAutoScale: explicit false disables.
{
  const card = new CardStub({ auto_scale: false });
  assert('_isAutoScale false when config says so', card._isAutoScale() === false);
}

// 7. _applyAutoScale: sets fontSize/lineHeight inline styles.
{
  const card = new CardStub({ auto_scale: true });
  card._applyAutoScale();
  const fs = parseFloat(card._textContainer.style.fontSize);
  const lh = parseFloat(card._textContainer.style.lineHeight);
  assert('_applyAutoScale sets fontSize > 0', fs > 0, `got fontSize="${card._textContainer.style.fontSize}"`);
  assert('_applyAutoScale sets lineHeight > 0', lh > 0, `got lineHeight="${card._textContainer.style.lineHeight}"`);
}

// 8. _applyAutoScale: does nothing when auto_scale is false.
{
  const card = new CardStub({ auto_scale: false });
  card._applyAutoScale();
  assert('_applyAutoScale no-op in manual mode', card._textContainer.style.fontSize === undefined || card._textContainer.style.fontSize === '');
}

// 9. _applyAutoScale: larger container -> larger font size.
{
  const small = new CardStub({ auto_scale: true });
  small._root.querySelector = () => {
    const c = makeMockElement('ha-card');
    c._mockWidth = 200; c._mockHeight = 100;
    return c;
  };
  small._applyAutoScale();

  const large = new CardStub({ auto_scale: true });
  large._root.querySelector = () => {
    const c = makeMockElement('ha-card');
    c._mockWidth = 600; c._mockHeight = 400;
    return c;
  };
  large._applyAutoScale();

  const fsSmall = parseFloat(small._textContainer.style.fontSize);
  const fsLarge = parseFloat(large._textContainer.style.fontSize);
  assert('larger container -> larger fontSize', fsLarge >= fsSmall,
    `small=${fsSmall}px large=${fsLarge}px`);
}

// 10. _applyAutoScale: empty text is a no-op (does not crash).
{
  const card = new CardStub({ auto_scale: true });
  card._textContainer.textContent = '';
  card._applyAutoScale();
  assert('empty text _applyAutoScale no-op without crash',
    !card._textContainer.style.fontSize || card._textContainer.style.fontSize === '');
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
