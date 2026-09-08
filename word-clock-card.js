/**
 * Word Clock Card for Home Assistant Lovelace
 *
 * Renders a natural language string that spell out the
 * current approximate time, using the exact time-to-word mapping from the
 * Twelveish (redux) Wear OS watch face:
 *   https://github.com/psychowood/Twelveish-redux
 *   (GPLv3, English locale word set: WordClockTask.java + MyWatchFace.java)
 *
 * Twelveish itself is a flowing-text watch face (prefix + hour + suffix),
 * not a grid. This card lays the same exact word set out as a static grid
 * (QLOCKTWO-style) and highlights the words that make up the composed
 * phrase for the current 5-minute bucket, updating once a minute.
 *
 * No Home Assistant integration/entity is required — the card reads the
 * browser's clock by default. Optionally point it at a time-providing
 * entity via `time_entity` (state must be an ISO datetime or HH:MM:SS/HH:MM
 * string, e.g. sensor.time or sensor.date_time_iso).
 */

// ---------------------------------------------------------------------------
// Twelveish (redux) English word-clock mapping — ported verbatim from
// phone/src/main/res/values/strings.xml + WordClockTask.java + MyWatchFace.java
// ---------------------------------------------------------------------------

// ExactTimes (English), 1-indexed by 12-hour hourText (1..12).
const HOUR_WORDS = [
  '', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
];

// Prefixes (English), indexed by index = floor(minutes / 5), 0..11.
const PREFIXES = [
  '', '',
  'a quarter past', 'a quarter past',
  'almost half past', 'around half past',
  'half past', 'half past',
  'a quarter to', 'a quarter to',
  'approaching', 'almost',
];

// Suffixes (English), indexed by index = floor(minutes / 5), 0..11.
const SUFFIXES = [
  'ish', 'or so',
  '', 'or so',
  '', '',
  'ish', 'or so',
  '', 'or so',
  '', '',
];

// TimeShift: when true the hour word refers to the next hour (e.g. "a quarter to three").
const TIME_SHIFT = [
  false, false,
  false, false,
  false, false,
  false, false,
  true, true,
  true, true,
];

function computeWords(date) {
  const hours   = date.getHours() % 12 || 12;
  const minutes = date.getMinutes();
  const index   = Math.floor(minutes / 5);

  let hourText = TIME_SHIFT[index] ? (hours % 12) + 1 : hours;
  if (hourText === 0) hourText = 12;

  const words = [];
  const prefix = PREFIXES[index];
  const suffix = SUFFIXES[index];

  if (prefix) words.push(...prefix.split(' '));
  words.push(HOUR_WORDS[hourText]);
  if (suffix) words.push(...suffix.split(' '));

  return words;
}

// ---------------------------------------------------------------------------
// Capitalization helper
// ---------------------------------------------------------------------------
function applyCapitalization(text, style) {
  switch (style) {
    case 'upper':    return text.toUpperCase();
    case 'lower':    return text.toLowerCase();
    case 'title':    return text.replace(/\b\w/g, c => c.toUpperCase());
    case 'sentence': return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    default:         return text.toUpperCase(); // match original default
  }
}

// ---------------------------------------------------------------------------
// fitTextToContainer — binary-search based text measurement
// (ported from text-fit.js, inlined for single-file Lovelace compatibility)
//
// @param {string} text
// @param {number} containerWidth  – px
// @param {number} containerHeight – px
// @param {object} [options]
// @returns {{ fontSize: number, lineHeight: number }}
// ---------------------------------------------------------------------------
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

  // Create a hidden probe element that mirrors the card's text container.
  const probe = document.createElement('div');
  Object.assign(probe.style, {
    position:      'fixed',
    top:           '-9999px',
    left:          '-9999px',
    visibility:    'hidden',
    pointerEvents: 'none',
    // Fix the width so the browser wraps exactly as the real container would.
    width:         `${containerWidth}px`,
    // Do NOT fix height — let it grow; we check scrollHeight vs limit.
    height:        'auto',
    overflow:      'visible',
    // Typography
    fontFamily,
    fontWeight,
    letterSpacing,
    whiteSpace:    'normal',
    wordBreak:     'break-word',
    boxSizing:     'border-box',
  });
  probe.textContent = text;
  document.body.appendChild(probe);

  let lo = minFontSize;
  let hi = Math.min(maxFontSize, containerWidth); // font > container width never fits
  let bestSize = lo;

  // Binary search: O(log N) DOM reflows where N = hi - lo.
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1; // integer average, avoids float drift
    probe.style.fontSize   = `${mid}px`;
    probe.style.lineHeight = `${mid * lineHeightRatio}px`;

    // scrollHeight reflects actual rendered height including wrapped lines.
    const fits = probe.scrollHeight <= containerHeight && probe.scrollWidth <= containerWidth;

    if (fits) {
      bestSize = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  document.body.removeChild(probe);

  return {
    fontSize:   bestSize,
    lineHeight: Math.round(bestSize * lineHeightRatio * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// WordClockCard
// ---------------------------------------------------------------------------

class WordClockCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._buildDom();
    this._updateStyles();
    // If auto_scale toggled on/off, re-run scaling immediately.
    this._scheduleAutoScale();
  }

  _isAutoScale() {
    // auto_scale defaults to true; explicit false disables it.
    return this._config.auto_scale !== false;
  }

  _updateStyles() {
    if (!this._root) return;
    const card = this._root.querySelector('ha-card');
    if (!card) return;

    if (this._config.background_color) {
      card.style.backgroundColor = this._config.background_color;
    } else {
      card.style.backgroundColor = '';
    }

    // font_size / line_spacing CSS vars only apply in manual mode.
    // In auto_scale mode the inline styles on _textContainer take precedence,
    // so we leave the vars alone as non-conflicting fallbacks.
    if (this._config.font_size) {
      card.style.setProperty('--word-clock-font-size', this._config.font_size);
    } else {
      card.style.removeProperty('--word-clock-font-size');
    }
    if (this._config.font_family) {
      card.style.setProperty('--word-clock-font-family', this._config.font_family);
    } else {
      card.style.removeProperty('--word-clock-font-family');
    }
    if (this._config.font_color) {
      card.style.setProperty('--word-clock-font-color', this._config.font_color);
    } else {
      card.style.removeProperty('--word-clock-font-color');
    }
    if (this._config.letter_spacing) {
      card.style.setProperty('--word-clock-letter-spacing', this._config.letter_spacing);
    } else {
      card.style.removeProperty('--word-clock-letter-spacing');
    }
    if (this._config.line_spacing) {
      card.style.setProperty('--word-clock-line-spacing', this._config.line_spacing);
    } else {
      card.style.removeProperty('--word-clock-line-spacing');
    }
    const VALID_ORIENTATIONS = new Set(['left', 'center', 'right', 'justify']);
    if (this._config.orientation && VALID_ORIENTATIONS.has(this._config.orientation)) {
      card.style.setProperty('--word-clock-orientation', this._config.orientation);
    } else {
      card.style.removeProperty('--word-clock-orientation');
    }

    // When switching from auto_scale to manual, clear any inline overrides
    // that the auto-scaler had applied so the CSS vars take effect again.
    if (!this._isAutoScale() && this._textContainer) {
      this._textContainer.style.fontSize   = '';
      this._textContainer.style.lineHeight = '';
    }
  }

  getCardSize() {
    return 4;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._timer) {
      this._scheduleTick();
    }
    this._render();
  }

  connectedCallback() {
    this._scheduleTick();
    this._attachResizeObserver();
    this._render();
  }

  disconnectedCallback() {
    if (this._timer) {
      clearTimeout(this._timer);
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._rafHandle) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }
  }

  _scheduleTick() {
    // Align first tick to the next minute boundary, then tick every 60s.
    const now = new Date();
    const msToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    this._timer = setTimeout(() => {
      this._render();
      this._timer = setInterval(() => this._render(), 60000);
    }, msToNextMinute);
  }

  _currentDate() {
    const entityId = this._config && this._config.time_entity;
    if (entityId && this._hass && this._hass.states[entityId]) {
      const raw = this._hass.states[entityId].state;
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) return parsed;
      // Fall back to HH:MM[:SS] style strings against today's date.
      const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
      if (match) {
        const d = new Date();
        d.setHours(Number(match[1]), Number(match[2]), Number(match[3] || 0), 0);
        return d;
      }
    }
    return new Date();
  }

  _buildDom() {
    if (this._root) return;
    this._root = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      ha-card {
        padding: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        /* Prevent the card itself from driving layout thrash during scaling */
        overflow: hidden;
        box-sizing: border-box;
      }
      .clock-text {
        font-family: var(--word-clock-font-family, var(--paper-font-common-base_-_font-family, sans-serif));
        font-size: var(--word-clock-font-size, 1.5em);
        font-weight: 500;
        letter-spacing: var(--word-clock-letter-spacing, 0.03em);
        line-height: var(--word-clock-line-spacing, normal);
        color: var(--word-clock-font-color, var(--primary-color, #03a9f4));
        text-align: var(--word-clock-orientation, center);
        /* Let the text element fill the card content area for accurate measurement */
        width: 100%;
      }
    `;

    const card = document.createElement('ha-card');
    this._textContainer = document.createElement('div');
    this._textContainer.className = 'clock-text';

    card.appendChild(this._textContainer);
    this._root.appendChild(style);
    this._root.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // Auto-scaling: ResizeObserver + rAF batching to prevent layout thrashing
  // ---------------------------------------------------------------------------

  _attachResizeObserver() {
    if (this._resizeObserver) return; // already attached
    if (!('ResizeObserver' in window)) return; // not available (rare)

    this._resizeObserver = new ResizeObserver(() => {
      // Defer to rAF so we batch multiple resize events in the same frame
      // and avoid triggering reflows inside the observer callback.
      this._scheduleAutoScale();
    });

    // Observe the ha-card element (the real content box).
    const card = this._root && this._root.querySelector('ha-card');
    if (card) this._resizeObserver.observe(card);
  }

  /**
   * Schedule an auto-scale pass on the next animation frame.
   * Coalesces multiple rapid calls (resize storm, content change) into one.
   */
  _scheduleAutoScale() {
    if (!this._isAutoScale()) return;
    if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
    this._rafHandle = requestAnimationFrame(() => {
      this._rafHandle = null;
      this._applyAutoScale();
    });
  }

  /**
   * Measure and apply the optimal font size + line height.
   * Reads layout once (getBoundingClientRect), then writes once (inline styles).
   * No interleaved read/write — no layout thrashing.
   */
  _applyAutoScale() {
    if (!this._root || !this._textContainer) return;
    if (!this._isAutoScale()) return;

    const card = this._root.querySelector('ha-card');
    if (!card) return;

    // READ phase — measure the available content box.
    const rect = card.getBoundingClientRect();
    // Account for the card's padding (16px each side).
    const padding = 16;
    const availableWidth  = rect.width  - padding * 2;
    const availableHeight = rect.height - padding * 2;

    if (availableWidth <= 0 || availableHeight <= 0) return;

    const text = this._textContainer.textContent;
    if (!text) return;

    // Derive typography options from current config.
    const fontFamily    = getComputedStyle(this._textContainer).fontFamily || 'sans-serif';
    const letterSpacing = this._config.letter_spacing || '0.03em';

    // Measure — the probe element is appended/removed from document.body,
    // outside the shadow DOM, so it doesn't trigger a shadow re-layout.
    const { fontSize, lineHeight } = fitTextToContainer(
      text,
      availableWidth,
      availableHeight,
      { fontFamily, fontWeight: '500', letterSpacing }
    );

    // WRITE phase — apply both properties at once, single style mutation.
    this._textContainer.style.fontSize   = `${fontSize}px`;
    this._textContainer.style.lineHeight = `${lineHeight}px`;
  }

  _render() {
    if (!this._root) this._buildDom();
    const words = computeWords(this._currentDate());
    const text  = applyCapitalization(
      words.join(' '),
      this._config && this._config.capitalization
    );

    // Only update DOM + re-scale if text actually changed (avoids spurious work).
    if (this._textContainer.textContent !== text) {
      this._textContainer.textContent = text;
      // Text changed (e.g. new time bucket) — re-run scaling because the new
      // text may be longer/shorter and need a different font size.
      this._scheduleAutoScale();
    }
  }

  static getConfigElement() {
    return document.createElement('word-clock-card-editor');
  }

  static getStubConfig() {
    return {};
  }
}

customElements.define('word-clock-card', WordClockCard);


// ---------------------------------------------------------------------------
// WordClockCardEditor
// ---------------------------------------------------------------------------

class WordClockCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  render() {
    if (!this._config || !this._hass) return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }

    const autoScale = this._config.auto_scale !== false; // default true

    this.shadowRoot.innerHTML = `
      <div class="card-config">
        <div class="side-by-side">
          <label class="full-width">
            <span>Auto-Scale Text</span>
            <div class="toggle-row">
              <input type="checkbox" id="auto-scale-toggle" ${autoScale ? 'checked' : ''}>
              <span class="toggle-hint">${autoScale ? 'On — text fills container automatically' : 'Off — use manual font size below'}</span>
            </div>
          </label>
        </div>
        <div class="side-by-side">
          <label>
            <span>Font Color</span>
            <input type="color"
              class="color-picker"
              value="${this._config.font_color || '#03a9f4'}"
              data-prop="font_color"
            >
          </label>
          <label>
            <span>Background Color</span>
            <input type="color"
              class="color-picker"
              value="${this._config.background_color || '#ffffff'}"
              data-prop="background_color"
            >
          </label>
        </div>
        <div class="side-by-side">
          <label>
            <span>Font Family</span>
            <select data-prop="font_family" class="dropdown">
              <option value="var(--paper-font-common-base_-_font-family, sans-serif)">Default (Theme)</option>
              <option value="sans-serif">Sans-Serif</option>
              <option value="serif">Serif</option>
              <option value="monospace">Monospace</option>
              <option value="cursive">Cursive</option>
              <option value="fantasy">Fantasy</option>
            </select>
          </label>
          <label class="${autoScale ? 'disabled-section' : ''}">
            <span>Font Size (manual mode only)</span>
            <select data-prop="font_size" class="dropdown" ${autoScale ? 'disabled' : ''}>
              <option value="0.8em">Small (0.8em)</option>
              <option value="1.1em">Normal (1.1em)</option>
              <option value="1.5em">Large (1.5em)</option>
              <option value="2em">Huge (2em)</option>
            </select>
          </label>
        </div>
        <div class="side-by-side">
          <label>
            <span>Capitalization</span>
            <select data-prop="capitalization" class="dropdown">
              <option value="upper">CAPS</option>
              <option value="lower">lower</option>
              <option value="title">Word Case</option>
              <option value="sentence">Sentence case</option>
            </select>
          </label>
        </div>
        <div class="side-by-side">
          <label>
            <span>Orientation</span>
            <select data-prop="orientation" class="dropdown">
              <option value="center">Center</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="justify">Justify</option>
            </select>
          </label>
        </div>
        <div class="side-by-side">
          <label class="${autoScale ? 'disabled-section' : ''}">
            <span>Line Spacing (manual mode only)</span>
            <input type="text" data-prop="line_spacing" class="text-input" placeholder="e.g. 1.5, 2em" ${autoScale ? 'disabled' : ''}>
          </label>
          <label>
            <span>Letter Spacing</span>
            <input type="text" data-prop="letter_spacing" class="text-input" placeholder="e.g. 0.1em, 2px">
          </label>
        </div>
      </div>
      <style>
        .card-config {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 12px;
        }
        .side-by-side {
          display: flex;
          gap: 12px;
        }
        .side-by-side > label {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .full-width {
          flex: 1 1 100%;
        }
        span {
          font-family: var(--paper-font-body1_-_font-family);
          font-size: 12px;
          color: var(--secondary-text-color);
        }
        .toggle-row {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 32px;
        }
        .toggle-hint {
          font-family: var(--paper-font-body1_-_font-family);
          font-size: 12px;
          color: var(--secondary-text-color);
        }
        input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }
        .color-picker {
          height: 32px;
          width: 100%;
          padding: 0;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
        }
        .dropdown {
          height: 32px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, white);
          color: var(--primary-text-color, black);
          font-size: 14px;
          padding: 4px;
        }
        .text-input {
          height: 32px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, white);
          color: var(--primary-text-color, black);
          font-size: 14px;
          padding: 4px;
          box-sizing: border-box;
          width: 100%;
        }
        .disabled-section {
          opacity: 0.45;
          pointer-events: none;
        }
        .dropdown:disabled,
        .text-input:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      </style>
    `;

    // Attach auto-scale toggle handler.
    const toggle = this.shadowRoot.querySelector('#auto-scale-toggle');
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        const newConfig = { ...this._config, auto_scale: e.target.checked };
        const event = new Event('config-changed', { bubbles: true, composed: true });
        event.detail = { config: newConfig };
        this.dispatchEvent(event);
      });
    }

    // Add change listeners to all other inputs.
    const inputs = this.shadowRoot.querySelectorAll('.color-picker, .dropdown, .text-input');
    for (const input of inputs) {
      input.addEventListener('change', (e) => this._valueChanged(e, input.dataset.prop));
    }

    // Set active dropdown/input values from config.
    if (this._config.font_family) {
      const select = this.shadowRoot.querySelector('[data-prop="font_family"]');
      if (select) select.value = this._config.font_family;
    }
    if (this._config.font_size) {
      const select = this.shadowRoot.querySelector('[data-prop="font_size"]');
      if (select) select.value = this._config.font_size;
    }
    {
      const select = this.shadowRoot.querySelector('[data-prop="capitalization"]');
      if (select) select.value = this._config.capitalization || 'upper';
    }
    {
      const select = this.shadowRoot.querySelector('[data-prop="orientation"]');
      if (select) select.value = this._config.orientation || 'center';
    }
    {
      const input = this.shadowRoot.querySelector('[data-prop="line_spacing"]');
      if (input) input.value = this._config.line_spacing || '';
    }
    {
      const input = this.shadowRoot.querySelector('[data-prop="letter_spacing"]');
      if (input) input.value = this._config.letter_spacing || '';
    }
  }

  _valueChanged(ev, prop) {
    const value = ev.target.value;
    if (!this._config) return;
    if (this._config[prop] === value) return;
    const newConfig = { ...this._config };
    if (value === '') {
      delete newConfig[prop];
    } else {
      newConfig[prop] = value;
    }
    const event = new Event('config-changed', { bubbles: true, composed: true });
    event.detail = { config: newConfig };
    this.dispatchEvent(event);
  }
}

customElements.define('word-clock-card-editor', WordClockCardEditor);


window.customCards = window.customCards || [];
window.customCards.push({
  type: 'word-clock-card',
  name: 'Word Clock Card',
  description:
    'Natural language word clock using the Twelveish (redux) time-to-word mapping.',
});
