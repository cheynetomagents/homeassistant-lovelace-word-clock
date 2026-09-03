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


class WordClockCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._buildDom();
    this._updateStyles();
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
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .clock-text {
        font-family: var(--word-clock-font-family, var(--paper-font-common-base_-_font-family, sans-serif));
        font-size: var(--word-clock-font-size, 1.5em);
        font-weight: 500;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--word-clock-font-color, var(--primary-color, #03a9f4));
        text-align: center;
      }
    `;

    const card = document.createElement('ha-card');
    this._textContainer = document.createElement('div');
    this._textContainer.className = 'clock-text';

    card.appendChild(this._textContainer);
    this._root.appendChild(style);
    this._root.appendChild(card);
  }

  _render() {
    if (!this._root) this._buildDom();
    const words = computeWords(this._currentDate());
    this._textContainer.textContent = words.join(' ');
  }

  static getConfigElement() {
    return document.createElement('word-clock-card-editor');
  }

  static getStubConfig() {
    return {};
  }
}

customElements.define('word-clock-card', WordClockCard);


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
    this.shadowRoot.innerHTML = `
      
      <div class="card-config">
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
              <!-- Using standard font family options -->
              <option value="var(--paper-font-common-base_-_font-family, sans-serif)">Default (Theme)</option>
              <option value="sans-serif">Sans-Serif</option>
              <option value="serif">Serif</option>
              <option value="monospace">Monospace</option>
              <option value="cursive">Cursive</option>
              <option value="fantasy">Fantasy</option>
            </select>
          </label>
          <label>
            <span>Font Size</span>
            <select data-prop="font_size" class="dropdown">
              <option value="0.8em">Small (0.8em)</option>
              <option value="1.1em">Normal (1.1em)</option>
              <option value="1.5em">Large (1.5em)</option>
              <option value="2em">Huge (2em)</option>
            </select>
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
        span {
          font-family: var(--paper-font-body1_-_font-family);
          font-size: 12px;
          color: var(--secondary-text-color);
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
      </style>

    `;
    
    // Add value bound event listeners correctly for lit-element/standard HTML workaround
    
    // Add value bound event listeners correctly for lit-element/standard HTML workaround
    const inputs = this.shadowRoot.querySelectorAll('.color-picker, .dropdown');
    for (const input of inputs) {
      input.addEventListener('change', (e) => this._valueChanged(e, input.dataset.prop));
    }
    
    // Set active dropdown values based on config
    if (this._config.font_family) {
      const select = this.shadowRoot.querySelector('[data-prop="font_family"]');
      if (select) select.value = this._config.font_family;
    }
    if (this._config.font_size) {
      const select = this.shadowRoot.querySelector('[data-prop="font_size"]');
      if (select) select.value = this._config.font_size;
    }

  }

  _valueChanged(ev, prop) {
    const value = ev.target.value;
    if (!this._config) {
      return;
    }
    if (this._config[prop] === value) {
      return;
    }
    const newConfig = {
      ...this._config,
    };
    if (value === "") {
      delete newConfig[prop];
    } else {
      newConfig[prop] = value;
    }
    
    // Dispatch event to HA
    const event = new Event("config-changed", {
      bubbles: true,
      composed: true
    });
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
