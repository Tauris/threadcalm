import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as settings from '../src/core/settings.js';
import { createCopyTools } from '../src/features/copy.js';
import { countPosts, extractPost, extractThread, threadMembers } from '../src/features/thread.js';
import { stubLayout } from './fixtures.js';

/**
 * A conversation as Engage's conversation view renders it: the starter and
 * every comment are siblings, and a reply to a comment is marked only by being
 * drawn further right. This is the layout that made copying return a lone
 * reply, because nothing is nested inside anything else.
 */
function post(className, author, body, { left = 0, kind = 'comment' } = {}) {
  const element = document.createElement('div');
  element.className = className;
  element.dataset.left = String(left);

  const text = document.createElement('div');
  text.textContent = body;
  element.append(text);

  const actions = document.createElement('div');
  actions.setAttribute('data-testid', 'overflow-set');
  const like = document.createElement('button');
  like.setAttribute('aria-label', `Like - ${author}'s ${kind}`);
  like.textContent = 'Like';
  actions.append(like);
  element.append(actions);
  return element;
}

function mountConversation() {
  const main = document.createElement('div');
  main.setAttribute('role', 'main');

  const starter = post('qaThreadStarter', 'Ada Lovelace', 'The release moves to month end.', { kind: 'post' });
  const first = post('y-fixedGridColumn', 'Grace Hopper', 'Does that include migrations?', { left: 40 });
  const answer = post('y-fixedGridColumn', 'Ada Lovelace', 'Yes, all of them.', { left: 80 });
  const second = post('y-fixedGridColumn', 'Alan Turing', 'Thanks for the notice.', { left: 40 });

  // A second conversation after it, as on a feed.
  const other = post('qaThreadStarter', 'Katherine Johnson', 'Unrelated news.', { kind: 'post' });
  const otherReply = post('y-fixedGridColumn', 'Dorothy Vaughan', 'Noted.', { left: 40 });

  main.append(starter, first, answer, second, other, otherReply);
  document.body.append(main);
  return { starter, first, answer, second, other, otherReply };
}

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';

  // Indentation is the only nesting this layout expresses, so the stub reports
  // each post's `data-left` as its horizontal position.
  const base = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function positioned() {
    const rect = base.call(this);
    const left = Number(this.dataset?.left ?? 0);
    return { ...rect, left, right: left + rect.width };
  };
});

afterEach(() => {
  delete globalThis.GM_setClipboard;
});

describe('finding the thread a post belongs to', () => {
  it('reaches back to the starter from any reply', () => {
    const { starter, first, answer, second } = mountConversation();
    expect(threadMembers(answer)).toEqual([starter, first, answer, second]);
  });

  it('stops at the next starter', () => {
    const { other, otherReply } = mountConversation();
    expect(threadMembers(otherReply)).toEqual([other, otherReply]);
  });

  it('declines when there is no starter to anchor to', () => {
    const lone = post('y-fixedGridColumn', 'Grace Hopper', 'Orphan.');
    document.body.append(lone);
    expect(threadMembers(lone)).toBe(null);
  });

  it('declines for nested replies, which the post itself already carries', () => {
    const starter = post('qaThreadStarter', 'Ada Lovelace', 'Starter.', { kind: 'post' });
    starter.append(post('y-fixedGridColumn', 'Grace Hopper', 'Nested reply.'));
    document.body.append(starter);
    expect(threadMembers(starter)).toBe(null);
  });
});

describe('reading a sibling-layout thread', () => {
  it('rebuilds reply depth from indentation', () => {
    const { starter } = mountConversation();
    const tree = extractThread(threadMembers(starter));

    expect(countPosts(tree)).toBe(4);
    expect(tree.replies.map((reply) => reply.body)).toEqual([
      'Does that include migrations?',
      'Thanks for the notice.',
    ]);
    expect(tree.replies[0].replies.map((reply) => reply.body)).toEqual(['Yes, all of them.']);
  });
});

describe('copying from a reply', () => {
  it('copies the whole conversation, not the reply alone', async () => {
    const { answer } = mountConversation();
    let copied = '';
    globalThis.GM_setClipboard = (text) => {
      copied = text;
    };

    const tools = createCopyTools({ expander: { expandWithin: () => 0 } });
    await tools.copyThread(answer);

    for (const body of [
      'The release moves to month end.',
      'Does that include migrations?',
      'Yes, all of them.',
      'Thanks for the notice.',
    ]) {
      expect(copied).toContain(body);
    }
    expect(copied).not.toContain('Unrelated news.');
  });
});

describe('the author of a post with an initials avatar', () => {
  /**
   * Engage draws an avatar with no photo as the author's initials, and makes
   * it a profile link like the name beside it. With the avatar first, taking
   * the first profile link copied the thread's opening post as "## KJ".
   */
  function starterWithAvatar() {
    const starter = post('qaThreadStarter', 'Katherine Johnson', 'Launch window confirmed.', {
      kind: 'post',
    });
    const header = document.createElement('div');
    const avatar = document.createElement('a');
    avatar.href = '/main/users/katherine';
    avatar.textContent = 'KJ';
    const name = document.createElement('a');
    name.href = '/main/users/katherine';
    name.textContent = 'Katherine Johnson';
    header.append(avatar, document.createElement('br'), name);
    starter.prepend(header);
    document.body.append(starter);
    return { starter, avatar, name };
  }

  it('takes the name, not the initials', () => {
    const { starter } = starterWithAvatar();
    expect(extractPost(starter).author).toBe('Katherine Johnson');
  });

  it('falls back to the action label when only the avatar is a link', () => {
    const { starter, name } = starterWithAvatar();
    name.replaceWith(document.createTextNode('Katherine Johnson'));
    // The Like button carries the full name: "Like - Katherine Johnson's post".
    expect(extractPost(starter).author).toBe('Katherine Johnson');
  });

  it('keeps neither the initials nor the name at the top of the body', () => {
    const { starter } = starterWithAvatar();
    expect(extractPost(starter).body).toBe('Launch window confirmed.');
  });
});
