# Architecture

## The constraint everything follows from

Viva Engage is a React single-page application with no public DOM contract. Class names
(`fui-Text`, `fui-Button-…`) are build output and change between releases. The document is never
reloaded, so a session may visit dozens of threads after the script's single `document-idle` start.
Content appears and disappears under virtualisation.

Three rules fall out of that, and every module obeys them:

1. **Match on what stays the same in every language, and never on generated build output.**
   ARIA roles and states, `data-testid`, and what the UI says — which is why labels are data in
   [`src/core/i18n.js`](../src/core/i18n.js) — but never a generated class name such as
   `fui-Button-…` or `link-170`.

   A few structural signals are used deliberately, because wording differs across Engage's 36
   interface languages and structure does not. Each is paired with a position check, and each fails
   towards "no match" rather than a wrong click:

   - the reply counter's inline glyph ([DOM-NOTES.md](DOM-NOTES.md#the-reply-glyph));
   - Engage's link-styled button, `button > span.y-fakeLink`: inside the post body it is
     `See more`, between the body and the action row it is the translation control
     ([DOM-NOTES.md](DOM-NOTES.md#inline-link-buttons));
   - `.qaThreadStarter`, which marks exactly one thing and so counts as a post on its own.
2. **Never mutate Engage's DOM.** Features add a class or a data attribute and let CSS do the rest.
   A React re-render discards anything injected into a component's subtree, and rewriting nodes
   React owns can throw. The one exception is the copy chip, which is appended as an extra last
   child of a post — outside any component's children — and re-attached by the next sweep if a
   render does remove it.
3. **Assume the page changes under you.** Nothing caches a DOM reference across a mutation.
   Position is tracked as an index; identity as a `WeakSet` membership.

## Why the DOM, and not the API

Microsoft documents supported legacy Viva Engage / Yammer Core REST endpoints, including
[`GET messages/in_thread/{thread_id}.json`](https://learn.microsoft.com/en-us/rest/api/yammer/yammer-core-apis).
An API client could fetch a whole thread — including replies never rendered — and would be more
correct than DOM reading in every respect but one: cost of entry.

It needs an app registration, tenant admin consent, a token flow, and handling of throttling and
per-tenant policy. Many organisations will not grant that for a personal reading aid. Microsoft
also warns that endpoints outside the supported list may stop working without notice, so the API
route is not automatically the more stable one.

A userscript reuses the session the reader already has, asks nothing of anyone, and fails in ways
that are visible and fixable. That is the right trade for a reading aid and the wrong one for a
compliance or archival tool.

**For a reliable, complete export** — records, legal hold, migration — use the API or Microsoft's
own export tooling, not this script. Extraction here is best-effort; see the caveats in
[DOM-NOTES.md](DOM-NOTES.md).

## Layout

```
src/
  main.js              wiring: construct features, fan events out, register menu commands
  meta.js              the userscript metadata block, as data
  core/
    bus.js             tiny synchronous event bus (NAVIGATE, DOM_CHANGED, SETTINGS_CHANGED, …)
    dom.js             text extraction, visibility, nearest clickable ancestor, post containers
    gm.js              GM_* wrappers, each with a working fallback
    i18n.js            label packs for Engage's 36 languages -> compiled matchers; page language
    language.js        language guesser: writing systems first, then stop words
    logger.js          namespaced console output, quiet by default
    settings.js        schema, defaults, coercion, persistence, change events
    spa.js             History patching + MutationObserver -> navigation and DOM events
  features/
    expand.js          the thread expander, long posts on screen, overview
    translate.js       the translation control: compacting, automatic translation, for copies
    thread.js          reading a conversation out of the DOM, rendering it
    copy.js            clipboard actions, translation marks, the per-post chip
    declutter.js       hiding promoted/suggested cards
    highlight.js       unanswered and not-seen-before markers
    reading.js         reading mode
    shortcuts.js       key bindings and the help overlay
  ui/
    panel.js           status panel + settings sheet (rendered from the schema)
    styles.js          the whole stylesheet
    toast.js           transient messages
```

## The feature contract

`main.js` knows nothing about what any feature does. Each one is a factory returning an object with
optional lifecycle methods:

| Method | Called when |
|---|---|
| `start()` | once, at script start |
| `stop()` | teardown; must restore the page to how it was found |
| `onNavigate({url, previousUrl})` | the SPA changed route |
| `onDomChanged()` | the DOM settled after a mutation burst |
| `onSettingsChanged(changed)` | one or more settings changed; `changed` holds only those |
| `setMatchers(matchers)` | label packs were rebuilt (languages or custom patterns changed) |

Adding a feature means writing the module and adding it to the `features` array. Adding a setting
means adding one `SCHEMA` entry — the settings sheet renders itself from the schema, so there is no
second list of form fields to keep in step.

## Event flow

```
History.pushState / popstate / URL poll ─┐
                                         ├─> spa.js ─> bus NAVIGATE ─> every feature.onNavigate
MutationObserver (debounced 250 ms) ─────┴─> bus DOM_CHANGED ─> every feature.onDomChanged

settings.update() ─> bus SETTINGS_CHANGED ─> matchers rebuilt if needed ─> onSettingsChanged

expand.js ─> bus EXPAND_PROGRESS / EXPAND_STATE ─> panel
                                  EXPAND_STATE ─> translate.js (pausing switches translation off)
any feature ─> bus TOAST ─> toast.js
```

The bus exists so the panel can report on expansion without the expander knowing a panel exists, and
so a listener that throws cannot take down the emitter or its siblings.

## The expansion loop

`expand.js` runs a settle loop rather than a fixed schedule:

1. A scan classifies every candidate control (reply counter, reply pagination, truncated text) and
   collects one entry per real click target. Classification is layered: structure first — a native
   button, a leading digit and the reply glyph, which needs no label pack — then the label packs
   for everything structure does not cover.
2. It clicks up to `maxClicksPerScan` of them, recording each target in a `WeakSet`.
3. If anything was clicked, it waits `settleDelayMs` for Engage to render and scans again.
4. Three consecutive empty passes mean the visible thread is fully open.

A heartbeat (default 1 s) re-triggers scanning for content the `MutationObserver` misses — lazily
rendered replies, in particular, sometimes arrive without a mutation the observer reports usefully.

### Long posts, and overview

Truncated text is the exception to "click what you find". An automatic scan hands each `See more` to
an `IntersectionObserver` on the post body instead, and clicks it once the body has been on screen
for `OPEN_DWELL_MS` (300 ms). A long feed is therefore not unfolded in the background. Structurally,
`See more` and `See less` are the same button, so each body wrapper is opened at most once.

Explicit requests do not wait: `expandWithin()` (the <kbd>o</kbd> key, copying) and `rescan()`
(*Expand everything*) click every control they cover.

**Overview** (`expand.overview`, the <kbd>v</kbd> key) makes `inScope()` false on feeds, so no
automatic scan runs there at all; a single-conversation route is always in scope. It is a reading
preference and persists. Pausing (<kbd>e</kbd>) is different: session-only, it stops every click,
and the translate feature listens for it and switches automatic translation off too.

`WeakSet` membership, not a selector, is what prevents re-clicking: labels repeat freely across a
feed, but a given node only ever needs opening once, and detached nodes become collectable after a
re-render. Counters and the click history reset on navigation.

### Click targeting

The reply counter is rendered as a `<span>` inside the real button. Clicking the span happens to
work because React listens at the root, but that is incidental. `nearestClickable()` climbs at most
six levels to a genuine interactive ancestor (`button`, `[role="button"]`, `a[href]`, `[tabindex]`)
and falls back to the element itself, so the script survives either shape.

### What is deliberately not matched

A bare `Show more` is not accepted as reply pagination: it also names unrelated controls, so reply,
response or comment wording is required. `See more` is accepted with a bare label, or with none, but
only inside a recognised post — by wording, inside a post container; by structure, inside the post's
body wrapper. The container is what makes the loose label safe. Anything with
`aria-haspopup`, `aria-expanded="true"`, or a label matching the menu patterns is rejected outright;
opening the overflow menu on every post in a feed is the failure mode the matching is tuned against.

## Automatic translation

`translate.js` never translates anything itself: it presses Engage's own `Show translation`, so the
script still makes no requests. The rules are about *when*:

- **On screen.** Each eligible post is observed, not its control — the control sits at the bottom,
  and a long post is on screen well before it. A post is translated after `TRANSLATE_DWELL_MS`
  (500 ms) in view; one scrolled past is dropped from the queue.
- **One at a time,** `TRANSLATE_SPACING_MS` (400 ms) apart, because each click is a request to the
  translation service.
- **Once per post.** A post the reader turned back with `Show original` is not translated again,
  even when Engage renders a fresh control.
- **Stops at once** when switched off, or when expansion is paused.

Engage replaces the body in place and keeps no copy of the original, so the original is captured
just before a translation: by the feature before its own click, and by a capture-phase `click`
listener on the document for the reader's clicks — capture runs before React's own handlers, while
the text is still the original. `translationOf(post)` then reports the source language, read from
the bracket in `Show original (Japanese)`, and the captured text.

Copying is the one exception to "on screen": `translateForCopy()` works through every eligible post
of the thread before it is read, under the same rules otherwise, and at most 40 per copy.

## Language detection

Deciding whether a post needs translating — to hide its control, or to translate it automatically —
means knowing what language it is in. Three options, one chosen:

| Approach | Verdict |
|---|---|
| A translation or detection API | Rejected. Sends post text to a third party, and breaks the no-network property. |
| A bundled n-gram model (franc, CLD3) | Rejected. Tens to hundreds of kilobytes in a file people are expected to read before installing, for a decision that only hides a button. |
| Stop-word frequency | Chosen. About 1 kB of word lists, one pass over the post text, no dependencies. |

Japanese, Chinese, Korean, Greek, Thai, Armenian and Georgian are recognised by their writing system
first, and that takes precedence: a Japanese post quoting English is a Japanese post. It takes about
a sentence of the script, so one borrowed word does not count. Text in Chinese characters alone is
reported as ambiguous between Chinese and Japanese.

The trade-off is that stop words are reliable on a paragraph of prose and unreliable on a six-word
post. So [`language.js`](../src/core/language.js) returns a confidence score, and nothing is hidden
or translated below a configurable floor: a missing translate button on a post the reader cannot
read is a worse failure than a visible one they do not need.

The *interface* language is a different question, answered by the page: Engage writes the reader's
own language setting into `<html lang>`, and the matching label pack is used without asking.

## Settings

Flat dotted keys (`expand.maxTotalClicks`), one schema entry each. The schema supplies the default,
coerces whatever comes back from storage — which may have been written by an older version or
hand-edited — and describes the form control. Unknown stored keys are dropped; unusable values fall
back to the default rather than propagating. Persistence goes through `GM_setValue` with a
`localStorage` fallback, so the script still works under a manager with partial GM support.

## Build

`scripts/build.mjs` renders the `==UserScript==` header from `src/meta.js`, injects the version from
`package.json`, and bundles with esbuild as an unminified IIFE. Unminified is a deliberate choice: a
userscript is read by the people who install it.

`dist/` is committed so the raw GitHub URL installs. `npm run verify:dist` builds to memory and
fails if the committed file differs, which is what keeps CI honest.

## Testing

Vitest with jsdom. Fixtures in [`test/fixtures.js`](../test/fixtures.js) reproduce the *structure*
the script relies on — both post shapes described in [DOM-NOTES.md](DOM-NOTES.md), a counter
rendered as a bare span, a translate control — and nothing else.
[`test/structure.test.js`](../test/structure.test.js) builds Engage's post shape with labels in no
known language, so it can only pass on structure. Visibility is driven by a hand-held
`IntersectionObserver` passed in as a factory argument, since jsdom has none. The fixtures are synthetic by
design: copying markup out of a running tenant would bake in class names the script must never
depend on, and would put other people's names and post text into a public repository.

jsdom implements neither layout nor `innerText`, so both are stubbed in the fixtures rather than
worked around in the source: the tests exercise the same path a browser does.
