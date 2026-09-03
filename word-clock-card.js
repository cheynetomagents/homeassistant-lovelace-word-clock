/**
 * Word Clock Card for Home Assistant Lovelace
 *
 * Renders a word-grid clock and highlights the words that spell out the
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

// TimeShift (English): whether the hour word refers to the *next* hour.
const TIME_SHIFT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1];

/**
 * Twelveish's exact time-to-word computation (WordClockTask.capitalise* /
 * MyWatchFace.onDraw), non-military 12-hour mode.
 */
function computeWords(date) {
  const minutes = date.getMinutes();
  const index = Math.floor(minutes / 5); // 0..11

  let hourText = (date.getHours() % 12) + TIME_SHIFT[index];
  if (hourText > 12) hourText -= 12;
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
// Static word grid — every word that appears in the Twelveish English
// prefix/suffix/hour-word set, arranged for display. No words outside this
// set are added.
// ---------------------------------------------------------------------------
const GRID = [
  ['a', 'quarter', 'past', 'to'],
  ['half', 'almost', 'around', 'approaching'],
  ['one', 'two', 'three', 'four'],
  ['five', 'six', 'seven', 'eight'],
  ['nine', 'ten', 'eleven', 'twelve'],
  ['ish', 'or', 'so', ''],
];

class WordClockCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._buildDom();
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
    this._render();
  }

  disconnectedCallback() {
    if (this._timer) {
      clearTimeout(this._timer);
      clearInterval(this._timer);
      this._timer = null;
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
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        justify-items: center;
      }
      .word {
        font-family: var(--paper-font-common-base_-_font-family, sans-serif);
        font-size: 1.1em;
        font-weight: 500;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--disabled-text-color, #6a6a6a);
        transition: color 0.3s ease, text-shadow 0.3s ease;
        white-space: nowrap;
      }
      .word.empty {
        visibility: hidden;
      }
      .word.on {
        color: var(--primary-color, #03a9f4);
        text-shadow: 0 0 6px var(--primary-color, #03a9f4);
      }
    `;

    const card = document.createElement('ha-card');
    const grid = document.createElement('div');
    grid.className = 'grid';
    this._cells = [];

    for (const row of GRID) {
      for (const word of row) {
        const cell = document.createElement('div');
        cell.className = 'word' + (word === '' ? ' empty' : '');
        cell.textContent = word;
        cell.dataset.word = word;
        grid.appendChild(cell);
        this._cells.push(cell);
      }
    }

    card.appendChild(grid);
    this._root.appendChild(style);
    this._root.appendChild(card);
  }

  _render() {
    if (!this._root) this._buildDom();
    const words = new Set(computeWords(this._currentDate()));
    for (const cell of this._cells) {
      const isOn = cell.dataset.word !== '' && words.has(cell.dataset.word);
      cell.classList.toggle('on', isOn);
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

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'word-clock-card',
  name: 'Word Clock Card',
  description:
    'Word-grid clock using the Twelveish (redux) time-to-word mapping.',
});
