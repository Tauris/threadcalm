# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-09-26

### Changed

- **The README and the Greasy Fork listing now lead with translation.** Reading a thread written in
  several languages is what 1.1.0 changed most, and both described it only in passing. The README
  gains a *Reading threads in other languages* section and two feature rows; the listing a feature
  bullet. No change to the script.

## [1.1.0] - 2026-09-26

### Added

- **Automatic translation**, off by default. Switch it on in the settings or with
  <kbd>Shift</kbd>+<kbd>T</kbd>, and Threadcalm presses Engage's own `Show translation` once per
  post, for posts that have been on screen for half a second and are confidently in a language you
  do not read. Posts you scroll past or never reach are left alone; several at once are translated
  400 ms apart. Switching it off stops it at once, and so does pausing expansion with
  <kbd>e</kbd>. `Show original` sticks: a post you turned back is not translated again.
- **Translated posts are marked in copies** ("*Translated from Japanese by Engage.*"), whoever
  translated them. With automatic translation on, <kbd>c</kbd> translates the thread's foreign
  posts first, including the ones off screen, with a progress toast. **Include the original under
  translated posts** (off by default) adds the author's own text below each translation.
- **Writing-system detection** for Japanese, Chinese, Korean, Greek, Thai, Armenian and Georgian.
  It takes precedence over stop words, so a Japanese post quoting English is still Japanese; text
  in Chinese characters alone is treated as possibly either Chinese or Japanese.
- **Label packs for all 36 languages Engage offers**, from labels observed on a live page in each.

### Changed

- **Your Engage language is picked up from the page.** The label pack now follows Engage's own
  language setting; *Interface languages to recognise* becomes *Additional interface languages*,
  empty by default. A page in a language without a pack is reported once, and in the layout
  diagnostics.
- **`See more` and the translation controls are recognised by structure**, in any interface
  language, with wording as the fallback. `See more` is clicked at most once per post.
- **`Show original` is no longer compacted.** Its label, `Show original (Japanese)`, is the only
  sign that a post is translated and names the source language.
- Links, buttons and timestamps no longer count towards a post's detected language.

### Fixed

- `Show original (Japanese)` and other labels with the source language in brackets were not
  recognised.
- A label pack without a pattern for some control could have produced a pattern matching every
  label.

## [1.0.8] - 2026-09-24

### Fixed

- **The Greasy Fork listing garbled umlauts, dashes and other non-ASCII characters.** GitHub serves
  the listing as UTF-8 and says so, but Greasy Fork's preview of synced additional info read it as a
  single-byte encoding. The listing is now plain ASCII, with HTML entities (`&ouml;`, `&mdash;`,
  `&copy;`) for everything else, which render identically whatever encoding is assumed; a test
  keeps it that way. No change to the script.

## [1.0.7] - 2026-09-24

### Added

- **The Greasy Fork listing now lives in the repository**, as
  [docs/GREASYFORK.md](docs/GREASYFORK.md), and Greasy Fork syncs its description from there. A
  release that changes a feature can now change the listing's description in the same commit,
  rather than leaving it stale while the script updates itself. No change to the script.

## [1.0.6] - 2026-09-24

### Changed

- **Reading mode now does what it says.** It was built as layout — a narrower column, hidden side
  rails, tighter lines — aimed at page landmarks Engage turned out not to use, so on a real page
  it did little more than centre the column. It is now one switch for a quiet page, built from
  features known to work: the action bar as a corner cluster, comment boxes and copy buttons out
  of sight, translate controls as an icon, promoted cards and the app bar gone. It only ever makes
  the page quieter, leaving alone anything you have already made at least as quiet.
- **Reading mode never changes your settings.** It holds settings quieter for as long as it is on,
  and switching it off hands back exactly what you had. The settings sheet keeps showing and
  editing your own values, tags the ones it is holding, and says so at the top; the panel shows a
  **Reading** pill while it is on, which also switches it off.
- The reading column width and the side-rail switch are gone, since neither had an effect on
  Engage. *Hide the top app bar in reading mode* is now *Keep the app bar in reading mode*, off by
  default, so the app bar goes with reading mode unless you keep it.

## [1.0.5] - 2026-09-24

### Fixed

- **Copying a thread copied a single reply.** Extraction read a post and whatever was nested inside
  it — right for layouts that nest a reply inside the post it answers, wrong for Engage's
  conversation view, where the starter and every comment are siblings in a flat list. So copying
  from anywhere below the starter produced that one comment alone. A thread is now the starter plus
  every post after it up to the next starter, reply depth is rebuilt from indentation (the only
  nesting that layout expresses), and the whole conversation is expanded before it is read, since
  "Show previous comments" sits between posts rather than inside one. *Copy link* likewise copies
  the thread's link rather than a reply's.
- **A thread's opening post was copied under its author's initials.** Engage draws an avatar with
  no photo as the author's initials, and makes it a profile link just like the name beside it.
  The author was taken from the first profile link in the post, so where the avatar came first the
  post was headed `## KJ` — and because the header was then stripped by matching that, the full
  name was left at the top of the body. Initials-only links are now passed over in favour of the
  name, the action buttons' "Like – *name*'s post" label is the fallback, and both the initials
  and the name are removed from the start of the body.
- **<kbd>c</kbd> kept copying the same post after you scrolled.** With no post chosen by
  <kbd>j</kbd>/<kbd>k</kbd>, the first press picked the topmost visible post — and then remembered
  it for good, so every later press copied where you had been rather than where you were. It now
  looks again each time, and a post chosen with <kbd>j</kbd>/<kbd>k</kbd> is kept only while it is
  still on screen.

## [1.0.4] - 2026-09-24

### Changed

- **The script's own windows have a design, rather than native controls with borders added.** The
  panel, the settings sheet, the shortcut overlay and the toasts share one set of tokens, built on
  the teal of the script's icon instead of borrowed Engage blue, so they read as a tool of their
  own rather than a broken piece of the page. The settings sheet now has a header with a close
  button, a scrolling body of grouped rows and a footer that keeps *Done* in reach; switches, pill
  toggles and spinner-free number fields replace the native controls.
- **The copy and link buttons are icons, stacked, and clear of the reactions.** They were two text
  boxes side by side at the top of the post, covering the lower part of the reaction emojis Engage
  draws across a post's top-right edge. They are now a narrow vertical stack that starts below the
  reactions and sits in the post's own right-hand padding rather than over its text, sharing a
  right edge with the action-bar cluster.
- **Controls drawn inside a post take their colour from the post.** The copy buttons and the
  action-bar cluster used the system colour `Canvas`, which follows the page's *declared* colour
  scheme; a page that paints itself dark without declaring it still gets a white `Canvas`, so they
  would have shown as white blobs on a dark Engage. The buttons now inherit the post's own text
  colour, and the cluster sits on translucent neutral grey over a blur, which reads in either
  theme.
- **Choices that are trade-offs are now cards.** Each option shows what it gains and what it costs,
  so the comparison happens where the choice is made rather than in a legend under a dropdown.
- **Native controls follow the theme.** Nothing declared `color-scheme`, so a dark sheet had its
  number spinners, dropdown lists and scrollbars drawn in the light theme, as white blobs.
- Languages without a label pack are named in their own language — *Português*, *Dansk*,
  *Svenska*, *Polski* — instead of by code.
- The panel's status line alone is announced to screen readers, rather than every button in the
  panel.

### Added

- **A *Copy diagnostics* button in the settings sheet**, and an activity section in the report it
  produces: seconds running, scans, controls examined, layout reads, elements on the page, and how
  long since the last scan. A memory graph sawtooths as the collector runs and so cannot tell you
  whether anything is wrong; two copies of this taken minutes apart can, because on an idle page
  the counters should barely move. The same report was already available from the userscript
  manager's menu, which is not where someone worried about a runaway would think to look.

### Fixed

- **The script grew heavier the longer a tab stayed open, until the browser was swamped.** Not one
  leak but three faults that compounded, each harmless alone and ruinous together on a long feed
  left running overnight.

  - *Every candidate control was laid out to read its name.* `accessibleTexts()` called
    `innerText`, which flushes layout, on every `button`, `a`, `span` and `[role="button"]` in the
    document — and it did so before checking whether the text could possibly be a label, so a span
    holding a whole post body was rendered to a string only to be discarded for being too long.
    Five features do this on every sweep. It now checks `textContent`, which is free, and skips
    the expensive read for anything holding more raw text than a label could plausibly be.
  - *The heartbeat never stopped.* Once a thread was fully open the script kept rescanning the
    whole document every second regardless, forever. It now scans when something has actually
    changed, and once settled falls back to one check in ten beats — keeping the safety net for
    replies that arrive without a reportable mutation, at a tenth of the cost.
  - *The script reacted to its own writing.* The mutation observer did not exclude this script's
    own elements, so the status panel rewriting "Expanding… 12 items" counted as page activity:
    that ran every feature's sweep, which reported progress, which rewrote the panel. The same
    applied to the copy chip being removed by a React re-render and put back. Both loops now stop
    at the observer.

  Together these meant a feed that never stopped growing was being rescanned several times a
  second, with a forced reflow per element, on a main thread too busy for the collector to keep
  up.

## [1.0.3] - 2026-09-23

### Added

- **Every window the script opens now says what it is, and links to the project.** The status
  panel, the settings sheet and the shortcut overlay each carry *Threadcalm* as a link to the
  repository. A panel appearing over someone's Engage page with no way to find out what put it
  there is the kind of thing people are right to distrust, and the answer should be one click away
  from the thing itself rather than only in a settings sheet they have to go looking for. The link
  is built in one place, so the three cannot drift apart, and it falls back to plain text in a
  private fork exactly as the other in-page links do.

## [1.0.2] - 2026-09-23

### Added

- **<kbd>a</kbd> hides the action bars outright, or shows them again.** Every mode reveals the bar
  on something — a hover, a focus — and a control that appears and disappears is itself the
  distraction. So this is a two-position switch across all of them: *hidden*, where nothing comes
  up at all, and *shown*, where the configured mode applies exactly as chosen. It works in every
  mode including *Always visible*, which is where hiding them is worth having most. A live switch
  rather than a setting, so it lasts until the tab is reloaded and never rewrites the settings
  sheet; choosing a mode returns it to *shown*, being the more explicit instruction of the two.
  While hidden the buttons leave the tab order, rather than staying focusable but invisible.
- **The copy buttons can be left to the keyboard.** They are this script's own invention — Engage
  has nothing like them — and they exist only as a visible reminder that copying is possible, so
  *Copy buttons on posts* now offers three answers rather than two: on hover, on keyboard focus
  only, or never. <kbd>c</kbd> and <kbd>y</kbd> work identically in all three, so switching them
  off loses no ability. A setting stored by 1.0.1, when this was a switch, is carried over rather
  than reset.
- **The copy buttons' corner is now a setting.** Engage draws its own controls in a post's corners
  — reactions in one, the action bar along the bottom — and which corner is free differs between
  tenants and layouts, so the chip was landing on the reactions. Four corners to choose from, each
  listed with what it gains and costs; *bottom right* is flagged as colliding with the action
  bar's corner cluster, if you use that.

### Fixed

- **The copy and link buttons were a black rectangle on a light page.** They took their colours
  from `prefers-color-scheme`, which is the browser's theme, while Engage follows its own setting
  — so a dark OS with Engage in light mode drew a dark chip inside a white post. Anything the
  script draws inside a post now uses the CSS system colours, which resolve against the scheme in
  force where the element is actually drawn. The action cluster was fixed the same way in 1.0.1;
  this applies the rule to the chip, and writes it down where the palette is defined so the next
  widget starts out right.

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

[1.1.1]: https://github.com/Tauris/threadcalm/releases/tag/v1.1.1
[1.1.0]: https://github.com/Tauris/threadcalm/releases/tag/v1.1.0
[1.0.8]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.8
[1.0.7]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.7
[1.0.6]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.6
[1.0.5]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.5
[1.0.4]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.4
[1.0.3]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.3
[1.0.2]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.2
[1.0.1]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.1
[1.0.0]: https://github.com/Tauris/threadcalm/releases/tag/v1.0.0
