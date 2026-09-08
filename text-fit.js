/**
 * text-fit.js
 *
 * Pure JavaScript utility for fitting text into a container.
 *
 * Exports one function:
 *   fitTextToContainer(text, containerWidth, containerHeight, options?)
 *     -> { fontSize: number, lineHeight: number }
 *
 * Algorithm: binary search over integer pixel font sizes.
 * Measurement: hidden off-screen DOM element (accurate for multi-line wrapping).
 * The probe element is created once per call and immediately removed, so there
 * is no persistent DOM pollution.
 *
 * @param {string}  text            - The text to fit.
 * @param {number}  containerWidth  - Available width in pixels.
 * @param {number}  containerHeight - Available height in pixels.
 * @param {object}  [options]
 * @param {string}  [options.fontFamily='sans-serif']   - CSS font-family.
 * @param {string}  [options.fontWeight='500']          - CSS font-weight.
 * @param {number}  [options.lineHeightRatio=1.2]       - line-height multiplier.
 * @param {string}  [options.letterSpacing='0.03em']    - CSS letter-spacing.
 * @param {number}  [options.minFontSize=4]             - Lower bound (px).
 * @param {number}  [options.maxFontSize=300]           - Upper bound (px).
 *
 * @returns {{ fontSize: number, lineHeight: number }}
 *   fontSize   - largest integer pixel size that fits (px).
 *   lineHeight - computed line-height in pixels (fontSize * lineHeightRatio).
 */
export function fitTextToContainer(text, containerWidth, containerHeight, options = {}) {
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
