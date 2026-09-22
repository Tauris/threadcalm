## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- What was wrong, or what could not be done before. -->

## How it was verified

<!-- Which tests, and what you saw against a live tenant if applicable. -->

- [ ] `npm run check` passes
- [ ] `dist/` rebuilt and committed
- [ ] New behaviour has a test
- [ ] Changelog updated under *Unreleased*

## If this touches label matching

- [ ] Patterns are anchored where the label is short
- [ ] Menu controls are still rejected
- [ ] The exact tenant label text is quoted above or in the diff

<!--
House rules, for reference:
  - never match on class names (fui-*), only on text, ARIA or structure
  - never mutate Engage's DOM; add a class and let CSS do the work
  - no network requests, ever
-->
