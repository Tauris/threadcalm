/**
 * Namespaced console logger.
 *
 * Debug output is off by default so an installed script stays quiet in a
 * console that Viva Engage already fills with its own diagnostics. Turn it on
 * from the settings panel when reporting a bug.
 */
const PREFIX = '[Threadcalm]';

let debugEnabled = false;

export function setDebug(enabled) {
  debugEnabled = Boolean(enabled);
}

export function isDebug() {
  return debugEnabled;
}

export const log = {
  debug(...args) {
    if (debugEnabled) console.debug(PREFIX, ...args);
  },
  info(...args) {
    console.info(PREFIX, ...args);
  },
  warn(...args) {
    console.warn(PREFIX, ...args);
  },
  error(...args) {
    console.error(PREFIX, ...args);
  },
};
