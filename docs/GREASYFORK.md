**Makes Microsoft Viva Engage readable.** Threadcalm opens whole threads for you, copies a
conversation as Markdown, quiets the translation prompts under every post, and adds keyboard
shortcuts the web app never had.

> **Independent project.** Not affiliated with, endorsed by or supported by Microsoft.
> "Viva Engage", "Yammer" and "Microsoft" are Microsoft's trademarks, used here only to say
> which product this works with.

## What it does

- **Opens whole threads.** Clicks reply counters, "show previous comments" and "see more"
  until the conversation is fully open &mdash; then stops. It never clicks menus.
- **Copies a thread as Markdown or plain text**, with authors, timestamps, reply nesting and
  a link back. Press `c` on any post in the thread.
- **Quiets the page.** The Like / Comment / Share bar, the comment boxes, the copy buttons and
  the translation prompts can each be toned down, in several modes. Every choice in the
  settings is listed with what it gains and what it costs.
- **Reading mode.** Press `r` for a quiet page in one step; press it again and your own
  settings are exactly as you left them.
- **Works in any interface language** for thread expansion &mdash; reply counters are recognised by
  their structure, not their wording.

Out of the box it expands threads, shrinks the translation prompt to a small icon, marks posts
that are unanswered or new to you, and shows copy buttons when you point at a post. Everything
else waits until you switch it on.

## Keyboard

`j` / `k` next and previous post &middot; `c` copy the thread &middot; `y` copy its link &middot; `o` expand &middot;
`e` pause expansion &middot; `a` hide the action bars &middot; `r` reading mode &middot; `s` settings &middot; `?` all shortcuts

## Privacy

- **No network requests.** No telemetry, no analytics, no remote configuration, no external
  assets. You can check: the script grants no `GM_xmlhttpRequest`.
- **Stored locally only** &mdash; your settings, and a capped list of post identifiers for the
  "new post" marker.
- **Post text is read, never sent.** Copying puts it on your clipboard and nowhere else.
- The code is unminified. Read it before you install.

## Before you install

**Check your organisation's policy.** Whether userscripts may be used on a work system is your
employer's decision, not this project's.

## More

- [Full guide](https://github.com/Tauris/threadcalm/blob/main/docs/USAGE.md) &mdash; every setting, with its default
- [Source and releases](https://github.com/Tauris/threadcalm)
- [Report a problem](https://github.com/Tauris/threadcalm/issues) &mdash; please include the exact
  text of the control involved, and never paste colleagues' names or post content

BSD 3-Clause &copy; 2026 J&ouml;rg T&uuml;rmer
