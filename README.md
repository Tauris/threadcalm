# Threadcalm

A userscript that makes [Microsoft Viva Engage](https://engage.cloud.microsoft/) (formerly Yammer)
readable: it opens whole threads for you, lets you copy a conversation as Markdown, quiets the
per-post translation prompts, and adds the keyboard shortcuts the web app never had.

[![CI](https://github.com/Tauris/threadcalm/actions/workflows/ci.yml/badge.svg)](https://github.com/Tauris/threadcalm/actions/workflows/ci.yml)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](LICENSE)

> **Independent project.** Not affiliated with, endorsed by, sponsored by or supported by Microsoft.
> See the [disclaimer](#disclaimer).

## Why

Reading a long Engage thread means clicking `3 replies`, then `Show previous replies`, then
`See more`, over and over, while a `Show translation` link sits under every single post. None of
that is reading. Threadcalm does the clicking.

## Features

| | |
|---|---|
| **Whole-thread expansion** | Clicks reply counters, reply pagination and truncated post text until the conversation is fully open, then stops. |
| **Compact translation controls** | Collapses `Show translation` to a small globe that expands on hover or focus — or hides it entirely on posts already written in a language you read. |
| **Copy as Markdown** | Copies a thread, replies nested as blockquotes, with authors, timestamps and a permalink. Plain text too. |
| **Keyboard shortcuts** | `j`/`k` to move between posts, `c` to copy, `o` to expand, `?` for the list. |
| **Reading mode** | Narrows the column, hides the side rails, tightens the spacing. |
| **Quiet post chrome** | Optionally quiets the Like / Comment / Share bar and the inline comment and reply pills. Six modes for the bar, each trading space against movement against how much of the post is covered. Off by default. |
| **Clutter removal** | Hides cards labelled sponsored, promoted or suggested. |
| **Highlighting** | Marks posts with no replies, and posts you have not seen before. |
| **Any interface language** | Reply counters are found by structure — a button carrying Engage's reply glyph — not by their wording, so thread expansion works whatever language your tenant renders. The controls that are still matched by text ship label packs for English, German, French, Spanish, Dutch and Italian, plus your own patterns. |

Everything is individually switchable, and everything is off the network: the script makes no
requests of its own. See [Privacy](#privacy).

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Edge, Firefox, Safari) or
   [Violentmonkey](https://violentmonkey.github.io/).
2. Open **[dist/threadcalm.user.js](dist/threadcalm.user.js?raw=1)** — your
   userscript manager will offer to install it.
3. Reload Viva Engage.

A bottom-right panel appears once a feed loads. If it does not, see
[Troubleshooting](#troubleshooting).

## Use

The panel in the bottom-right corner shows how much has been expanded and lets you pause. Settings
live behind its **Settings** button, and the script also registers commands in the Tampermonkey menu.

### Keyboard shortcuts

| Key | Action |
|---|---|
| <kbd>j</kbd> / <kbd>k</kbd> | Next / previous post |
| <kbd>o</kbd> | Expand the focused post |
| <kbd>c</kbd> | Copy the focused thread |
| <kbd>y</kbd> | Copy a link to the focused thread |
| <kbd>e</kbd> | Pause or resume automatic expansion |
| <kbd>r</kbd> | Toggle reading mode |
| <kbd>t</kbd> | Cycle the translation-control mode |
| <kbd>s</kbd> | Open settings |
| <kbd>p</kbd> | Show or hide the status panel |
| <kbd>?</kbd> | Show the shortcut list |
| <kbd>Esc</kbd> | Close help or settings |

Shortcuts are ignored while you are typing. The list is shown once on first run; after that
press <kbd>?</kbd> or use the **?** button in the panel.

### Translation controls

`Show translation` under every post is the noisiest thing in a multilingual tenant. Four modes,
switchable with <kbd>t</kbd>:

- **Compact** (default) — the label collapses to a small globe and expands again on hover or
  keyboard focus. The control keeps its role, its handler and its place in the tab order.
- **Hide when I read the language** — compact, plus hidden outright when the post is confidently
  written in one of the languages you listed. Detection is a stop-word guess over the post text
  (see [`src/core/language.js`](src/core/language.js)); it needs a sentence or two, runs in well
  under a millisecond, and never phones anything. When it is unsure, the control stays.
- **Always hide**.
- **Leave unchanged**.

`Show original` is only ever compacted, never hidden — hiding the way back out of a translation
would strand you.

### Copying a thread

<kbd>c</kbd>, the per-post `copy` chip, or the Tampermonkey menu. The thread is expanded first, so
you do not silently copy half a conversation. Output looks like this:

```markdown
## Ada Lovelace — 2026-09-01 09:30

We are moving the release to the end of the month.

> **Grace Hopper** — 2026-09-01 10:00
>
> Does that include the migration work?
>
> > **Ada Lovelace** — 2026-09-01 10:05
> >
> > Yes, everything in the current milestone.

[Open in Viva Engage](https://engage.cloud.microsoft/...)
```

Engage exposes no supported DOM contract, so extraction is best-effort: it reads authors, bodies,
timestamps and reply nesting, and drops action-bar labels. Check anything you are about to paste
somewhere that matters.

## Settings

Every option lives in the settings sheet. The full reference, with defaults and the reasoning
behind each one, is in **[docs/USAGE.md](docs/USAGE.md)**.

Every option is in the panel's settings sheet, grouped by feature, and stored locally through
`GM_setValue` (with a `localStorage` fallback). The ones worth knowing about:

| Setting | Default | Notes |
|---|---|---|
| Where to expand | Feed and single threads | Restrict to single threads to keep the main feed short. |
| Max clicks per page visit | 1500 | Safety limit against runaway clicking. Resets on navigation. |
| Settle delay | 800 ms | How long to let Engage re-render between passes. Raise it on a slow tenant. |
| Like / Comment / Share bar | Always visible | Six modes, from *fade* to a corner cluster to keyboard-only. The settings sheet lists what each one gains and costs. |
| Hide inline comment and reply boxes | off | Hides the pill that opens a composer. Reply still opens an editor, which is never hidden. |
| Interface languages to recognise | English, German | Only affects the text-matched controls; reply counters are found without it. |
| Extra patterns | empty | Your own regular expressions, one per line, if your tenant words things differently. |

## Troubleshooting

**Nothing happens.** Open the console and look for `[Threadcalm] v… ready`. If it is
absent the script was not injected: check that Tampermonkey itself is enabled (a disabled
*extension* looks exactly like a broken script), that this script's switch is on, and that the
extension may read data on `engage.cloud.microsoft`.

**CSP warnings in the console.** Messages naming `content.js`, `contentTrackerLoader.js` or
Microsoft bundles come from the page and other extensions, not from here. This script injects one
`<style>` element and makes no network requests.

**I closed the panel and cannot get it back.** Press <kbd>p</kbd>, or use the userscript
manager's menu: *Show the Threadcalm panel*. <kbd>s</kbd> opens settings whether the panel
is visible or not.

**Reply counters open, but "Show previous comments" or "See more" does not.** Those are still
matched by their wording. Add your tenant's language under *Interface languages to recognise*, or
add a pattern under *Advanced*.

**It clicked something it should not have.** Pause with <kbd>e</kbd>, then
[open an issue](https://github.com/Tauris/threadcalm/issues) with the label text. Menu
controls are excluded by both ARIA attributes and label text, but a new tenant string can slip past.

## Privacy

The script runs entirely in your browser on pages you already have open.

- **No network requests.** No telemetry, no analytics, no remote configuration, no external assets —
  the one icon it uses is an inline SVG.
- **Local storage only.** Your settings, and a capped list of post identifiers used for the
  "seen before" marker. *Forget seen posts* and *Reset to defaults* in the settings sheet clear them.
- **Post text is read, never sent.** Language detection and thread extraction happen in the page.
  Copying puts text on your clipboard, and nowhere else.

## Development

```bash
npm install
npm run build     # bundle src/ -> dist/threadcalm.user.js
npm run watch     # rebuild on change
npm test          # vitest + jsdom
npm run lint
npm run check     # lint + test + build, as CI runs it
```

`dist/threadcalm.user.js` is committed so the raw GitHub URL is installable, and CI fails
if it does not match the sources. Run `npm run build` before committing.

For how the pieces fit together, why it matches on text rather than class names, and what is known
to be fragile, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/DOM-NOTES.md](docs/DOM-NOTES.md). The full user guide is
[docs/USAGE.md](docs/USAGE.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).

## Known limitations

- Engage is a React app with no DOM contract. Class names like `fui-Text` are build output and are
  never matched against; even so, a redesign can break expansion or extraction.
- Only what is in the DOM gets expanded. The script does not scroll the feed for you, and does not
  fetch replies from the API.
- Language detection — the one that decides whether you can already read a post — is a stop-word
  heuristic. It is reliable on a paragraph, unreliable on "Thanks!", and deliberately declines to
  guess rather than hide a control it should not.
- Reply counters aside, controls are still found by their wording. A tenant in a language with no
  label pack gets expansion, but not "See more", the translation controls or clutter removal, until
  a pack or a custom pattern covers it.
- Tested against a limited set of tenants, locales and layouts. Reports welcome.

## Disclaimer

This is an independent, unofficial, community project. It is **not affiliated with, endorsed by,
sponsored by, supported by or connected to Microsoft Corporation** or any of its subsidiaries, and
none of them have reviewed, approved or have any responsibility for it.

- *Microsoft*, *Microsoft 365*, *Viva*, *Viva Engage*, *Yammer*, *Office* and related names, logos
  and marks are trademarks of Microsoft Corporation. They are used here **only** to describe which
  product this script works with — nominative fair use — and no claim is made to them.
- This project contains no Microsoft code, assets or branding. It changes nothing on Microsoft's
  servers: it is a userscript that adjusts how a page already loaded in your own browser is
  displayed, in your own browser session.
- It is provided "as is", without warranty of any kind, under the [BSD 3-Clause License](LICENSE).
  You run it at your own risk.
- **Check your organisation's policy.** Whether browser extensions or userscripts may be used
  against corporate systems is your employer's decision, not this project's. Your tenant may also
  restrict them technically. Nothing here should be read as advice that you are permitted to use it.
- Do not report problems caused or suspected to be caused by this script to Microsoft support.
  Disable it first and confirm the problem still occurs; then report it
  [here](https://github.com/Tauris/threadcalm/issues) if it does not.

## License

[BSD 3-Clause](LICENSE) © 2026 Jörg Türmer
