# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-22

First public release.

### Added

- **Whole-thread expansion.** Clicks reply counters, reply pagination and truncated post text
  until the conversation is fully open, then stops. Reply counters are matched as a whole label
  (`3 replies`, `1 Antwort`), anchored at both ends so they cannot collide with prose. Clicks
  resolve to the nearest genuine interactive ancestor rather than the label element, and menu
  controls are rejected by both ARIA attributes and label text.
- **Compact translation controls.** `Show translation` collapses to a small globe that expands on
  hover or keyboard focus, and can be hidden entirely on posts already written in a language you
  read. Language detection is a local stop-word guess with a confidence floor; it declines to
  guess rather than hide a control it should not. `Show original` is only ever compacted.
- **Copy a thread** as Markdown or plain text, with replies nested as blockquotes, plus authors,
  timestamps and a permalink. Expands the thread first, so a partial transcript is not copied
  silently. Authors are recovered from action-button accessible names when the post header cannot
  be parsed, and action-bar text is stripped from bodies.
- **Keyboard shortcuts** for post navigation, expansion, copying, reading mode, translation mode,
  the status panel and settings, with a <kbd>?</kbd> help overlay shown once on first run. Inert
  while you are typing.
- **Reading mode** — narrower column, tighter spacing, and optional hiding of the side rails and
  the sticky app bar.
- **Quiet post chrome**, off by default and switchable per part: the Like / Comment / Share bar can
  fade (keeping its space) or collapse (reclaiming the row), and inline "Write a comment" boxes can
  collapse to a strip until clicked. Neither uses `display: none`, and both reveal on keyboard
  focus as well as hover, so every control stays reachable.
- **Clutter removal** for cards labelled sponsored, promoted or suggested.
- **Highlighting** of posts with no replies and posts not seen before.
- **Status panel** with a live counter, a pause control, a shortcut-list button and a way into
  settings, plus commands in the userscript manager's menu. Hiding it is reversible with
  <kbd>p</kbd>.
- **Settings panel** rendered from the settings schema, covering limits, delays, languages and
  custom label patterns. Persisted via `GM_setValue`, falling back to `localStorage`.
- **Expansion that does not depend on the interface language.** Reply counters are recognised
  structurally — a native button whose own label opens with a decimal digit and which carries
  Engage's reply glyph — so a thread opens on a tenant whose language has no label pack. Checked
  across English, German, French, Japanese, Simplified Chinese and Brazilian Portuguese. The glyph
  signature is a setting, so a redesign is a one-line fix rather than a release. Label packs remain
  the fallback, and still drive pagination, `See more`, the translation controls and clutter
  removal.
- **Robust post detection.** Semantic containers are used where a layout provides them and action
  rows (`[data-testid="overflow-set"]`) otherwise, on the rule that every post has exactly one.
  A console warning fires once if a page yields no posts at all.
- **SPA navigation handling** — expansion re-runs and counters reset on route changes, rather than
  running once at `document-idle`.
- **Label packs** for English, German, French, Spanish, Dutch and Italian, plus user-supplied
  patterns for tenants that word things differently.
- **Diagnostics** — a *Copy layout diagnostics* menu command reporting selector health, resolved
  post counts and box metrics, and no post content.
- Non-affiliation and trademark notices in the README and in the installed file itself.
- Test suite (Vitest + jsdom), ESLint configuration, an esbuild build, and CI that fails if the
  committed `dist/` bundle is stale.

[1.0.0]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.0
