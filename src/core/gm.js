/**
 * Thin wrappers around the Greasemonkey APIs.
 *
 * Every wrapper degrades gracefully: the script stays usable when a grant is
 * missing, when it runs in a plain page for testing, or when a manager
 * implements only part of the GM API.
 */

const hasFn = (name) => typeof globalThis[name] === 'function';

/** Injects a stylesheet, falling back to a plain <style> element. */
export function addStyle(css) {
  if (hasFn('GM_addStyle')) {
    try {
      return GM_addStyle(css);
    } catch {
      // fall through to the DOM implementation
    }
  }
  const style = document.createElement('style');
  style.textContent = css;
  (document.head || document.documentElement).append(style);
  return style;
}

const LOCAL_PREFIX = 'threadcalm:';

export function getValue(key, fallback) {
  if (hasFn('GM_getValue')) {
    try {
      const stored = GM_getValue(key, undefined);
      if (stored !== undefined) return stored;
    } catch {
      /* fall through */
    }
  }
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setValue(key, value) {
  if (hasFn('GM_setValue')) {
    try {
      GM_setValue(key, value);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage may be full or blocked; settings then stay session-only */
  }
}

export function deleteValue(key) {
  if (hasFn('GM_deleteValue')) {
    try {
      GM_deleteValue(key);
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.removeItem(LOCAL_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Copies text to the clipboard.
 *
 * `GM_setClipboard` works without a user gesture and without focus, which the
 * async clipboard API does not, so it is tried first.
 *
 * @returns {Promise<boolean>} whether the copy is believed to have succeeded
 */
export async function copyToClipboard(text) {
  if (hasFn('GM_setClipboard')) {
    try {
      GM_setClipboard(text, 'text');
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through */
  }
  return legacyCopy(text);
}

/** Last-resort clipboard path for managers without GM_setClipboard. */
function legacyCopy(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

export function registerMenuCommand(label, handler) {
  if (!hasFn('GM_registerMenuCommand')) return;
  try {
    GM_registerMenuCommand(label, handler);
  } catch {
    /* menu commands are a convenience, never a requirement */
  }
}
