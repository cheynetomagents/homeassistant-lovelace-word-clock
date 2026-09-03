# homeassistant-lovelace-word-clock

Word Clock for Home Assistant dashboard.

A custom Lovelace card that displays the current time as words in a static
word grid, highlighting the words that spell out the time — the phrase and
highlight logic is ported verbatim (English locale) from the
[Twelveish (redux)](https://github.com/psychowood/Twelveish-redux) Wear OS
watch face (GPLv3), stripped of all watch/integration-specific code. Clock
face only: no sensors, complications, or companion features.

Example: "3:20" → `almost half past three`.

## Install

### HACS (manual repository)
1. HACS → Frontend → menu (⋮) → Custom repositories.
2. Add this repo URL, category "Dashboard".
3. Install "Word Clock Card", then add the resource if HACS doesn't do it
   automatically.

### Manual
1. Copy `word-clock-card.js` into `<config>/www/word-clock-card.js`.
2. Settings → Dashboards → Resources → Add Resource:
   - URL: `/local/word-clock-card.js`
   - Resource type: JavaScript Module

## Usage

Add to a dashboard view as a manual card:

```yaml
type: custom:word-clock-card
```

By default the card uses the browser's local clock (no entity needed).
Optionally sync to a Home Assistant time source:

```yaml
type: custom:word-clock-card
time_entity: sensor.time
```

`time_entity` accepts any entity whose state is an ISO datetime or an
`HH:MM[:SS]` string (e.g. `sensor.time`, `sensor.date_time_iso`).

## Word mapping

Prefix/suffix/hour-word set and 5-minute-bucket highlight logic are taken
directly from Twelveish's English string arrays and
`WordClockTask`/`MyWatchFace` logic — no new phrasing was introduced. See
`word-clock-card.js` for the ported tables and computation.

## License

Twelveish (redux) is GPLv3-licensed; this project's word-clock mapping is a
derivative of that code and is likewise distributed under the AGPLv3 license
in `LICENSE`.
