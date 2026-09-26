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

Its top line names the script, the version and the build, and *Threadcalm* is a link to the
project. Every window this script opens carries that link, so whatever appears on your page can
always be traced back to what put it there in one click.

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
| <kbd>v</kbd> | Overview: keep feeds compact, or let them open again |
| <kbd>c</kbd> | Copy the focused thread |
| <kbd>y</kbd> | Copy a link to the focused thread |
| <kbd>e</kbd> | Pause or resume automatic expansion (pausing also switches automatic translation off) |
| <kbd>a</kbd> | Hide the action bars outright, or show them again |
| <kbd>r</kbd> | Reading mode on or off |
| <kbd>t</kbd> | Switch automatic translation on or off |
| <kbd>Shift</kbd>+<kbd>T</kbd> | Cycle the translation-control mode |
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
expansion works on a tenant whose language has no label pack. `See more` is recognised by its
place in the post body the same way; only pagination is still matched by wording.

**Long posts open as you reach them.** Replies are opened as soon as they are found, but a
truncated post is opened only once it has been on screen for a moment — the way automatic
translation works — so a long feed is not unfolded in the background and the page does not jump
under you. Posts you scroll past, or never reach, stay as they are. <kbd>o</kbd>, copying a thread
and *Expand everything on this page now* still open every post they cover at once.

It will not click the three-dot overflow menu. Controls are rejected when they declare
`aria-haspopup`, when they are already expanded, when they are disabled, when they have no layout
box, or when their accessible name matches a menu word in any active language. Both the ARIA check
and the text check are kept, because either alone has been seen to miss.

**Where to expand** decides whether this runs on the feed as well as inside a single thread.
Restricting it to single threads keeps the main feed short.

**Overview** (<kbd>v</kbd>) is the same idea as a key, for skimming. While it is on, nothing on a
feed opens by itself — neither replies nor long posts — so you see many posts at a glance. The
panel shows an *Overview* pill; click it, or press <kbd>v</kbd> again, and the feed opens as usual.

- <kbd>o</kbd> opens the post you are on, and <kbd>c</kbd> still copies a whole thread.
- A single conversation opens regardless: opening one is a request to read it.
- Translation carries on, so a feed in other languages stays readable while you skim.
- It is remembered until you switch it off. Posts already open are not closed again.

It is not the same as pausing with <kbd>e</kbd>. Pausing is the emergency stop: it halts every
click, automatic translation included, and lasts until you resume or reload.

**The limits exist to stop a runaway.** If Engage ever changes its labels such that something
unexpected matches, the per-page ceiling bounds the damage. It resets on navigation. If you
genuinely have a thread larger than the ceiling, raise it; if the panel turns red often, that is
worth reporting.

## Translation controls

In a multilingual tenant Engage puts a `Show translation` control under nearly every post, which is
the noisiest chrome on the page. Four modes, cycled with <kbd>Shift</kbd>+<kbd>T</kbd>:

| Mode | Behaviour |
|---|---|
| **Compact** | The label collapses to a small globe, and expands again on hover or keyboard focus. |
| **Hide when I read the language** | Compact, plus hidden outright when the post is confidently in one of your languages. |
| **Always hide** | Hidden regardless. |
| **Leave unchanged** | Exactly as Engage rendered it. |

`Show original` is never compacted or hidden, whatever the mode. It is the way back out of a
translation, and its label — `Show original (Japanese)` — is what tells you the text in front of you
is not what the author wrote.

### Automatic translation

Off by default. Switch on **Automatic translation** — in the settings, or with
<kbd>t</kbd> — and Threadcalm presses Engage's own
`Show translation` for you, once per post, when the post is on your screen — and only when it is
confidently in a language that is not on your **Languages I read** list.

- **Off means off, at once.** <kbd>t</kbd> again, or unticking the setting, stops
  it immediately, including posts already waiting their turn. Posts it has translated stay
  translated; `Show original` takes each one back.
- **Pausing expansion switches it off too.** <kbd>e</kbd>, the panel's pause button or the
  Tampermonkey menu: whichever you reach for when the script is doing too much, translation stops
  with it. Resuming expansion does not switch translation back on.
- **Only what you are looking at.** A post is translated after it has been on screen for half a
  second. The one exception is copying a thread — see [Translated posts](#translated-posts). Posts you scroll past, posts further down that you never reach, and anything in a
  background tab are left alone.

- **It is Engage's translation.** Threadcalm clicks the native control; the text goes to Microsoft's
  translation service exactly as if you had clicked it yourself. Threadcalm itself still sends
  nothing anywhere.
- **Once per post.** Press `Show original` and the post stays in its original language.
- **Unsure means no.** Posts too short to judge ("Merci !") are left for you to translate by hand.
  Text written only in Chinese characters could be Chinese or Japanese; it is translated only if you
  read neither.
- **One at a time.** When several foreign posts are on screen at once, they are translated a
  fraction of a second apart rather than in a single burst.
- It works in every mode, including *Leave unchanged*, and wins over hiding: a post it is about to
  translate keeps its control.

### How the language check works

A stop-word count over the post's own text, minus its replies, links and buttons, in the page.
Japanese, Chinese, Korean, Greek, Thai, Armenian and Georgian are recognised by their writing system
instead, and that takes precedence: a Japanese post quoting a paragraph of English is still a
Japanese post, and is translated for a reader who does not read Japanese. It takes about a short
sentence in that script to count, so one borrowed word in an English post does not. No model, no network, about a kilobyte of word lists. It reports a confidence score, and
the control is hidden — or the post translated automatically — only above
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

Whichever mode you pick, <kbd>a</kbd> is the switch across all of them. It has two positions:

- **Hidden** — the action bars do not come up at all. No hover reveals them, no focus reveals
  them, nothing appears while you read. Every mode reveals the bar on *something*, and a control
  that comes and goes is itself the distraction; this is the way to have none of it.
- **Shown** — the mode you chose above applies exactly as configured.

It is a live switch, not a setting: it lasts until the tab is reloaded and never rewrites what you
chose here. Changing the mode returns it to *shown*, since picking a mode is the more explicit
instruction of the two.

It works in every mode, including *Always visible* — that is precisely where hiding them is worth
having, since otherwise they never go away.

While hidden, the buttons leave the tab order rather than staying focusable but invisible, which
would only strand a keyboard user on controls nobody can see. This is the one place the script does
that to a control, and it is safe because you asked for it with a keypress and the same keypress
undoes it.

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

<kbd>r</kbd> switches the page into a quiet state in one step, and the same key switches it back.
While it is on:

| | Reading mode sets | unless you already chose |
|---|---|---|
| Like / Comment / Share bar | Corner cluster on hover | Corner cluster, keyboard only |
| Inline comment and reply boxes | hidden | — |
| Copy buttons on posts | only when tabbing into a post | never |
| "Show translation" control | compact icon | hide when I read it, always hide |
| Sponsored and suggested cards | hidden | — |
| The app bar at the top | hidden | *Keep the app bar in reading mode* |

It only ever makes the page quieter. Where your own choice is already at least as quiet, reading
mode leaves it alone.

**It never changes your settings.** It holds those settings quieter for as long as it is on, and
switching it off hands back exactly what you had. While it is on, the settings sheet still shows and
edits *your* values; a row it is holding is tagged **Reading mode**, and anything you change there
takes effect once reading mode is off. The panel shows a **Reading** pill while it is on, which is
also a way out of it.

Hiding the app bar takes search, the app launcher and the account menu with it. If you need those
while reading, switch on *Keep the app bar in reading mode*.

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

**The chip is this script's own invention** — Engage has nothing like it. It exists only as a
visible reminder that copying is there at all, so **Copy buttons on posts** offers three answers:
show it when you point at a post, show it only when you tab into one, or never show it and copy
with <kbd>c</kbd> and <kbd>y</kbd>. The shortcuts work identically in all three, so switching it
off costs you no ability, only the reminder.

While it is shown, it sits in the post's top-right corner by default. Engage uses those corners
itself — reactions in one, the action bar along the bottom — and which one is free differs between
tenants, so **Where the copy buttons sit** moves it to any of the four. Note that *bottom right* is
where the action bar's corner cluster appears, if you have that switched on.

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

### Translated posts

**A translation is always marked.** On the page, `Show original (Japanese)` tells you a post is not
in its author's words; in a copy that cue would be gone, so a translated post is followed by
*Translated from Japanese by Engage.* That holds whether Threadcalm translated it or you did.

**With automatic translation on, <kbd>c</kbd> translates the whole thread first** — including the
posts that are not on your screen, which automatic translation otherwise never touches. You asked
for the whole conversation, so its foreign posts are translated before it is copied, under the
same rules otherwise: only posts confidently in a language you do not read, never one you turned
back to its original, one at a time. A toast counts them off ("Translating 3 of 7…").

- A post Engage does not translate within a few seconds is copied as written.
- At most 40 posts are translated per copy; the rest are copied as written, and the toast says so.
- <kbd>t</kbd> or pausing expansion stops it between posts, and what is there is copied.
- The posts stay translated on the page afterwards.

With automatic translation off, <kbd>c</kbd> copies what the page shows and translates nothing.

**Include the original under translated posts** (off by default) adds the text as its author wrote
it below the translation, so whoever reads the copy can check it:

```markdown
> **Grace Hopper** — 2026-09-01 10:00
>
> Thanks, that works for us.
>
> *Translated from Japanese by Engage.*
>
> *Original:*
>
> ありがとうございます、それで大丈夫です。
```

The original is captured at the moment a post is translated. For a post translated before
Threadcalm was running, the copy says the original was not captured.

**Accuracy caveat.** Engage exposes no supported DOM contract, so extraction is best-effort: it
reads authors, bodies, timestamps and reply nesting, and strips action-bar labels. Check anything
you are about to paste somewhere that matters. For records, legal hold or migration, use the API or
Microsoft's export tooling instead — see
[why this is a userscript](ARCHITECTURE.md#why-the-dom-and-not-the-api).

## Languages and custom patterns

Most of Threadcalm needs no labels at all. Recognised by their structure, in every interface
language:

- reply counters (a button with Engage's reply glyph and a leading number);
- action rows and menus;
- `See more` on a long post (Engage's link-styled button inside the post body);
- `Show translation` and `Show original (…)` (the same kind of button, between the body and the
  action row; the source language in brackets is what marks a post as translated).

Only reply pagination ("Show 3 previous comments") and sponsored or suggested cards are still
matched on what the interface *says*. Label packs cover all 36 languages Engage offers, from labels
observed on a live page in each of them; pagination is known in English, German, French, Spanish,
Dutch, Italian and Arabic so far.

**The right pack is chosen for you.** Engage writes your interface language into the page, from
your own Engage language setting, and Threadcalm uses the matching pack automatically. When Engage
is in a language with no pack, Threadcalm says so once, and *Copy layout diagnostics* reports it.
Thread expansion by reply counter keeps working; the text-matched controls above do not, until a
pack or your own patterns cover them.

*Additional interface languages* is only for pages that mix several, or to add a pack by hand. It
is the language of the Engage **UI**, not of the posts.

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
| Overview: keep feeds compact | off |
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
| Automatic translation | off |

### Post chrome

| Setting | Default |
|---|---|
| Like / Comment / Share bar | Always visible |
| Hide inline comment and reply boxes | off |

### Reading

| Setting | Default |
|---|---|
| Reading mode | off |
| Keep the app bar in reading mode | off |

### Clutter, highlighting, copying, keyboard

| Setting | Default |
|---|---|
| Hide suggested and promoted content | off |
| Mark posts with no replies | on |
| Mark posts seen for the first time | on |
| Copy format | Markdown |
| Include the thread link | on |
| Include timestamps | on |
| Include the original under translated posts | off |
| Copy buttons on posts | Show when I point at a post |
| Where the copy buttons sit | Top right |
| Keyboard shortcuts | on |

### General and advanced

| Setting | Default |
|---|---|
| Show the status panel | on |
| Additional interface languages | none (the page's own language is used) |
| Reply icon signatures | Engage's reply-arrow path |
| Verbose console logging | off |
| Extra patterns (three lists) | empty |

## Troubleshooting

**Nothing happens at all.** Open the console and look for `[Threadcalm] v… ready`. If it is absent
the script was not injected: check that the userscript manager itself is enabled — a disabled
*extension* looks exactly like a broken script — that this script's switch is on, and that the
extension may read data on `engage.cloud.microsoft`.

**It loads but finds nothing.** Look for a warning reading `no posts recognised on this page`. That
means Engage's markup has changed. Use **Copy diagnostics** in the settings sheet — or *Copy layout
diagnostics* from the userscript manager's menu — and open an issue with the result. It reports
selector counts, box metrics and activity counters, and no post text.

**It feels like it is doing something when it should be idle.** The diagnostics report ends with an
activity section: seconds running, scans, controls examined, layout reads, elements on the page,
and seconds since the last scan. Copy it, wait a few minutes on a page you are not touching, and
copy it again. On an idle page the first four should barely move. A rising element count means the
page itself is still growing, which is expansion working rather than anything wrong.

A browser's own memory graph cannot answer this, because it rises and falls as the collector runs.
If you want to check memory directly, use `about:memory` in Firefox: click **Minimize memory
usage**, then **Measure**, and compare the same figure an hour later — the level after collection
is the one that means anything.

**Reply counters work, but pagination or `See more` does not.** Those are still matched by
wording, and your Engage language may have no pack yet: Threadcalm will have said so, and
*Copy layout diagnostics* shows it. Add a pattern under *Advanced* meanwhile, and please report the
language.

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
