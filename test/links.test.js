import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { el } from '../src/core/dom.js';
import {
  CHANNELS,
  COPYRIGHT_HOLDER,
  DEFAULT_CHANNEL,
  ICON_SVG,
  LINKS,
  PUBLIC_REPO,
  REPOSITORY,
  SCRIPT_NAME,
  metadata,
  brandLink,
  metadataFor,
} from '../src/meta.js';

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

describe('distribution channels', () => {
  it('give every channel its own identity', () => {
    // @name + @namespace is what a userscript manager treats as identity. If
    // two channels shared a pair, installing the beta would silently replace
    // the stable install instead of sitting beside it -- which is the whole
    // point of having a channel.
    const identities = Object.keys(CHANNELS).map((channel) => {
      const meta = metadataFor(channel);
      return `${meta.name}\u0000${meta.namespace}`;
    });
    expect(new Set(identities).size).toBe(identities.length);
  });

  it('point each channel at its own branch and file', () => {
    for (const [channel, spec] of Object.entries(CHANNELS)) {
      const meta = metadataFor(channel);
      const expected = `${REPOSITORY}/raw/${spec.branch}/dist/${spec.file}`;
      expect(meta.downloadURL, channel).toBe(expected);
      expect(meta.updateURL, channel).toBe(expected);
    }
  });

  it('keep a beta install on the beta branch', () => {
    // A beta that updated from main would quietly migrate testers onto the
    // stable build the first time main moved ahead.
    const beta = metadataFor('beta');
    expect(beta.updateURL).toContain('/raw/beta/');
    expect(beta.updateURL).not.toContain('/raw/main/');
  });

  it('leave the stable channel exactly as the README describes it', () => {
    const stable = metadataFor(DEFAULT_CHANNEL);
    expect(stable.name).toBe(SCRIPT_NAME);
    expect(stable.namespace).toBe(REPOSITORY);
    expect(stable.downloadURL).toBe(metadata.downloadURL);
  });

  it('differ in nothing but identity and the two URLs', () => {
    // Anything else diverging would mean the beta stopped being a faithful
    // preview of what is about to ship.
    const varying = new Set(['name', 'namespace', 'downloadURL', 'updateURL']);
    const stable = metadataFor('stable');
    const beta = metadataFor('beta');
    for (const key of Object.keys(stable)) {
      if (varying.has(key)) continue;
      expect(beta[key], key).toEqual(stable[key]);
    }
  });

  it('rejects a channel that does not exist', () => {
    expect(() => metadataFor('nope')).toThrow(/unknown channel/i);
  });
});

describe('the brand link', () => {
  it('points at the repository', () => {
    const node = brandLink(el);
    expect(node.tagName).toBe('A');
    expect(node.getAttribute('href')).toBe(REPOSITORY);
    expect(node.textContent).toBe(SCRIPT_NAME);
  });

  it('opens safely in a new tab', () => {
    // Anything this script points at Engage's page must not hand the opener
    // over with it.
    const node = brandLink(el);
    expect(node.getAttribute('target')).toBe('_blank');
    expect(node.getAttribute('rel')).toContain('noopener');
  });

  it('is shown in every window the script opens', () => {
    // A panel appearing over someone's page with no way to find out what put
    // it there is the kind of thing people are right to distrust.
    expect(PUBLIC_REPO).toBe(true);
  });
});

describe('the Greasy Fork listing', () => {
  it('uses only absolute links', () => {
    // Greasy Fork syncs its description from docs/GREASYFORK.md and renders it
    // on its own site, where a relative link would resolve against Greasy Fork
    // rather than this repository.
    const listing = readFileSync('docs/GREASYFORK.md', 'utf8');
    const targets = [...listing.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(target, target).toMatch(/^https:\/\//);
  });

  it('names the copyright holder the licence does', () => {
    const listing = readFileSync('docs/GREASYFORK.md', 'utf8');
    expect(listing).toContain(COPYRIGHT_HOLDER);
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
