/**
 * Counters for answering one question: is the script still working when it
 * ought to be idle?
 *
 * A browser's memory sawtooths as the collector runs, so watching the number
 * go up and down says nothing about whether anything is wrong. What does say
 * something is whether this script is *doing* anything on a page nobody is
 * touching, and how much of it. These counters make that visible in the
 * diagnostics report, where two copies taken an hour apart answer it directly.
 *
 * `layoutReads` is the one that matters most. Reading `innerText` flushes
 * layout, so it is by far the most expensive thing done per element; it once
 * happened for every span in the document, several times a second. On an idle
 * page it should now barely move.
 *
 * Plain properties rather than a Map: these are incremented in the hottest
 * loop in the script, and the measurement must not become the cost.
 */
export const counters = {
  /** `innerText` reads. Each one flushes layout. */
  layoutReads: 0,
  /** Elements skipped by the cheap text check, so never laid out. */
  layoutSkips: 0,
  /** Expander scans, each of which classifies every candidate control. */
  scans: 0,
  /** Elements a scan looked at, summed over all scans. */
  candidates: 0,
  /** Feature sweeps, triggered by a reported DOM change or navigation. */
  sweeps: 0,
};

let startedAt = Date.now();
let lastScanAt = 0;

/** Records a scan, and when it happened. */
export function noteScan(candidates = 0) {
  counters.scans += 1;
  counters.candidates += candidates;
  lastScanAt = Date.now();
}

/** Everything the diagnostics report needs, read at the moment it is asked. */
export function snapshot() {
  const now = Date.now();
  let domNodes = -1;
  try {
    domNodes = document.getElementsByTagName('*').length;
  } catch {
    domNodes = -1;
  }

  return {
    ...counters,
    domNodes,
    uptimeSeconds: Math.round((now - startedAt) / 1000),
    sinceLastScanSeconds: lastScanAt ? Math.round((now - lastScanAt) / 1000) : null,
  };
}

/** Starts the counters over, so a second reading can be taken from a baseline. */
export function resetStats() {
  for (const key of Object.keys(counters)) counters[key] = 0;
  startedAt = Date.now();
  lastScanAt = 0;
}
