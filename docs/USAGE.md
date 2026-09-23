# Threadcalm — full guide

Everything the script does, and every switch it exposes. For what it is and how to install it, see
the [README](../README.md).

> Independent project. Not affiliated with, endorsed by or supported by Microsoft. See the
> [disclaimer](../README.md#disclaimer).

## Contents

- [The panel](#the-panel)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Thread expansion](#thread-expansion)
- [Translation controls](#translation-controls)
- [Post chrome](#post-chrome)
- [Reading mode](#reading-mode)
- [Clutter](#clutter)
- [Highlighting](#highlighting)
- [Copying](#copying)
- [Languages and custom patterns](#languages-and-custom-patterns)
- [Settings reference](#settings-reference)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)

## The panel

Bottom-right, once a feed loads. It reports how much has been expanded, and carries the pause
control, a **Settings** button, a **?** button for the shortcut list, and **×** to hide it.

Hiding it is not a one-way door: press <kbd>p</kbd> to bring it back, or use the userscript
manager's menu → *Show the Threadcalm panel*. <kbd>s</kbd> opens settings whether the panel is
visible or not.

The dot changes colour with state: accent while working, grey when paused or off, red when the
per-page click limit has been reached.

## Keyboard shortcuts

| Key | Action |
|---|---|
| <kbd>j</kbd> / <kbd>k</kbd> | Next / previous post |
| <kbd>o</kbd> | Expand the focused post |
| <kbd>c</kbd> | Copy the focused thread |
| <kbd>y</kbd> | Copy a link to the focused thread |
| <kbd>e</kbd> | Pause or resume automatic expansion |
| <kbd>r</kbd> | Toggle reading mode |
| <kbd>t</kbd> | Cycle the translation-control mode |
| <kbd>p</kbd> | Show or hide the status panel |
| <kbd>s</kbd> | Open settings |
| <kbd>?</kbd> | Show the shortcut list |
| <kbd>Esc</kbd> | Close help or settings |

Shortcuts are ignored while a text field, a composer or any editable region has focus, and while
a modifier key is held, so typing a reply can never trigger one. The list is shown once on first
run; after that it is on demand only.

## Thread expansion

The original job. The script clicks reply counters (`3 replies`), reply pagination
(`Show 12 previous comments`) and, optionally, truncated post text (`See more`), waits for Engage
to render, and repeats until three consecutive passes find nothing left to open.

Reply counters are found **without reading their label**: a native button whose own text starts
with a digit and which carries Engage's reply glyph. That holds in every interface language, so
expansion works on a tenant whose language has no label pack. Pagination and `See more` are still
matched by wording.

It will not click the three-dot overflow menu. Controls are rejected when they declare
`aria-haspopup`, when they are already expanded, when they are disabled, when they have no layout
box, or when their accessible name matches a menu word in any active language. Both the ARIA check
and the text check are kept, because either alone has been seen to miss.

**Where to expand** decides whether this runs on the feed as well as inside a single thread.
Restricting it to single threads keeps the main feed short.

**The limits exist to stop a runaway.** If Engage ever changes its labels such that something
unexpected matches, the per-page ceiling bounds the damage. It resets on navigation. If you
genuinely have a thread larger than the ceiling, raise it; if the panel turns red often, that is
worth reporting.

## Translation controls

In a multilingual tenant Engage puts a `Show translation` control under nearly every post, which is
the noisiest chrome on the page. Four modes, cycled with <kbd>t</kbd>:

| Mode | Behaviour |
|---|---|
| **Compact** | The label collapses to a small globe, and expands again on hover or keyboard focus. |
| **Hide when I read the language** | Compact, plus hidden outright when the post is confidently in one of your languages. |
| **Always hide** | Hidden regardless. |
| **Leave unchanged** | Exactly as Engage rendered it. |

`Show original` is only ever compacted, never hidden — hiding the way back out of a translation
would strand you inside it.

### How the language check works

A stop-word count over the post's own text, minus its replies, in the page. No model, no network,
about a kilobyte of word lists. It reports a confidence score, and the control is hidden only above
**Minimum detection confidence**.

It is reliable on a paragraph and unreliable on "Thanks!", so it declines to guess rather than risk
hiding the control on a post you cannot read — that is the worse error of the two. If you see
translate controls surviving on posts you can read, the text was too short to judge; lower the
threshold if you would rather it guessed more freely.

## Post chrome

Furniture that repeats once per post. Both parts are **off by default** and switch independently.

**The Like / Comment / Share bar** has six modes. They are all switchable at any time, and the
default is *Always visible* — nothing is hidden until you ask for it.

Three things are being traded against one another, and no mode wins all three:

| Mode | Wins the row back | Nothing moves | Covers nothing |
|---|---|---|---|
| **Always visible** | — | yes | yes |
| **Fade out until hovered** | — | yes | yes |
| **Collapse until hovered** | yes | — | yes |
| **Corner cluster on hover** | yes | yes | — |
| **Corner cluster, keyboard only** | yes | yes | yes* |
| **Full-width bar at the bottom edge** | yes | yes | — |

\* Nothing is ever covered by a pointer, because a pointer never summons it.

**Fade** only makes the row invisible. It is the safest choice: the page never moves and no text is
ever covered, but the row keeps its space, so you win nothing back vertically.

**Collapse** reclaims the row. The cost is that the post grows again every time the pointer crosses
it, so a feed shifts under you while you read — which is exactly what some people cannot stand and
others never notice.

**Corner cluster** reclaims the row and never moves anything: the actions leave the layout when the
page loads and come back, while you hover a post, as a small group in its bottom-right corner.
Because it hugs its own buttons rather than spanning the column, it costs a corner instead of a
line, so the body of the post stays selectable while you point at it. It takes its background from
the page, so it matches whichever theme Engage is in.

**Corner cluster, keyboard only** is the same thing that a mouse never summons at all. Reading is
completely undisturbed — nothing appears, nothing is covered, ever. You reach the actions by
tabbing into a post. The most aggressive reading mode, and the least discoverable, which is why it
is not the default.

**Full-width bar at the bottom edge** keeps the familiar bar and reclaims the row, but only shows
it while the pointer is at the very bottom of a post. Reading the body never summons it. The price
is that the strip has to accept the pointer even while invisible in order to be hoverable at all,
which makes the last line of a post harder to select, and means a touch there can reach a button
you cannot see.

**Inline comment and reply boxes** can be hidden outright — both the thread's own
"Write a comment" box and the "Write a reply" box under each comment. In a long thread this saves
more than the action bar does.

Only the *opener* is hidden: the avatar-and-pill that summons an editor. An editor you have
actually opened is never hidden, so **Reply** in the action bar always gives you a box you can
type into. That is how you write a reply with this setting on — the pill is redundant once the
action bar is there.

The opener does not come back on hover. Pointing at a post to read it is not a request to write,
and a composer springing open under the pointer moves everything below it, which is the
distraction the setting exists to remove. Keyboard focus is different: it is deliberate, and a
keyboard user has no other route in, so tabbing to the opener still reveals it.

Nothing here uses `display: none`. Every control keeps its place in the tab order, which is what
lets focus reveal it at all, so Like, Reply and the composer all stay reachable without a mouse.

## Reading mode

<kbd>r</kbd>. Narrows the column to a set width, tightens line spacing, and optionally hides the
side rails and the sticky app bar.

Hiding the app bar reclaims real estate but takes search, the app launcher and the account menu
with it, so it is off by default.

## Clutter

Hides feed cards whose label marks them as sponsored, promoted or suggested. Off by default.

Matching is deliberately narrow: only a short, whole label counts, so a post that merely contains
the word "sponsored" in its text will never disappear. Add your own markers under
[Advanced](#languages-and-custom-patterns) if your tenant words them differently.

## Highlighting

Two independent marks, drawn as a coloured rail to the left of a post:

- **Unanswered** — the post has no replies. Read from a nested reply where one exists, and
  otherwise from a reply counter naming a non-zero number, so collapsed threads count correctly.
- **New** — this post has not been seen in a previous session.

"Seen" is a capped list of post identities in local storage. It never leaves the browser, and
*Forget seen posts* in the settings sheet clears it.

## Copying

<kbd>c</kbd> copies the focused thread; <kbd>y</kbd> copies a link to it. Both are also on the
per-post hover chip and in the userscript manager's menu.

The thread is expanded first, so you cannot silently copy half a conversation. A very deeply
paginated thread may need <kbd>c</kbd> twice.

Markdown output nests replies as blockquotes:

```markdown
## Ada Lovelace — 2026-09-01 09:30

We are moving the release to the end of the month.

> **Grace Hopper** — 2026-09-01 10:00
>
> Does that include the migration work?

[Open in Viva Engage](https://engage.cloud.microsoft/...)
```

Plain text indents them instead. Authors, timestamps and the permalink are each switchable.

**Accuracy caveat.** Engage exposes no supported DOM contract, so extraction is best-effort: it
reads authors, bodies, timestamps and reply nesting, and strips action-bar labels. Check anything
you are about to paste somewhere that matters. For records, legal hold or migration, use the API or
Microsoft's export tooling instead — see
[why this is a userscript](ARCHITECTURE.md#why-the-dom-and-not-the-api).

## Languages and custom patterns

Reply counters, action rows and menus are recognised structurally and need no label pack at all.
Everything else — reply pagination, `See more`, the translation controls, promoted-content markers
— is matched on what the interface *says*, because that is the only other part of Engage's markup
that is stable. That part is locale-bound.

Packs ship for English, German, French, Spanish, Dutch and Italian. English, German and French
have been checked against a live tenant; Spanish, Dutch and Italian are offered as a starting point
and have not, so corrections to them are welcome.

**If a text-matched control is not being found, this is almost always why.** Add your tenant's
interface language under *Interface languages to recognise* — note that this is the language of the
Engage **UI**, not of the posts.

If your tenant words something unusually, the **Advanced** group takes your own regular
expressions, one per line, matched case-insensitively against control labels:

- extra reply-expansion patterns
- extra "see more" patterns
- extra promoted/suggested markers

Anchor anything short (`^...$`). An invalid pattern is ignored rather than breaking the rest.

## Settings reference

Everything below is in the settings sheet, grouped as shown, and stored locally.

### Thread expansion

| Setting | Default |
|---|---|
| Expand threads automatically | on |
| Where to expand | Feed and single threads |
| Expand truncated post text | on |
| Max clicks per pass | 40 |
| Max clicks per page visit | 1500 |
| Scan delay | 150 ms |
| Settle delay after clicks | 800 ms |
| Heartbeat interval | 1000 ms (0 disables) |

### Translation controls

| Setting | Default |
|---|---|
| "Show translation" control | Compact icon |
| Languages I read | English, German |
| Minimum detection confidence | 0.55 |

### Post chrome

| Setting | Default |
|---|---|
| Like / Comment / Share bar | Always visible |
| Hide inline comment and reply boxes | off |

### Reading

| Setting | Default |
|---|---|
| Compact reading mode | off |
| Reading column width | 760 px |
| Hide side rails in reading mode | on |
| Hide the top app bar in reading mode | off |

### Clutter, highlighting, copying, keyboard

| Setting | Default |
|---|---|
| Hide suggested and promoted content | off |
| Mark posts with no replies | on |
| Mark posts seen for the first time | on |
| Copy format | Markdown |
| Include the thread link | on |
| Include timestamps | on |
| Show copy buttons on posts | on |
| Keyboard shortcuts | on |

### General and advanced

| Setting | Default |
|---|---|
| Show the status panel | on |
| Interface languages to recognise | English, German |
| Reply icon signatures | Engage's reply-arrow path |
| Verbose console logging | off |
| Extra patterns (three lists) | empty |

## Troubleshooting

**Nothing happens at all.** Open the console and look for `[Threadcalm] v… ready`. If it is absent
the script was not injected: check that the userscript manager itself is enabled — a disabled
*extension* looks exactly like a broken script — that this script's switch is on, and that the
extension may read data on `engage.cloud.microsoft`.

**It loads but finds nothing.** Look for a warning reading `no posts recognised on this page`. That
means Engage's markup has changed. Use *Copy layout diagnostics* from the menu and open an issue
with the result — it reports selector counts and box metrics, and no post text.

**Reply counters work, but pagination or `See more` does not.** Those are still matched by
wording. Add your language under *Interface languages to recognise*, or add a pattern under
*Advanced*.

**Nothing expands at all, in any language.** Engage may have changed its reply glyph. The path
prefix lives in *Reply icon signatures* under *Advanced* and can be corrected there without waiting
for a release; clearing it falls back to label matching.

**Something got clicked that should not have been.** Pause with <kbd>e</kbd> and report the exact
label text of the control. Menu controls are excluded by both ARIA and text, but a new tenant
string can slip past.

**CSP warnings in the console.** Messages naming `content.js`, `contentTrackerLoader.js` or
Microsoft bundles come from the page and other extensions. This script injects one `<style>`
element and makes no network requests.

**The panel is gone.** <kbd>p</kbd>.

## Privacy

The script runs entirely in your browser, on pages you already have open.

- **No network requests.** No telemetry, no analytics, no remote configuration, no external assets.
- **Local storage only** — your settings, and a capped list of post identifiers for the "new" mark.
- **Post text is read, never sent.** Language detection and extraction happen in the page. Copying
  puts text on your clipboard and nowhere else.
- **Diagnostics carry no content** — tag names, roles, counts and box metrics only.
