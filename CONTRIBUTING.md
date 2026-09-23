# Contributing

Thanks for looking. This is a small project with a narrow purpose: making Viva Engage readable
without asking anything of your tenant. Contributions that keep it that way are very welcome.

## Getting set up

```bash
git clone https://github.com/Tauris/threadcalm.git
cd threadcalm
npm install
npm run check        # lint + test + build, as CI runs it
```

To work against a live tenant:

```bash
npm run watch        # rebuilds dist/ on every change
```

Point Tampermonkey at your local `dist/threadcalm.user.js` (in the dashboard: **Utilities →
Import from file**, or use a `file://` URL if your browser allows it), then reload the Engage tab
after each rebuild.

## Before you open a pull request

- `npm run check` passes.
- `dist/` is rebuilt and committed. CI fails if it is stale — it is the file people install, so it
  has to match the sources.
- New behaviour has a test. DOM behaviour is testable: see [`test/fixtures.js`](test/fixtures.js).
- The changelog has an entry under *Unreleased*.

## House rules

These come out of what has already broken once. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the
reasoning.

1. **Never match on a class name.** `fui-Text`, `fui-Button-…` and friends are build output and
   change without notice. Match on visible text, `aria-label`, `title`, `data-testid`, or on
   structure — and prefer a real test id or an ARIA role to a layout class.
2. **Never mutate Engage's DOM.** Add a class or a data attribute and let CSS do the work. React
   discards injected children and can throw on rewritten nodes.
3. **Never hold a DOM reference across a mutation.** The feed is virtualised. Use `WeakSet`
   membership or a positional index.
4. **Keep the label matching tight.** Anchored patterns, short labels only, and menu controls
   rejected by both ARIA and text. A loose pattern that clicks the overflow menu on every post in a
   feed is worse than a feature that does not work.
5. **No network requests, ever.** No telemetry, no remote config, no external assets. This is a
   stated property of the project, not an implementation detail.
6. **Every feature stays switchable**, with a `stop()` that leaves the page as it was found.

## Adding a language

The most useful contribution, and the easiest. Add an entry to `LABEL_PACKS` in
[`src/core/i18n.js`](src/core/i18n.js) with the same fields as the others, then add your language to
the test that checks every pack compiles. Please include the literal strings your tenant shows, in a
comment or in the PR description, so the patterns can be checked against reality.

Anchored patterns (`^…$`) for anything short; unanchored only where the label genuinely varies.

## Adding a setting

Add one entry to `SCHEMA` in [`src/core/settings.js`](src/core/settings.js). The settings sheet
renders itself from the schema, so there is nothing else to update. Give it a `help` line if the
label alone does not make the consequence obvious.

## Adding a feature

Write a module under `src/features/` exporting a factory that returns an object with any of
`start`, `stop`, `onNavigate`, `onDomChanged`, `onSettingsChanged`, `setMatchers`, then add it to the
`features` array in [`src/main.js`](src/main.js). `main.js` should not need to know what it does.

## Testing a build before it ships

`main` is what people install, so nothing lands there untested. The `beta` channel exists for
that. It is built from the same sources as the stable one and differs in exactly two things: its
identity, and the two URLs it updates from.

That identity is the point. A userscript manager recognises a script by `@name` plus
`@namespace`, so the beta build — *Threadcalm (beta)*, namespace `…#beta` — installs **beside**
your stable copy instead of replacing it. Enable whichever you want to exercise; with both enabled
every feature would apply twice.

1. Work on a branch as usual. `npm run build` writes both artefacts; `npm run watch:beta` follows
   the beta one while you iterate locally.
2. Point the `beta` branch at what you want to test:

   ```bash
   git push --force origin HEAD:beta
   ```

   `beta` is a moving pointer at whatever is under test, not a line of history, so force-pushing
   it is the expected way to use it.
3. Install
   [`dist/threadcalm.beta.user.js`](https://github.com/Tauris/threadcalm/raw/beta/dist/threadcalm.beta.user.js)
   from the beta branch, and disable the stable script while you test.
4. Exercise it against a real tenant. The beta keeps updating from `beta`, so every later push is
   picked up without reinstalling.
5. When it holds up, merge the branch into `main` and release from there.

Both artefacts are committed and `npm run check` verifies both, so a stale beta build fails CI
exactly as a stale stable one does.

## Cutting a release

1. Set the version in [package.json](package.json). The build injects it into the userscript
   header and into the console banner, so it is the single source of truth.
2. Move the *Unreleased* changelog entries under the new version.
3. `npm run check`, then commit the rebuilt `dist/` — it is the file people install.
4. Tag `vX.Y.Z`.

`@downloadURL` and `@updateURL` point at `raw/main/dist/`, so installed copies see a release as
soon as it lands on `main`.

If you maintain a **private fork**, set `PUBLIC_REPO = false` in [src/meta.js](src/meta.js). The
script's links back to GitHub then disappear instead of resolving to a repository nobody can
reach.

## Reporting a bug

Please include:

- The version, from the settings sheet, and your userscript manager.
- The browser, and the Engage UI language.
- **The exact label text** of any control involved. That is usually the whole bug.
- Whether it still happens with the script disabled — if it does, it is not this script.

Please do not paste real tenant markup, post content or colleagues' names into an issue. A
description of the structure is enough, and fixtures in this repository are synthetic for the same
reason.

## Scope

Things this project will not grow into:

- Anything that sends post content anywhere, including translation or summarisation services.
- API or token-based access. See
  [why the DOM, and not the API](docs/ARCHITECTURE.md#why-the-dom-and-not-the-api).
- Posting, replying, reacting or any other write action against Engage. This is a reading aid.
- Bulk export or archival tooling. Extraction is best-effort scraping and is not accurate enough to
  be trusted for records.

## Affiliation

This is an independent project with no connection to Microsoft. Contributions must not imply
otherwise, and must not include Microsoft code, assets or branding. See the
[disclaimer](README.md#disclaimer).

## License

By contributing you agree that your contributions are licensed under the
[BSD 3-Clause License](LICENSE).
