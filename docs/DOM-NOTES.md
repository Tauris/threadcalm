# DOM notes

How Viva Engage renders the things this script cares about, and which handles are worth matching
against. None of this is a documented API. All of it can change without notice, and the script is
written on the assumption that some of it eventually will.

## Page shape

Engage is a React application built on Fluent UI. Controls mount, unmount and re-render after load,
and the document is never reloaded across a route change.

The dependable handles, best first:

| Handle | What it marks |
|---|---|
| `[role="banner"]` | the global app shell |
| `[role="main"]` | the conversation/content region |
| `[data-testid="overflow-set"]` | a post's action row |
| `.qaContentMainColumn` | the main content column |
| `.qaThreadStarter` | the thread-starter post |
| `.y-fixedGridColumn` | a nested comment or reply |

The ARIA landmarks and the test id are meaningful names and are treated as the primary API. The
three class names are layout artefacts: useful, but only ever accepted alongside a structural check.

Generated Fluent class names (`fui-Text`, `fui-Button-…`) appear throughout the page and are never
matched. Neither is the document title, whose leading count is dynamic.

## The reply glyph

The signal that makes expansion work regardless of interface language. Engage renders the reply
counter as a native button holding a numeric label *and* an inline reply-arrow icon, and that icon
is identical in every locale:

```html
<button type="button">
  <span>3 replies</span>
  <svg><path d="M7.35 3.65c.2.2…"/></svg>
</button>
```

A counter is recognised by three things, none of which is a word:

1. the element is a native `button`, not a span or a div;
2. its **own** label starts with a decimal digit — matched with `\p{Nd}` rather than `\d`, so
   non-ASCII numbering systems count;
3. it contains a path whose data starts with a known reply-arrow signature.

The digit alone is not enough. Share, reaction and "others" counters are numeric too and some of
them are clickable; the glyph is what separates them. Restricting the label check to the button's
*own* text matters for the same reason — a post ancestor's text starts with all sorts of things.

### What this survives

The same structure held in every locale checked:

| Locale | `lang` | Counter label |
|---|---|---|
| English | `en-us` | `n reply`, `n replies` |
| German | `de-de` | `n Antwort`, `n Antworten` |
| French | `fr-fr` | `n réponse`, `n réponses` |
| Japanese | `ja-jp` | `n 件の返信` |
| Simplified Chinese | `zh-cn` | `n 条回复` |
| Brazilian Portuguese | `pt-br` | `n resposta`, `n respostas` |

The wording, the grammar and the pluralisation all change. The button, the digit and the glyph do
not. Japanese and Chinese also show why a generic "number, space, reply-word" rule will not do on
its own: those labels are not word-separated the way the European ones are.

### The caveat

Path data is build output — the one place this script looks at *how* Engage is built rather than at
what it says. The exception is deliberate and it is fenced twice: the signature lives in a setting
(*Advanced → Reply icon signatures*), so a reader can correct it without waiting for a release, and
a stale signature degrades to "no match", never to a wrong click. If a future Engage exposes a
stable icon name or a data attribute, that should replace this.

## The reply counter, as text

The fallback for markup the glyph check does not cover, and the original discovery that made
automatic expansion work at all. Engage renders a thread's reply opener as a small text element
whose entire content is a number followed by a reply noun:

```html
<button type="button">
  <span class="fui-Text …">1 reply</span>
</button>
```

The match is anchored at both ends, which is what makes it safe — it cannot collide with prose that
merely mentions replies:

```js
'^(\\d+)\\s+(?:repl(?:y|ies)|comments?|responses?)$'
```

The capture group is reused by the highlighter to tell "0 replies" from "3 replies" on a thread
that has not been expanded yet.

The span is not reliably the event target. Today it sits inside the real button and clicking it
works because React listens at the root, but `nearestClickable()` climbs to a genuine interactive
ancestor first, so the script keeps working if that changes. The counter button does not
necessarily carry an `aria-label`, a `data-testid` or a `data-automation-id`; its visible text is
the signal.

## Post containers

**The reliable rule is one post per action row.** Every visible post and comment has exactly one
`[data-testid="overflow-set"]`, so posts are found by enumerating action rows and climbing to their
container, rather than by matching a container selector directly.

Semantic containers — `[role="article"]`, `<article>` — are preferred wherever a layout provides
them, and are authoritative when present, because they would survive a redesign that renames every
class. They cannot be *assumed*: layouts exist that use no `role="article"` anywhere on the page.
Anything keyed to it alone silently does nothing there — no copy chips, no highlighting, no
`j`/`k` navigation, and no language check to decide whether a translate control may be hidden.

So `allPosts()` in [`src/core/dom.js`](../src/core/dom.js) runs two strategies: semantic containers
if the page has any, action rows otherwise. A class-matched candidate counts as a post only when it
also contains an action row — a layout column with no action row inside it is not a post, whatever
it is called.

Where replies are nested inside their parent, consequences that bite:

- "Top-level posts" means containers with no container ancestor — see `rootPosts()`.
- Extracting a post's own text means removing nested posts from a clone first, or every reply ends
  up in the parent's body.
- The same applies to language detection: a reply in another language must not decide the parent's
  translate control.

## Action rows

`[data-testid="overflow-set"]` is a real test id and the most stable handle on the page after the
ARIA landmarks. It is worth more than any class name here, and it does three separate jobs: finding
posts, stripping chrome out of copied text, and collapsing the Like/Comment/Share bar.

The row is a flex container, visible by default. A thread-starter's row is taller than a nested
reply's, because its controls carry text labels where a reply's are icon-only buttons with
accessible names.

Its buttons carry accessible names of the form:

```text
Like - <name>'s post
Comment - <name>'s post
Reply - <name>'s comment
Share - <name>'s post
More actions
```

Those names are matched by **prefix and suffix**, never in full — the middle is a person's name and
must be treated as an opaque span. They also give a robust fallback for the author of a post, which
is how extraction recovers a name when the header cannot be parsed.

## Text extraction

`innerText` is used rather than `textContent` because it respects `display: none` and inserts line
breaks at block boundaries. The line breaks matter: bodies are filtered line-wise, so that whole
lines which are action labels (`Like`, `Reply`, `Share`) or bare counters can be dropped without
knowing where Engage put its action bar this month.

That ordering is easy to get wrong. Split on newlines **first**, normalise whitespace **second** —
normalising first collapses the newlines and leaves a single line to filter.

## Timestamps

In preference order:

1. `<time datetime="…">` — unambiguous, use it.
2. An element whose `title` parses as a date.
3. The displayed relative string (`2h`, `vor 3 Tagen`), returned verbatim.

## Permalinks

Anchors matching `/threads/`, `threadId=`, `/messages/` or `messageId=`. Not every post exposes one;
copy falls back to the page URL, and post identity falls back to a hash of author, timestamp and the
opening of the body.

## Menus

The worst failure mode available here is opening the three-dot overflow menu on every post in a
feed. Controls are rejected when:

- `aria-haspopup` is `menu`, `true` or `dialog`
- `aria-expanded` is `true`
- the accessible name matches the menu patterns (`more options`, `more actions`, `post actions`,
  `overflow`, `ellipsis`, `menu`, `settings`, and their translations)
- the element is disabled, or `aria-disabled="true"`
- the element has no layout box

Both the ARIA check and the label check are kept. Either alone has been seen to miss. A three-dot
control must never be read as a reply-expansion control.

## Labels that must not be matched loosely

`Show more` on its own is **not** reply pagination — it names unrelated controls, and matching it
broadly clicks them. Reply, response or comment wording is required for a pagination match.

`See more` (post truncation) is accepted with a bare label, but only inside a recognised post
container. The container is what makes it safe.

Reply pagination also appears as `Show <number> previous comments`. The number and the surrounding
text are both dynamic and neither is hard-coded.

## Translation controls

Rendered per post, as a button or link whose whole label is `Show translation` (or the tenant's
translation of that). `Show original` is the inverse control and is treated separately: it is
compacted but never hidden, because hiding it would leave a reader stuck in a translation.

Both are handled by adding a class, never by touching the node.

## Keeping the page usable

Engage's own accessibility model — native buttons, ARIA roles, accessible names on icon-only
controls, focus support — is something this script must not degrade. Two rules follow:

- **Never hide a control with `display: none`** unless there is another keyboard-accessible way to
  reveal it. Chrome-quieting collapses height and opacity instead, so the control keeps its role,
  its handler and its place in the tab order.
- **Reveal on focus as well as hover**, and keep a row revealed while anything inside it holds
  focus (`:focus-within`). Accessible names and button semantics are never altered.

`prefers-reduced-motion` is respected throughout.

## Diagnostics

*Copy layout diagnostics* reports selector counts, tag names, roles, resolved post counts and box
metrics. It deliberately carries **no** post text, author names, community names, thread IDs or URL
parameters, so the output is safe to paste into an issue. Keep it that way if you extend it.

## Known fragilities

- A redesigned reply glyph stops structural detection dead in every locale at once. The symptom is
  that nothing expands anywhere; the fix is one line in *Advanced → Reply icon signatures*, and the
  label packs still cover the languages they cover.
- A layout with neither semantic containers nor `[data-testid="overflow-set"]` yields no posts at
  all, which disables extraction, copying, highlighting and the in-post guard for `See more`.
  Expansion by reply counter would survive. The script warns once on the console when a page
  resolves zero posts, rather than letting half the features quietly do nothing.
- A tenant whose UI language has no label pack finds nothing. Symptom: the script loads, reports
  ready, and never clicks. Fix: add the language, or add patterns under *Advanced*.
- Virtualised feeds recycle nodes. Anything holding a DOM reference across a mutation is a bug;
  `WeakSet` membership and positional indices are used instead.
- Reply pagination inside a *deeply* nested sub-thread may need more than one pass. The settle loop
  handles this automatically; the `c` (copy) shortcut expands only once before copying, so a very
  deep thread may need pressing twice.
