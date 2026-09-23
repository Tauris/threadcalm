# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-09-23

### Fixed

- **"Write a reply" boxes stayed visible when inline composers were hidden.** Before it is
  activated, Engage renders the reply composer as a plain `button` whose name is its own visible
  text — no `aria-label`, no `placeholder`. The detector scanned only text fields and read only
  naming attributes, so it saw the thread's "Write a comment" box and missed every reply box,
  leaving an avatar and a rounded pill under each comment. It now scans buttons as well and matches
  on accessible text, still whole-label so prose containing the words is never touched.
- **CI could not install the project.** `package-lock.json` carried `"version": "1.2.0"` in fifteen
  places — the root entry plus fourteen unrelated transitive packages, each contradicting its own
  `resolved` tarball URL — so `npm ci` refused the tree as out of sync. A local `node_modules` was
  masking it, because npm rebuilds the lock from its hidden lockfile inside `node_modules` rather
  than from the registry. Anyone cloning 1.0.0 hit it on first install.
- The tagged wrapper is now the composer's own container (`[data-testid="focus-catcher-wrapper"]`,
  alongside the form fallback) rather than the button's immediate parent, which had left the avatar,
  the pill and the drag-and-drop area on screen. Padded blocks that exist only to hold the composer
  collapse with it; a block shared with anything else is left alone.

### Added

- **A `beta` distribution channel**, so a build can be exercised against a real tenant before it
  reaches `main`. It is built from the same sources and differs only in identity — *Threadcalm
  (beta)*, namespace `…#beta` — and in the two URLs it updates from, which track the `beta`
  branch. Because a userscript manager keys on `@name` plus `@namespace`, the beta installs beside
  a stable copy rather than replacing it. `npm run build` writes both artefacts and `npm run check`
  verifies both. See *Testing a build before it ships* in CONTRIBUTING.md.

- **Reply did nothing while inline composers were hidden.** The detector treated the collapsed
  opener and the expanded editor as the same thing, so clicking Reply opened an editor inside a
  wrapper that was still being hidden and nothing appeared to happen. The two are now told apart:
  only the opener is ever hidden, and a wrapper is released the moment an editor appears inside
  it — including one tagged on an earlier pass, since the same wrapper holds both in turn.

### Changed

- Hiding inline composers now hides them, instead of collapsing them to a thin strip that still
  read as clutter, and the opener stays hidden rather than springing back under the pointer —
  pointing at a post to read it is not a request to write, and a composer opening on hover moves
  everything below it. Keyboard focus still reveals it, because it is deliberate and a keyboard
  user has no other route in; this is still never `display: none`, which is what keeps the opener
  in the tab order for that to work. The setting is now labelled *Hide inline comment and reply
  boxes*.
- **Six modes for the Like / Comment / Share bar, not two.** The choice trades three things
  against one another — whether the row's space is won back, whether anything moves as you point
  at a post, and how much of the post is covered while the actions show — and no mode wins all
  three, so it is a choice rather than a default. Added: a corner cluster that reclaims the row
  and never moves anything, the same cluster summoned by keyboard only, and a full-width bar that
  appears only at a post's bottom edge. The settings sheet now lists what each mode gains and
  costs beside the choice itself, and USAGE.md compares them in full.
- The first-run overlay now mentions that these display options exist. Nothing is hidden by
  default, which is the right default but also means nobody finds the options unless they are
  told.

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

[1.0.1]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.1
[1.0.0]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.0
