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
 *     script follows the theme the reader already chose
 */

export const STYLES = `
:root {
  --tc-bg: #ffffff;
  --tc-fg: #242424;
  --tc-muted: #616161;
  --tc-border: rgba(0, 0, 0, .14);
  --tc-shadow: 0 4px 16px rgba(0, 0, 0, .16);
  --tc-accent: #0f6cbd;
  --tc-new: #0f6cbd;
  --tc-unanswered: #c19c00;
  --tc-warn: #a4262c;
  --tc-reading-width: 760px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --tc-bg: #1f1f1f;
    --tc-fg: #f5f5f5;
    --tc-muted: #adadad;
    --tc-border: rgba(255, 255, 255, .16);
    --tc-shadow: 0 4px 16px rgba(0, 0, 0, .5);
    --tc-accent: #62abf5;
    --tc-new: #62abf5;
    --tc-unanswered: #e8c547;
    --tc-warn: #f1707b;
  }
}

/* ---------------------------------------------------------------- panel -- */

#tc-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  width: max-content;
  max-width: min(380px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--tc-border);
  border-radius: 8px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  box-shadow: var(--tc-shadow);
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  opacity: .96;
}

#tc-panel[hidden] { display: none; }

#tc-panel .tc-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

#tc-panel .tc-status {
  flex: 1 1 auto;
  min-width: 10ch;
  color: var(--tc-fg);
}

#tc-panel .tc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tc-accent);
  flex: 0 0 auto;
}

#tc-panel.tc-paused .tc-dot { background: var(--tc-muted); }
#tc-panel.tc-limit .tc-dot { background: var(--tc-warn); }

#tc-panel button,
#tc-settings button,
#tc-settings select {
  font: inherit;
  color: var(--tc-fg);
  background: transparent;
  border: 1px solid var(--tc-border);
  border-radius: 5px;
  padding: 2px 7px;
  cursor: pointer;
}

#tc-panel button:hover,
#tc-settings button:hover { border-color: var(--tc-accent); }

#tc-panel button:focus-visible,
#tc-settings :focus-visible {
  outline: 2px solid var(--tc-accent);
  outline-offset: 1px;
}

/* ------------------------------------------------------------- settings -- */

#tc-settings {
  position: fixed;
  inset: 0;
  z-index: 2147483001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, .35);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}

#tc-settings .tc-sheet {
  width: min(620px, 100%);
  max-height: min(80vh, 760px);
  overflow: auto;
  box-sizing: border-box;
  padding: 18px 20px 22px;
  border-radius: 10px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  box-shadow: var(--tc-shadow);
}

#tc-settings h2 {
  margin: 0 0 2px;
  font-size: 16px;
}

#tc-settings .tc-version {
  margin: 0 0 14px;
  color: var(--tc-muted);
  font-size: 11px;
}

#tc-settings fieldset {
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--tc-border);
  border-radius: 8px;
}

#tc-settings legend {
  padding: 0 4px;
  color: var(--tc-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

#tc-settings .tc-field { margin: 8px 0; }

#tc-settings .tc-field > label {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

#tc-settings .tc-field input[type="number"],
#tc-settings .tc-field select,
#tc-settings .tc-field textarea {
  box-sizing: border-box;
  padding: 3px 6px;
  border: 1px solid var(--tc-border);
  border-radius: 5px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  font: inherit;
}

#tc-settings .tc-field input[type="number"] { width: 9ch; }
#tc-settings .tc-field textarea { width: 100%; min-height: 60px; resize: vertical; }

#tc-settings .tc-help {
  margin: 2px 0 0;
  color: var(--tc-muted);
  font-size: 11px;
}

#tc-settings .tc-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
}

#tc-settings .tc-choices label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

#tc-settings .tc-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

/* Project links. Present only when the repository is public. */
#tc-settings .tc-links {
  margin: 14px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--tc-border);
  color: var(--tc-muted);
  font-size: 11px;
  text-align: center;
}

#tc-settings .tc-links a,
#tc-help .tc-help-note a {
  color: var(--tc-accent);
  text-decoration: none;
}

#tc-settings .tc-links a:hover,
#tc-help .tc-help-note a:hover { text-decoration: underline; }

/* ----------------------------------------------------------------- help -- */

#tc-help {
  position: fixed;
  inset: 0;
  z-index: 2147483002;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, .35);
  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}

#tc-help .tc-help-card {
  min-width: 320px;
  padding: 18px 22px;
  border-radius: 10px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  box-shadow: var(--tc-shadow);
}

#tc-help h2 { margin: 0 0 12px; font-size: 15px; }

#tc-help dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
  margin: 0;
}

#tc-help dt { margin: 0; }
#tc-help dd { margin: 0; color: var(--tc-fg); }

#tc-help kbd {
  display: inline-block;
  min-width: 1.5em;
  padding: 1px 5px;
  border: 1px solid var(--tc-border);
  border-bottom-width: 2px;
  border-radius: 4px;
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center;
}

#tc-help .tc-help-note {
  margin: 14px 0 0;
  color: var(--tc-muted);
  font-size: 11px;
}

/* ---------------------------------------------------------------- toast -- */

#tc-toasts {
  position: fixed;
  right: 16px;
  bottom: 70px;
  z-index: 2147483003;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  pointer-events: none;
}

#tc-toasts .tc-toast {
  max-width: min(340px, calc(100vw - 32px));
  padding: 7px 11px;
  border: 1px solid var(--tc-border);
  border-radius: 6px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  box-shadow: var(--tc-shadow);
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity .18s ease, transform .18s ease;
}

#tc-toasts .tc-toast.tc-in { opacity: .97; transform: none; }
#tc-toasts .tc-toast.tc-warn { border-color: var(--tc-warn); color: var(--tc-warn); }

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
 * The inline composer. Collapsed to a thin strip rather than to nothing, so it
 * still reads as somewhere to click, and expanded by focus as well as hover.
 */
html.tc-quiet-composer-on .tc-quiet-composer {
  max-height: 1.6rem;
  overflow: hidden;
  opacity: .5;
  transition: max-height .14s ease, opacity .14s ease;
}

html.tc-quiet-composer-on .tc-quiet-composer:hover,
html.tc-quiet-composer-on .tc-quiet-composer:focus-within {
  max-height: 16rem;
  overflow: visible;
  opacity: 1;
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

.tc-chip {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 5;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity .12s ease;
}

.tc-post:hover .tc-chip,
.tc-chip:focus-within { opacity: 1; }

.tc-chip button {
  padding: 1px 6px;
  border: 1px solid var(--tc-border);
  border-radius: 4px;
  background: var(--tc-bg);
  color: var(--tc-muted);
  font: 10px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: .02em;
  cursor: pointer;
}

.tc-chip button:hover { color: var(--tc-accent); border-color: var(--tc-accent); }

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
