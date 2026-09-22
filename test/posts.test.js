import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACTION_ROW_SELECTOR,
  allPosts,
  closestPost,
  postContainerFor,
  rootPosts,
} from '../src/core/dom.js';
import { extractPost } from '../src/features/thread.js';
import { stubLayout } from './fixtures.js';

/**
 * A conversation view that uses no `role="article"` at all: a thread starter
 * and comments marked only by layout classes, each owning one
 * `[data-testid="overflow-set"]` action row.
 */
function mountEngageLikeThread() {
  const main = document.createElement('div');
  main.setAttribute('role', 'main');
  main.className = 'qaContentMainColumn';

  const makePost = (className, author, body, kind) => {
    const post = document.createElement('div');
    post.className = className;

    const text = document.createElement('div');
    text.textContent = body;
    post.append(text);

    const actions = document.createElement('div');
    actions.setAttribute('data-testid', 'overflow-set');
    for (const [verb, noun] of [['Like', kind], ['Share', kind]]) {
      const button = document.createElement('button');
      button.setAttribute('aria-label', `${verb} - ${author}'s ${noun}`);
      button.textContent = verb;
      actions.append(button);
    }
    const menu = document.createElement('button');
    menu.setAttribute('aria-haspopup', 'true');
    menu.setAttribute('aria-label', 'More actions');
    actions.append(menu);
    post.append(actions);

    return post;
  };

  const starter = makePost('qaThreadStarter', 'Ada Lovelace', 'The release moves to month end.', 'post');
  const reply = makePost('y-fixedGridColumn', 'Grace Hopper', 'Does that include migrations?', 'comment');

  main.append(starter, reply);
  document.body.append(main);
  return { main, starter, reply };
}

beforeEach(() => {
  stubLayout(window);
  document.body.innerHTML = '';
});

describe('post detection without role="article"', () => {
  it('finds posts from their action rows', () => {
    const { starter, reply } = mountEngageLikeThread();
    const posts = allPosts();

    expect(posts).toHaveLength(2);
    expect(posts).toContain(starter);
    expect(posts).toContain(reply);
  });

  it('maps an action row back to its post', () => {
    const { starter } = mountEngageLikeThread();
    const row = starter.querySelector(ACTION_ROW_SELECTOR);
    expect(postContainerFor(row)).toBe(starter);
  });

  it('resolves the containing post from a descendant', () => {
    const { reply } = mountEngageLikeThread();
    const button = reply.querySelector('button');
    expect(closestPost(button)).toBe(reply);
  });

  it('treats siblings as separate root posts', () => {
    mountEngageLikeThread();
    expect(rootPosts()).toHaveLength(2);
  });

  it('does not accept a layout container that owns no action row', () => {
    const stray = document.createElement('div');
    stray.className = 'y-fixedGridColumn';
    stray.textContent = 'sidebar widget';
    document.body.append(stray);

    expect(allPosts()).toHaveLength(0);
    expect(closestPost(stray)).toBe(null);
  });
});

describe('semantic markup still wins', () => {
  it('prefers role="article" wherever the page provides it', () => {
    const article = document.createElement('div');
    article.setAttribute('role', 'article');
    article.textContent = 'A post';

    const layout = document.createElement('div');
    layout.className = 'y-fixedGridColumn';
    const actions = document.createElement('div');
    actions.setAttribute('data-testid', 'overflow-set');
    layout.append(actions);

    document.body.append(article, layout);

    // Semantic containers are authoritative, so the class-matched one is not
    // mixed in alongside them.
    expect(allPosts()).toEqual([article]);
  });
});

describe('extraction without semantic containers', () => {
  it('reads the author from the action buttons accessible name', () => {
    const { starter } = mountEngageLikeThread();
    const post = extractPost(starter);
    expect(post.author).toBe('Ada Lovelace');
  });

  it('keeps the action row out of the copied body', () => {
    const { starter } = mountEngageLikeThread();
    const post = extractPost(starter);

    expect(post.body).toContain('release moves to month end');
    expect(post.body).not.toContain('Like');
    expect(post.body).not.toContain('Share');
    expect(post.body).not.toContain('More actions');
  });
});
