import { beforeEach, describe, expect, it } from 'vitest';
import { buildMatchers } from '../src/core/i18n.js';
import * as settings from '../src/core/settings.js';
import {
  ancestry,
  containerSurveyLines,
  copyDryRunLines,
  describeLinkButton,
  labelShape,
  linkButtonLines,
  nearestMarker,
  sketch,
  wordingOf,
} from '../src/features/linkreport.js';
import { stubLayout } from './fixtures.js';

const matchers = buildMatchers(['en']);

function fluentLink(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fui-Link ___52mpgl0 f2hkw1w f3rmtva';
  button.textContent = label;
  return button;
}

function fakeLink(label) {
  const button = document.createElement('button');
  button.className = 'link-170';
  const span = document.createElement('span');
  span.className = 'y-fakeLink';
  span.textContent = label;
  button.append(span);
  return button;
}

/** A post with a body, a translation row and an action row. */
function post({ translate = fluentLink('qqq trnslt'), more = fakeLink('zzz mehrzz') } = {}) {
  const article = document.createElement('div');
  article.className = 'qaThreadStarter';
  const body = document.createElement('div');
  body.className = 'y-block contentStateBodyTextWrapper-231';
  body.append(Object.assign(document.createElement('div'), { textContent: 'Secret body text that must not appear.' }));
  if (more) body.append(more);
  const row = document.createElement('div');
  row.className = 'y-block';
  if (translate) row.append(translate);
  const actions = document.createElement('div');
  actions.setAttribute('data-testid', 'overflow-set');
  actions.append(document.createElement('button'));
  article.append(body, row, actions);
  document.body.append(article);
  return article;
}

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
});

describe('sketching an element', () => {
  it('keeps tag, role, test id and layout markers, drops hashed classes and content', () => {
    const node = document.createElement('div');
    node.className = 'fui-Text ___1abc f2hkw1w y-block qaThreadStarter videoCardActions-123 tc-quiet-post';
    node.setAttribute('role', 'article');
    node.setAttribute('data-testid', 'focus-catcher-wrapper');
    node.setAttribute('title', 'A real title');
    node.id = 'user-42';
    node.textContent = 'Private words';
    expect(sketch(node)).toBe(
      'div.fui-Text.y-block.qaThreadStarter.tc-quiet-post[role=article][data-testid=focus-catcher-wrapper]',
    );
  });

  it('names the body wrapper by its generated class', () => {
    const node = document.createElement('div');
    node.className = 'contentStateBodyTextWrapper-908';
    expect(sketch(node)).toBe('div.contentStateBodyTextWrapper-N');
  });

  it('lists ancestors nearest first, marking posts and the root', () => {
    const article = post();
    const button = article.querySelector('.fui-Link');
    const chain = ancestry(button);
    expect(chain).toMatch(/^div\.y-block\{1\} < div\.qaThreadStarter\[post\]\{3\} < body\[root\]/);
  });
});

describe('label shapes', () => {
  it('keeps word lengths, case, digits and symbols, never the letters', () => {
    expect(labelShape('Show translation')).toBe('Aaaa aaaaaaaaaaa');
    expect(labelShape('Übersetzung anzeigen')).toBe('Aaaaaaaaaaa aaaaaaaa');
    expect(labelShape('3 replies')).toBe('9 aaaaaaa');
    expect(labelShape('Show original (日本語)')).toBe('Aaaa aaaaaaaa (aaa)');
    expect(labelShape('… more')).toBe('… aaaa');
    expect(labelShape('')).toBe('');
  });
});

describe('wording', () => {
  it('names the first matching label family', () => {
    expect(wordingOf(['Show translation'], matchers)).toBe('translate');
    expect(wordingOf(['Show original (Japanese)'], matchers)).toBe('original');
    expect(wordingOf(['see more'], matchers)).toBe('see more');
    expect(wordingOf(['3 replies'], matchers)).toBe('counter');
    expect(wordingOf(['Afficher la traduction'], matchers)).toBe('none');
    expect(wordingOf([], matchers)).toBe('none');
  });
});

describe('describing one link button', () => {
  it('reports a recognised translation control with its position facts', () => {
    const article = post();
    const button = article.querySelector('.fui-Link');
    const { verdict, lines } = describeLinkButton(button, { matchers });
    expect(verdict).toBe('recognised');
    expect(lines[0]).toBe('button.fui-Link  shape=fui-Link  recognised');
    expect(lines[1]).toContain('label=10 chars');
    expect(lines[1]).toContain('wording=none');
    expect(lines[1]).toContain('position=translation control');
    expect(lines[1]).toContain('post=div.qaThreadStarter');
    expect(lines[1]).toContain('in-body=no');
    expect(lines[1]).toContain('post-bodies=1 (one before this)');
    expect(lines[1]).toContain('post-rows=1 (one after this)');
    expect(lines.join('\n')).not.toContain('qqq');
    expect(lines.join('\n')).not.toContain('Secret');
  });

  it('reports "see more" as recognised by position, with the body wrapper in its ancestry', () => {
    const article = post();
    const button = article.querySelector('.link-170');
    const { verdict, lines } = describeLinkButton(button, { matchers });
    expect(verdict).toBe('recognised');
    expect(lines[0]).toContain('shape=y-fakeLink');
    expect(lines[1]).toContain('position=see more');
    expect(lines[1]).toContain('in-body=yes');
    expect(lines[3]).toContain('div.y-block.contentStateBodyTextWrapper-N{2}');
  });

  it('calls out a button outside any post, with what is known about it', () => {
    const bubble = document.createElement('div');
    bubble.className = 'fui-Card ___x1 speechBubble-55';
    const button = fluentLink('qqq trnslt');
    button.setAttribute('aria-label', 'qqq trnslt');
    bubble.append(button);
    document.body.append(bubble);
    const { verdict, lines } = describeLinkButton(button, { matchers });
    expect(verdict).toBe('NOT RECOGNISED');
    expect(lines[1]).toContain('named-by=aria-label');
    expect(lines[1]).toContain('post=none');
    expect(lines[1]).toContain('position=none');
    expect(lines[1]).toContain('nearest-marker=none');
    expect(lines[2]).toBe('    label-shape="aaa aaaaaa"  attrs=type,aria-label  children: (text only)');
    expect(lines[3]).toBe('    ancestors: div.fui-Card{1} < body[root]{1} < html[root]{2}');
  });

  it('names the nearest Engage container beyond the ten-level chain', () => {
    const reply = document.createElement('div');
    reply.className = 'qaThreadReply ___abc';
    let node = reply;
    for (let i = 0; i < 14; i += 1) {
      const inner = document.createElement('div');
      node.append(inner);
      node = inner;
    }
    const button = fluentLink('qqq trnslt');
    node.append(button);
    document.body.append(reply);
    expect(nearestMarker(button)).toBe('div.qaThreadReply (15 up)');
    const { lines } = describeLinkButton(button, { matchers });
    expect(lines[1]).toContain('nearest-marker=div.qaThreadReply (15 up)');
    expect(lines[3]).not.toContain('qaThreadReply');
  });

  it('shows the shape of a translated-state label without its words', () => {
    const article = post({ translate: fluentLink('qqq orgnl (Fransk)') });
    const button = article.querySelector('.fui-Link');
    const { lines } = describeLinkButton(button, { matchers });
    expect(lines[1]).toContain('label=18 chars (brackets)');
    expect(lines[2]).toContain('label-shape="aaa aaaaa (Aaaaaa)"');
    expect(lines.join('\n')).not.toContain('Fransk');
  });

  it('sketches the children of a button that draws an icon', () => {
    const button = fluentLink('');
    button.setAttribute('aria-describedby', 'tooltip-7');
    const icon = document.createElement('span');
    icon.className = 'fui-Button__icon ___x';
    icon.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const hidden = document.createElement('span');
    hidden.className = 'fui-Text';
    hidden.textContent = 'qqq trnslt';
    button.append(icon, hidden);
    document.body.append(button);
    const { lines } = describeLinkButton(button, { matchers });
    expect(lines[1]).toContain('+svg');
    expect(lines[2]).toBe(
      '    label-shape="aaa aaaaaa"  attrs=type,aria-describedby  children: span.fui-Button__icon{1}, span.fui-Text{0}',
    );
  });
});

describe('the diagnostics section', () => {
  it('counts, lists unrecognised buttons first, and keeps content out', () => {
    post();
    const loose = fluentLink('qqq trnslt');
    document.body.append(loose);
    const lines = linkButtonLines({ matchers });
    expect(lines[0]).toBe('link buttons (fui-Link or y-fakeLink): 3 found, 1 not recognised');
    expect(lines[1]).toBe('  #1 button.fui-Link  shape=fui-Link  NOT RECOGNISED');
    expect(lines.filter((line) => /^ {2}#\d/.test(line))).toHaveLength(3);
    expect(lines.join('\n')).not.toMatch(/qqq|zzz|Secret/);
  });

  it('says so when there are none', () => {
    expect(linkButtonLines({ matchers })).toEqual([
      'link buttons (fui-Link or y-fakeLink): 0 found, 0 not recognised',
    ]);
  });

  it('reads shadow roots through the deep query it is given, and counts them', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.append(fluentLink('qqq trnslt'));
    const deepQueryAll = (selector) => [...document.querySelectorAll(selector), ...root.querySelectorAll(selector)];
    const lines = linkButtonLines({ matchers, deepQueryAll });
    expect(lines[0]).toBe('link buttons (fui-Link or y-fakeLink): 1 found, 1 not recognised, 1 inside shadow roots');
    expect(lines[2]).toContain('shadow=yes');
  });

  it('describes at most a dozen and counts the rest', () => {
    for (let i = 0; i < 15; i += 1) post();
    const lines = linkButtonLines({ matchers });
    expect(lines[0]).toBe('link buttons (fui-Link or y-fakeLink): 30 found, 0 not recognised');
    expect(lines.filter((line) => /^ {2}#\d/.test(line))).toHaveLength(12);
    expect(lines.at(-1)).toBe('  … and 18 more, all recognised');
  });
});

describe('the container survey', () => {
  it('lists each qa… class with what its elements hold', () => {
    const article = post();
    const reply = document.createElement('div');
    reply.className = 'qaThreadReply f1abc';
    reply.append(fluentLink('qqq trnslt'));
    article.append(reply);
    const column = document.createElement('div');
    column.className = 'qaContentMainColumn';
    column.setAttribute('role', 'main');
    document.body.append(column);
    column.append(article);

    const lines = containerSurveyLines();
    expect(lines[0]).toBe('named containers (qa… classes): 3');
    expect(lines[1]).toBe(
      '  qaContentMainColumn: 1  post=0  inside-post=0  with-action-row=1  with-body-wrapper=1  with-link-buttons=1  with-nested-qaContentMainColumn=0',
    );
    expect(lines[2]).toBe(
      '  qaThreadReply: 1  post=0  inside-post=1  with-action-row=0  with-body-wrapper=0  with-link-buttons=1  with-nested-qaThreadReply=0',
    );
    expect(lines[3]).toBe(
      '  qaThreadStarter: 1  post=1  inside-post=0  with-action-row=1  with-body-wrapper=1  with-link-buttons=1  with-nested-qaThreadStarter=0',
    );
    expect(lines.join('\n')).not.toMatch(/qqq|zzz|Secret/);
  });

  it('ignores classes that merely contain "qa"', () => {
    const node = document.createElement('div');
    node.className = 'f1qax3 opaque qaX';
    document.body.append(node);
    expect(containerSurveyLines()).toEqual(['named containers (qa… classes): 1', expect.stringContaining('  qaX: 1')]);
  });
});

describe('the copy dry run', () => {
  it('reports sizes for each member of the first thread and nothing of the text', () => {
    const article = post();
    const lines = copyDryRunLines();
    expect(lines[0]).toBe('copy dry run (first thread on the page): 1 sibling members');
    expect(lines[1]).toMatch(/^ {2}#1 div\.qaThreadStarter {2}author=\d+ chars {2}body=\d+ chars\/\d+ lines {2}replies=0 {2}nested-posts=0 {2}layout-columns=0 {2}rows=1$/);
    expect(lines[2]).toMatch(/^ {2}rendered: 1 posts, \d+ body chars in all$/);
    expect(lines.join('\n')).not.toMatch(/Secret|qqq|zzz/);
    expect(article.isConnected).toBe(true);
  });

  it('says so when the page has no post', () => {
    expect(copyDryRunLines()).toEqual(['copy dry run: no post on the page']);
  });
});
