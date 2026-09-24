/**
 * The script's entire stylesheet.
 *
 * Kept in one module so that everything injected into Engage's page can be
 * reviewed at once — a userscript is read by the people who install it, and
 * "what does this change on my screen" should be answerable from one file.
 *
 * Conventions:
 *   - every selector is prefixed `tc-`, so nothing can collide with Engage
 *   - `!important` is used only where a rule must beat Engage's own inline
 *     or utility styles (hiding, widths), never for our own widgets
 *   - colours come from custom properties with a dark-mode override, so the
 *     script follows the theme the reader already chose; the script's own
 *     windows also declare color-scheme, so native controls follow it too
 *   - but those properties track prefers-color-scheme, which is the browser's
 *     theme, not Engage's. Anything drawn *inside* a post must take its colour
 *     from the post instead -- its inherited text colour, with neutral grey at
 *     low opacity around it -- or it will clash whenever the two disagree.
 *     Our own floating surfaces keep the palette.
 */

export const STYLES = `
/*
 * Design tokens.
 *
 * The accent is the teal of the script's own icon, not Engage's blue: these
 * windows belong to Threadcalm, and borrowing the host's colour made them read
 * as a broken piece of Engage rather than as a tool of their own. Neutrals are
 * tinted a fraction toward the same teal, which is what makes the set look
 * chosen rather than defaulted.
 *
 * Fonts are the system's. The script makes no network requests, so a webfont
 * is off the table; the character comes from weight, spacing, tabular figures
 * and a monospace stamp instead.
 */
:root {
  --tc-bg: #fcfdfd;
  --tc-inset: #eef3f2;
  --tc-hover: #e5edeb;
  --tc-fg: #162120;
  --tc-muted: #566764;
  --tc-faint: #879794;
  --tc-line: rgba(22, 33, 32, .10);
  --tc-line-strong: rgba(22, 33, 32, .20);
  --tc-accent: #2f6f68;
  --tc-accent-strong: #235650;
  --tc-accent-fg: #ffffff;
  --tc-accent-soft: rgba(47, 111, 104, .10);
  --tc-accent-ring: rgba(47, 111, 104, .32);
  --tc-warn: #b3261e;
  --tc-warn-soft: rgba(179, 38, 30, .08);
  --tc-shadow: 0 1px 2px rgba(15, 25, 24, .06), 0 8px 24px rgba(15, 25, 24, .12);
  --tc-shadow-lg: 0 2px 6px rgba(15, 25, 24, .08), 0 24px 64px rgba(15, 25, 24, .24);
  --tc-backdrop: rgba(12, 20, 19, .36);
  --tc-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%23566764' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  --tc-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --tc-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;

  /* Also used inside posts. */
  --tc-new: #2f6f68;
  --tc-unanswered: #c19c00;
  --tc-reading-width: 760px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --tc-bg: #151b1b;
    --tc-inset: #1d2525;
    --tc-hover: #253030;
    --tc-fg: #e3eae8;
    --tc-muted: #9dada9;
    --tc-faint: #6d7d7a;
    --tc-line: rgba(227, 234, 232, .09);
    --tc-line-strong: rgba(227, 234, 232, .18);
    --tc-accent: #74bdb3;
    --tc-accent-strong: #97d0c8;
    --tc-accent-fg: #0c1716;
    --tc-accent-soft: rgba(116, 189, 179, .14);
    --tc-accent-ring: rgba(116, 189, 179, .40);
    --tc-warn: #f2b8b5;
    --tc-warn-soft: rgba(242, 184, 181, .10);
    --tc-shadow: 0 1px 2px rgba(0, 0, 0, .30), 0 8px 24px rgba(0, 0, 0, .45);
    --tc-shadow-lg: 0 2px 6px rgba(0, 0, 0, .35), 0 24px 64px rgba(0, 0, 0, .60);
    --tc-backdrop: rgba(0, 0, 0, .50);
    --tc-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%239dada9' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    --tc-new: #74bdb3;
    --tc-unanswered: #e8c547;
  }
}

/* ------------------------------------------------------------- surfaces -- */

/*
 * Everything the script draws as a window of its own.
 *
 * color-scheme is what fixes the native controls: without it the browser drew
 * number spinners, dropdown lists and scrollbars in their light theme on a
 * dark sheet, as white blobs. Declaring it lets them follow the same theme as
 * the tokens above.
 *
 * The resets are defensive rather than stylistic. Engage styles bare buttons,
 * headings and labels globally, and those rules reach into anything appended
 * to its body.
 */
#tc-panel,
#tc-settings,
#tc-help,
#tc-toasts {
  color-scheme: light dark;
  color: var(--tc-fg);
  font: 13px/1.45 var(--tc-font);
  letter-spacing: normal;
  text-align: left;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
}

:is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *,
:is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *::before,
:is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *::after {
  box-sizing: border-box;
}

:is(#tc-panel, #tc-settings, #tc-help) :is(h2, h3, p, dl, dd) { margin: 0; }

:is(#tc-panel, #tc-settings, #tc-help) button {
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

:is(#tc-panel, #tc-settings, #tc-help) :focus-visible {
  outline: 2px solid var(--tc-accent);
  outline-offset: 2px;
}

.tc-icon { display: block; flex: none; }
.tc-mark { display: block; flex: none; }

/*
 * The project name. It links to the repository, but it reads as the title it
 * is: inherited colour, underline only on hover.
 */
:is(#tc-panel, #tc-settings, #tc-help) .tc-brand {
  color: inherit;
  font-weight: 650;
  text-decoration: none;
}

:is(#tc-panel, #tc-settings, #tc-help) .tc-brand:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.tc-stamp {
  color: var(--tc-faint);
  font: 11px/1 var(--tc-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* --------------------------------------------------------------- buttons -- */

:is(#tc-panel, #tc-settings, #tc-help) .tc-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tc-muted);
  transition: background-color .12s ease, color .12s ease;
}

:is(#tc-panel, #tc-settings, #tc-help) .tc-icon-btn:hover {
  background: var(--tc-hover);
  color: var(--tc-fg);
}

:is(#tc-panel, #tc-settings, #tc-help) .tc-icon-btn:active { background: var(--tc-line-strong); }

:is(#tc-panel, #tc-settings, #tc-help) .tc-icon-btn[aria-pressed="true"] {
  background: var(--tc-accent-soft);
  color: var(--tc-accent);
}

#tc-settings .tc-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--tc-line-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--tc-fg);
  font-weight: 500;
  white-space: nowrap;
  transition: background-color .12s ease, border-color .12s ease, color .12s ease;
}

#tc-settings .tc-btn:hover { background: var(--tc-hover); }

#tc-settings .tc-btn-primary {
  border-color: transparent;
  background: var(--tc-accent);
  color: var(--tc-accent-fg);
}

#tc-settings .tc-btn-primary:hover { background: var(--tc-accent-strong); }

#tc-settings .tc-btn-danger {
  border-color: transparent;
  color: var(--tc-warn);
}

#tc-settings .tc-btn-danger:hover { background: var(--tc-warn-soft); }

/* ----------------------------------------------------------------- panel -- */

/*
 * Two lines: who this is, and what it is doing. The status dot sits in the
 * same column as the mark above it and the status text starts where the name
 * does, so the two lines read as one object rather than two stacked rows.
 */
#tc-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  display: grid;
  gap: 4px;
  width: max-content;
  min-width: 260px;
  max-width: min(440px, calc(100vw - 32px));
  padding: 10px 8px 8px 12px;
  border: 1px solid var(--tc-line);
  border-radius: 14px;
  background: var(--tc-bg);
  box-shadow: var(--tc-shadow);
}

#tc-panel[hidden] { display: none; }

#tc-panel .tc-build {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 4px;
  font-size: 12.5px;
}

#tc-panel .tc-build .tc-mark { border-radius: 4px; }
#tc-panel .tc-build .tc-stamp { margin-left: auto; }

.tc-chip-pre {
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--tc-unanswered);
  color: #1b1600;
  font: 650 10px/1 var(--tc-font);
  letter-spacing: .06em;
  text-transform: uppercase;
}

#tc-panel .tc-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

#tc-panel .tc-dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin: 0 4.5px;
  border-radius: 50%;
  background: var(--tc-accent);
}

#tc-panel.tc-busy .tc-dot { animation: tc-pulse 1.4s ease-in-out infinite; }
#tc-panel.tc-paused .tc-dot { background: var(--tc-faint); }
#tc-panel.tc-limit .tc-dot { background: var(--tc-warn); }

#tc-panel .tc-status {
  flex: 1 1 auto;
  min-width: 12ch;
  color: var(--tc-muted);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

#tc-panel .tc-tools {
  display: flex;
  gap: 2px;
  margin-left: 6px;
}

/* ----------------------------------------------------------- dialogs ---- */

#tc-settings,
#tc-help {
  position: fixed;
  inset: 0;
  z-index: 2147483001;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--tc-backdrop);
  backdrop-filter: blur(2px);
  animation: tc-fade .16s ease-out;
}

#tc-help { z-index: 2147483002; }

#tc-settings .tc-sheet,
#tc-help .tc-help-card {
  border: 1px solid var(--tc-line);
  border-radius: 16px;
  background: var(--tc-bg);
  box-shadow: var(--tc-shadow-lg);
  animation: tc-rise .2s cubic-bezier(.2, .8, .2, 1);
}

/* ------------------------------------------------------------- settings -- */

/*
 * Header, scrolling body, footer. The header and footer stay put so the way
 * out -- the close button, and Done -- is never scrolled away.
 */
#tc-settings .tc-sheet {
  display: flex;
  flex-direction: column;
  width: min(680px, 100%);
  max-height: min(86vh, 820px);
  overflow: hidden;
}

#tc-settings .tc-sheet-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px 14px 20px;
  border-bottom: 1px solid var(--tc-line);
}

#tc-settings .tc-sheet-head .tc-mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
}

#tc-settings .tc-sheet-head h2 {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -.01em;
}

#tc-settings .tc-spacer { flex: 1 1 auto; }

#tc-settings .tc-sheet-body {
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0 20px 22px;
  scrollbar-color: var(--tc-line-strong) transparent;
  scrollbar-width: thin;
}

#tc-settings .tc-sheet-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--tc-line);
}

#tc-settings .tc-foot-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Groups are titled in the accent, which is what gives the long sheet its rhythm. */
#tc-settings .tc-group { padding-top: 20px; }

#tc-settings .tc-group-title {
  margin-bottom: 2px;
  color: var(--tc-accent);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .08em;
  text-transform: uppercase;
}

/* One row per setting, separated by hairlines rather than boxed. */
#tc-settings .tc-field {
  display: block;
  padding: 12px 0;
  border-top: 1px solid var(--tc-line);
}

#tc-settings .tc-group-title + .tc-field { border-top: 0; }

#tc-settings .tc-field-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

#tc-settings .tc-field-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

#tc-settings .tc-field-stacked .tc-field-text { margin-bottom: 10px; }

/*
 * 500, not something between 500 and 600: system fonts have no such weight,
 * and the browser rounds it up to bold, which made every label shout.
 */
#tc-settings .tc-label {
  color: var(--tc-fg);
  font-weight: 500;
}

#tc-settings .tc-help {
  max-width: 62ch;
  color: var(--tc-muted);
  font-size: 12px;
  line-height: 1.5;
}

#tc-settings .tc-control {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

/*
 * The native input stays in the document, focusable and labelled; only its
 * appearance is handed to the element drawn beside it.
 */
#tc-settings .tc-vh {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}

/* Switch. */
#tc-settings .tc-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--tc-line-strong);
  cursor: pointer;
  transition: background-color .15s ease;
}

#tc-settings .tc-switch::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .28);
  transition: transform .15s ease;
}

#tc-settings .tc-vh:checked + .tc-switch { background: var(--tc-accent); }
#tc-settings .tc-vh:checked + .tc-switch::before { transform: translateX(16px); }

#tc-settings .tc-vh:focus-visible + :is(.tc-switch, .tc-card-face, .tc-pill-face) {
  outline: 2px solid var(--tc-accent);
  outline-offset: 2px;
}

/* Text inputs. */
#tc-settings input[type="number"],
#tc-settings select,
#tc-settings textarea {
  border: 1px solid var(--tc-line-strong);
  border-radius: 8px;
  background-color: var(--tc-inset);
  color: var(--tc-fg);
  font: inherit;
  transition: border-color .12s ease, box-shadow .12s ease;
}

#tc-settings input[type="number"]:hover,
#tc-settings select:hover,
#tc-settings textarea:hover { border-color: var(--tc-faint); }

#tc-settings input[type="number"]:focus,
#tc-settings select:focus,
#tc-settings textarea:focus {
  border-color: var(--tc-accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--tc-accent-ring);
}

/*
 * Numbers without spinners. The spinners were the white blobs; the arrow keys
 * still step the value, and a delay in milliseconds is typed, not clicked.
 */
#tc-settings input[type="number"] {
  width: 92px;
  height: 32px;
  padding: 0 10px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
}

#tc-settings input[type="number"]::-webkit-inner-spin-button,
#tc-settings input[type="number"]::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

#tc-settings .tc-unit {
  width: 2.5ch;
  color: var(--tc-faint);
  font: 12px var(--tc-mono);
}

#tc-settings select {
  height: 32px;
  min-width: 200px;
  max-width: 300px;
  padding: 0 32px 0 10px;
  background-image: var(--tc-chevron);
  background-position: right 10px center;
  background-repeat: no-repeat;
  background-size: 12px;
  cursor: pointer;
  -moz-appearance: none;
  appearance: none;
}

#tc-settings textarea {
  display: block;
  width: 100%;
  min-height: 76px;
  padding: 8px 10px;
  font: 12px/1.5 var(--tc-mono);
  resize: vertical;
}

/*
 * Choices that are trades: a card per option, carrying what it gains and what
 * it costs. Marked with + and a minus sign as well as colour, so the difference
 * survives both themes and a reader who cannot rely on hue.
 */
#tc-settings .tc-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 8px;
}

#tc-settings .tc-card {
  position: relative;
  display: block;
  cursor: pointer;
}

#tc-settings .tc-card-face {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  height: 100%;
  padding: 10px 12px 11px 34px;
  border: 1px solid var(--tc-line-strong);
  border-radius: 10px;
  background: var(--tc-bg);
  transition: border-color .12s ease, background-color .12s ease, box-shadow .12s ease;
}

#tc-settings .tc-card-face::before {
  content: "";
  position: absolute;
  top: 12px;
  left: 12px;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--tc-line-strong);
  border-radius: 50%;
  background: var(--tc-bg);
  transition: border-color .12s ease, border-width .12s ease;
}

#tc-settings .tc-card:hover .tc-card-face { border-color: var(--tc-faint); }

#tc-settings .tc-vh:checked + .tc-card-face {
  border-color: var(--tc-accent);
  background: var(--tc-accent-soft);
  box-shadow: inset 0 0 0 1px var(--tc-accent);
}

#tc-settings .tc-vh:checked + .tc-card-face::before {
  border-width: 4.5px;
  border-color: var(--tc-accent);
}

#tc-settings .tc-card-title {
  color: var(--tc-fg);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

#tc-settings .tc-gain,
#tc-settings .tc-cost {
  display: flex;
  gap: 6px;
  color: var(--tc-muted);
  font-size: 11.5px;
  line-height: 1.4;
}

#tc-settings .tc-gain::before,
#tc-settings .tc-cost::before {
  flex: none;
  width: .7em;
  font-weight: 700;
}

#tc-settings .tc-gain::before { content: "+"; color: var(--tc-accent); }
#tc-settings .tc-cost::before { content: "−"; color: var(--tc-warn); }

/* Several-of-many choices: pills. */
#tc-settings .tc-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

#tc-settings .tc-pill { cursor: pointer; }

#tc-settings .tc-pill-face {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--tc-line-strong);
  border-radius: 999px;
  color: var(--tc-fg);
  font-size: 12.5px;
  transition: border-color .12s ease, background-color .12s ease, color .12s ease;
}

#tc-settings .tc-pill:hover .tc-pill-face { border-color: var(--tc-faint); }

#tc-settings .tc-vh:checked + .tc-pill-face {
  border-color: var(--tc-accent);
  background: var(--tc-accent-soft);
  color: var(--tc-accent-strong);
  font-weight: 500;
}

#tc-settings .tc-vh:checked + .tc-pill-face::before {
  content: "✓";
  font-weight: 700;
}

#tc-settings .tc-links {
  margin-top: 24px;
  color: var(--tc-faint);
  font-size: 12px;
  text-align: center;
}

#tc-settings .tc-links a,
#tc-help .tc-help-note a {
  color: var(--tc-accent);
  font-weight: 500;
  text-decoration: none;
}

#tc-settings .tc-links a:hover,
#tc-help .tc-help-note a:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ----------------------------------------------------------------- help -- */

#tc-help .tc-help-card {
  width: min(460px, 100%);
  max-height: min(86vh, 720px);
  overflow: auto;
  padding: 18px 16px 20px 22px;
  scrollbar-width: thin;
}

#tc-help .tc-help-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

#tc-help .tc-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: var(--tc-accent);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .08em;
  text-transform: uppercase;
}

#tc-help .tc-eyebrow .tc-mark {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}

#tc-help h2 {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -.01em;
}

#tc-help .tc-keys {
  display: grid;
  grid-template-columns: max-content 1fr;
  padding-right: 6px;
}

#tc-help .tc-keys dt,
#tc-help .tc-keys dd {
  display: flex;
  align-items: center;
  min-height: 36px;
  border-top: 1px solid var(--tc-line);
}

#tc-help .tc-keys dt:first-of-type,
#tc-help .tc-keys dd:first-of-type { border-top: 0; }

#tc-help .tc-keys dt {
  gap: 4px;
  padding-right: 18px;
}

#tc-help kbd {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border: 1px solid var(--tc-line-strong);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--tc-inset);
  color: var(--tc-fg);
  font: 600 11.5px/1 var(--tc-mono);
}

#tc-help .tc-help-note {
  margin-top: 16px;
  padding: 14px 6px 0 0;
  border-top: 1px solid var(--tc-line);
  color: var(--tc-muted);
  font-size: 12px;
  line-height: 1.55;
}

/* ---------------------------------------------------------------- toast -- */

#tc-toasts {
  position: fixed;
  right: 16px;
  bottom: 92px;
  z-index: 2147483003;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}

#tc-toasts .tc-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 9px 14px 9px 12px;
  border: 1px solid var(--tc-line);
  border-radius: 12px;
  background: var(--tc-bg);
  box-shadow: var(--tc-shadow);
  font-size: 12.5px;
  opacity: 0;
  transform: translateY(6px) scale(.98);
  transition: opacity .18s ease, transform .18s ease;
}

#tc-toasts .tc-toast::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tc-accent);
}

#tc-toasts .tc-toast.tc-in {
  opacity: 1;
  transform: none;
}

#tc-toasts .tc-toast.tc-warn::before { background: var(--tc-warn); }

/* ---------------------------------------------------------------- motion -- */

@keyframes tc-fade { from { opacity: 0; } }

@keyframes tc-rise {
  from {
    opacity: 0;
    transform: translateY(8px) scale(.985);
  }
}

@keyframes tc-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--tc-accent-ring); }
  50% { box-shadow: 0 0 0 4px transparent; }
}

@media (prefers-reduced-motion: reduce) {
  #tc-settings,
  #tc-help,
  #tc-settings .tc-sheet,
  #tc-help .tc-help-card,
  #tc-panel.tc-busy .tc-dot { animation: none; }

  :is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *,
  /* Blanket and therefore !important: it has to beat every transition above. */
  :is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *::before { transition: none !important; }
}

/* Narrow windows: rows stack, dropdowns take the full width. */
@media (max-width: 540px) {
  #tc-settings { padding: 8px; }
  #tc-settings .tc-field-inline { flex-wrap: wrap; gap: 8px; }
  #tc-settings select {
    width: 100%;
    min-width: 0;
    max-width: none;
  }
  #tc-panel { min-width: 0; }
}

/* ---------------------------------------------- translation compaction -- */

/*
 * The label is collapsed rather than removed: the control keeps its role, its
 * handler and its place in the tab order, and a hover or a Tab press brings
 * the full label back. Nothing here mutates Engage's DOM.
 *
 * Two things make this robust against markup we have not seen:
 *
 * 1. The collapsed state is expressed as ":not(:hover):not(:focus-within)"
 *    rather than as a rule that hover overrides. Undoing an "!important"
 *    author rule from another author rule is unreliable — "revert" goes back
 *    to the user-agent sheet, not to Engage's own styling — so the rule simply
 *    stops applying instead.
 *
 * 2. The label is hidden twice over, because we cannot assume how it is
 *    wrapped. "color: transparent" covers a bare text node; "opacity: 0" on
 *    the children covers a "<span>" that sets its own colour. The glyph uses a
 *    fixed colour rather than "currentColor", which the first rule would
 *    otherwise make invisible too.
 */
.tc-translate-compact {
  position: relative !important;
  vertical-align: middle;
  transition: opacity .12s ease;
}

/*
 * The collapsed box is sized in BOTH directions, which the first version got
 * wrong: clamping only the width left the label to wrap inside a 1.4em column,
 * so the control became a tall stack of hidden lines and cost more vertical
 * space than the link it replaced. A fixed height, no wrapping and no padding
 * make that impossible.
 */
.tc-translate-compact:not(:hover):not(:focus):not(:focus-within) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
  width: 16px !important;
  min-width: 0 !important;
  max-width: 16px !important;
  height: 16px !important;
  min-height: 0 !important;
  max-height: 16px !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  white-space: nowrap !important;
  line-height: 1 !important;
  font-size: 0 !important;
  color: transparent !important;
  opacity: .55;
}

.tc-translate-compact:not(:hover):not(:focus):not(:focus-within) > * {
  opacity: 0 !important;
}

.tc-translate-compact:not(:hover):not(:focus):not(:focus-within)::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 13px;
  height: 13px;
  background-color: var(--tc-muted);
  -webkit-mask: var(--tc-globe) center / contain no-repeat;
  mask: var(--tc-globe) center / contain no-repeat;
}

.tc-translate-hidden { display: none !important; }

/*
 * The wrapper that holds nothing but the control, collapsed with it.
 * Without this the control shrinks but its row keeps its own padding and
 * min-height, so no vertical space is actually won back. Only applied to a
 * wrapper with no other element children (see rowHost in features/translate).
 */
.tc-translate-row {
  min-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  line-height: 1 !important;
}

.tc-translate-row-hidden { display: none !important; }

/* ---------------------------------------------------------- post chrome -- */

/*
 * Action bars and inline composers, quiet until wanted.
 *
 * Never "display: none" and never "visibility: hidden": either would take the
 * buttons out of the tab order, so a keyboard user could not reach Like or
 * Reply at all. Opacity plus pointer-events keeps them focusable, and every
 * quiet rule is written so that :focus-within wins — tabbing into a post
 * reveals its row exactly as hovering does.
 *
 * Both modes are opt-in. "dim" keeps the row's space and only fades it, which
 * never moves anything; "collapse" reclaims the row but makes the post grow as
 * the pointer reaches it. Which of those is the better trade is a matter of
 * taste, so it is a setting rather than a decision made here.
 */
html.tc-quiet-dim .tc-quiet-post [data-testid="overflow-set"],
html.tc-quiet-collapse .tc-quiet-post [data-testid="overflow-set"] {
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, max-height .12s ease;
}

html.tc-quiet-collapse .tc-quiet-post [data-testid="overflow-set"] {
  max-height: 0;
  overflow: hidden;
}

/*
 * The out-of-flow modes: cluster, cluster-focus and edge.
 *
 * All three win the row's space back for good -- the actions leave the layout
 * when the page loads and never rejoin it, so nothing moves when you point at
 * a post. What they differ in is how much of the post the actions cover while
 * they show, and what summons them.
 *
 * "position: relative" needs !important because Engage sets position on these
 * containers itself with more specific selectors than ours. Losing that
 * contest anchors the actions to the viewport instead of the post, which looks
 * like a bar across the whole window. This is the case the !important
 * convention at the top of this file exists for.
 *
 * The ground is neutral translucent grey over a blur rather than any colour of
 * ours: these sit among Engage's own icons and must suit whichever theme the
 * page is showing, which neither our palette nor Canvas reliably knows.
 */
html.tc-quiet-cluster .tc-quiet-post,
html.tc-quiet-cluster-focus .tc-quiet-post,
html.tc-quiet-edge .tc-quiet-post { position: relative !important; }

html.tc-quiet-cluster .tc-quiet-post [data-testid="overflow-set"],
html.tc-quiet-cluster-focus .tc-quiet-post [data-testid="overflow-set"],
html.tc-quiet-edge .tc-quiet-post [data-testid="overflow-set"] {
  position: absolute;
  bottom: 4px;
  z-index: 4;
  box-sizing: border-box;
  margin: 0;
  opacity: 0;
  transition: opacity .12s ease;
  /*
   * Neutral and translucent, blurred behind: it sits over the post's text,
   * and a fixed colour would be right for only one of Engage's themes.
   */
  border: 1px solid rgba(128, 128, 128, .35);
  background: rgba(128, 128, 128, .14);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .14);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  backdrop-filter: blur(12px) saturate(1.2);
}

/*
 * The cluster hugs its own buttons in a corner, so it costs a corner of the
 * post rather than a line of it: the body stays selectable while you point at
 * it, which a full-width bar makes impossible.
 */
html.tc-quiet-cluster .tc-quiet-post [data-testid="overflow-set"],
html.tc-quiet-cluster-focus .tc-quiet-post [data-testid="overflow-set"] {
  right: 8px;
  left: auto;
  width: max-content;
  max-width: calc(100% - 16px);
  padding: 2px 8px;
  border-radius: 999px;
  pointer-events: none;
}

/* Hover or focus. */
html.tc-quiet-cluster .tc-quiet-post:hover [data-testid="overflow-set"],
html.tc-quiet-cluster .tc-quiet-post:focus-within [data-testid="overflow-set"],
html.tc-quiet-cluster [data-testid="overflow-set"]:focus-within {
  opacity: 1;
  pointer-events: auto;
}

/* Focus only: a mouse never summons it, so nothing is ever covered by one. */
html.tc-quiet-cluster-focus .tc-quiet-post:focus-within [data-testid="overflow-set"],
html.tc-quiet-cluster-focus [data-testid="overflow-set"]:focus-within {
  opacity: 1;
  pointer-events: auto;
}

/*
 * Edge keeps the familiar full-width bar, and pays for it: the strip has to
 * accept the pointer even while invisible in order to be hoverable at all, so
 * the last line of a post is harder to select, and a touch there can reach a
 * button that cannot be seen. That trade is the setting's to make, not ours.
 */
html.tc-quiet-edge .tc-quiet-post [data-testid="overflow-set"] {
  left: 0;
  right: 0;
  width: auto;
  padding: 2px 6px;
  border-radius: 6px;
  pointer-events: auto;
}

html.tc-quiet-edge .tc-quiet-post [data-testid="overflow-set"]:hover,
html.tc-quiet-edge .tc-quiet-post [data-testid="overflow-set"]:focus-within {
  opacity: 1;
}

html.tc-quiet-dim .tc-quiet-post:hover [data-testid="overflow-set"],
html.tc-quiet-dim .tc-quiet-post:focus-within [data-testid="overflow-set"],
html.tc-quiet-dim [data-testid="overflow-set"]:focus-within,
html.tc-quiet-collapse .tc-quiet-post:hover [data-testid="overflow-set"],
html.tc-quiet-collapse .tc-quiet-post:focus-within [data-testid="overflow-set"],
html.tc-quiet-collapse [data-testid="overflow-set"]:focus-within {
  opacity: 1;
  pointer-events: auto;
  max-height: 6rem;
  overflow: visible;
}



/*
 * The inline composer's *opener* — the avatar-and-pill that summons an editor.
 *
 * Only the opener is hidden, and it stays hidden: an editor the reader has
 * actually opened is never given this class, so Reply always produces a box
 * that can be typed into. quiet.js decides which is which.
 *
 * The opener does not come back on hover. Pointing at a post to read it is not
 * a request to write, and a composer springing open under the pointer moves
 * everything below it — the distraction this setting exists to remove. Focus
 * is different: it is deliberate, and a keyboard user has no other way in, so
 * :focus-within still reveals it. This is never "display: none", which is what
 * keeps the opener in the tab order for that to work.
 */
html.tc-quiet-composer-on .tc-quiet-composer {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: max-height .14s ease, opacity .14s ease;
}

html.tc-quiet-composer-on .tc-quiet-composer:focus-within {
  max-height: 16rem;
  overflow: visible;
  opacity: 1;
  pointer-events: auto;
}

/*
 * The "a" key: action bars suppressed outright.
 *
 * Last in this section and marked !important because it has to beat every
 * reveal rule above it, including the :hover and :focus-within ones that are
 * more specific than it is.
 *
 * This is the one place the script uses "visibility: hidden" on a control,
 * which the rest of the file is careful never to do. The reason it is safe
 * here is that it is not a default: somebody asked for it with a keypress,
 * the same keypress undoes it, and the shortcut list says so. Leaving the
 * buttons focusable but invisible would be worse -- tabbing would land on
 * controls nobody can see.
 */
html.tc-quiet-hidden .tc-quiet-post [data-testid="overflow-set"] {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* ------------------------------------------------------------ declutter -- */

.tc-decluttered { display: none !important; }

/* ------------------------------------------------------------ highlight -- */

.tc-unanswered,
.tc-new,
.tc-focus { position: relative; }

.tc-unanswered::before,
.tc-new::before {
  content: "";
  position: absolute;
  left: -6px;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 2px;
  pointer-events: none;
}

.tc-unanswered::before { background: var(--tc-unanswered); }
.tc-new::before { background: var(--tc-new); }
.tc-new.tc-unanswered::before {
  background: linear-gradient(var(--tc-new) 50%, var(--tc-unanswered) 50%);
}

.tc-focus {
  outline: 2px solid var(--tc-accent);
  outline-offset: 3px;
  border-radius: 4px;
}

/* ----------------------------------------------------------- post chips -- */

.tc-post { position: relative; }

/*
 * The copy chip, in whichever corner is free.
 *
 * Engage uses the corners of a post itself -- reactions in one, the action bar
 * along the bottom -- and which one is clear depends on the tenant and the
 * layout, so the corner is a setting rather than a decision made here. The
 * default stays top-right; the class on <html> moves it.
 */
/*
 * Two icon buttons stacked vertically: 26px wide, so the stack sits in the
 * post's own right-hand padding instead of reaching over its text.
 *
 * In the default corner it starts 16px down. Engage draws a post's reactions
 * straddling its top-right edge, reaching about 10px into the post; the old
 * text chip started at 4px and covered the lower part of them. 16px clears
 * them with a small gap, and --tc-chip-top is the one number to move if a
 * layout draws them lower.
 */
.tc-chip {
  --tc-chip-top: 16px;
  position: absolute;
  top: var(--tc-chip-top);
  /* 8px, the same inset as the action cluster, so the two share a right edge. */
  right: 8px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity .12s ease;
}

html.tc-chip-top-left .tc-chip {
  top: 6px;
  bottom: auto;
  left: 4px;
  right: auto;
}

html.tc-chip-bottom-left .tc-chip {
  top: auto;
  bottom: 6px;
  left: 6px;
  right: auto;
}

html.tc-chip-bottom-right .tc-chip {
  top: auto;
  bottom: 6px;
  left: auto;
  right: 8px;
}

/*
 * What summons the chip. Focus always does -- it is the only way a keyboard
 * reaches these buttons at all -- while the pointer does so only in "hover"
 * mode, so a reader who finds them distracting can have them appear for the
 * keyboard alone.
 */
.tc-chip:focus-within { opacity: 1; }
html.tc-chip-hover .tc-post:hover .tc-chip { opacity: 1; }
html.tc-chip-focus .tc-post:focus-within .tc-chip { opacity: 1; }

/*
 * The copy chip is drawn inside a post, so it has to match the post rather
 * than the operating system -- and, it turns out, rather than Canvas too.
 *
 * Our palette follows prefers-color-scheme, the browser's theme, which Engage
 * ignores in favour of its own setting; that once drew a black chip on a white
 * post. Canvas and CanvasText fixed that for a light page, but they follow the
 * page's declared color-scheme, and a page that paints itself dark without
 * declaring it still gets a white Canvas: a white blob on a dark post.
 *
 * The one colour guaranteed to contrast with a post is the colour of its own
 * text. So the buttons inherit it, and everything else is neutral grey at low
 * opacity, which reads on either background. No lookup, no guess about which
 * theme is showing.
 */
.tc-chip .tc-chip-btn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(128, 128, 128, .38);
  border-radius: 8px;
  background: rgba(128, 128, 128, .10);
  color: inherit;
  cursor: pointer;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  transition: background-color .12s ease, border-color .12s ease;
}

.tc-chip .tc-chip-btn .tc-icon {
  width: 14px;
  height: 14px;
  opacity: .72;
  transition: opacity .12s ease;
}

.tc-chip .tc-chip-btn:hover {
  border-color: rgba(128, 128, 128, .65);
  background: rgba(128, 128, 128, .20);
}

.tc-chip .tc-chip-btn:hover .tc-icon { opacity: 1; }

.tc-chip .tc-chip-btn:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

/* --------------------------------------------------------- reading mode -- */

html.tc-reading [role="main"],
html.tc-reading .qaContentMainColumn {
  max-width: var(--tc-reading-width) !important;
  margin-inline: auto !important;
}

html.tc-reading [role="article"],
html.tc-reading .qaThreadStarter,
html.tc-reading .y-fixedGridColumn { line-height: 1.5; }

html.tc-no-rails [role="complementary"],
html.tc-no-rails aside[aria-label] { display: none !important; }

/*
 * The sticky app bar. Off by default: it takes search, the app launcher and
 * the account menu with it, which is a real loss, so it is the reader's call.
 */
html.tc-no-banner [role="banner"] { display: none !important; }

@media (prefers-reduced-motion: reduce) {
  #tc-toasts .tc-toast,
  .tc-translate-compact,
  .tc-chip { transition: none; }
}
`;

/**
 * The globe glyph, as a data URI in a custom property.
 *
 * Inlined rather than loaded: a userscript that fetched an icon from a CDN
 * would add a third-party request to every page view, and Engage's CSP would
 * likely block it anyway.
 */
export const GLOBE_MASK = `
:root {
  --tc-globe: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g fill="none" stroke="black" stroke-width="1.2"><circle cx="8" cy="8" r="6.2"/><ellipse cx="8" cy="8" rx="2.6" ry="6.2"/><path d="M2 6h12M2 10h12"/></g></svg>');
}
`;

export const ALL_STYLES = GLOBE_MASK + STYLES;
