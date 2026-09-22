import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ICON_SVG, COPYRIGHT_HOLDER, LINKS, PUBLIC_REPO, REPOSITORY, metadata } from '../src/meta.js';

describe('project links', () => {
  it('all point at the repository over https', () => {
    for (const [name, url] of Object.entries(LINKS)) {
      expect(url, name).toMatch(/^https:\/\/github\.com\//);
      expect(url, name).toContain(REPOSITORY);
    }
  });

  it('points at the full guide rather than the README', () => {
    expect(LINKS.docs).toContain('docs/USAGE.md');
  });

  it('agrees with the userscript metadata block', () => {
    expect(metadata.homepageURL).toBe(REPOSITORY);
    expect(metadata.supportURL).toBe(LINKS.issues);
  });
});

describe('the copyright holder', () => {
  it('matches the name in LICENSE', () => {
    // The notice in the built file asserts this name; LICENSE is where it is
    // established. Neither may drift from the other.
    // Relative to the repository root, which is where vitest runs.
    const license = readFileSync('LICENSE', 'utf8');
    expect(license).toContain(`Copyright (c) 2026, ${COPYRIGHT_HOLDER}`);
  });
});

describe('the icon', () => {
  it('is carried inline, so nothing is fetched to display it', () => {
    expect(metadata.icon).toBe(ICON_SVG);
    expect(ICON_SVG.trimStart()).toMatch(/^<svg/);
  });

  it('references nothing external', () => {
    // The xmlns is a namespace name, not a fetch; anything that would load is
    // an href, a src or a url(), and there must be none.
    expect(ICON_SVG).not.toMatch(/(?:href|src)\s*=/i);
    expect(ICON_SVG).not.toMatch(/url\(/i);
  });
});

describe('the public-repo gate', () => {
  /**
   * The repository is public, so every in-page link resolves and they are all
   * shown. A fork kept private sets PUBLIC_REPO to false instead, which hides
   * them rather than offering URLs that 404.
   */
  it('is open, so the in-page links are shown', () => {
    expect(
      PUBLIC_REPO,
      'PUBLIC_REPO changed: a private fork hides the in-page links; '
        + 'confirm that is intended.',
    ).toBe(true);
  });
});
