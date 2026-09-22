import { beforeEach, describe, expect, it } from 'vitest';
import { countPosts, extractPost, postIdentity, renderThread } from '../src/features/thread.js';
import { createPost, stubLayout } from './fixtures.js';

beforeEach(() => {
  stubLayout(window);
  document.body.innerHTML = '';
});

function mount(options) {
  const article = createPost(options);
  document.body.append(article);
  return article;
}

const THREAD = {
  author: 'Ada Lovelace',
  body: 'We are moving the release to the end of the month.',
  time: '2026-09-01T09:30:00.000Z',
  replies: [
    {
      author: 'Grace Hopper',
      body: 'Does that include the migration work?',
      time: '2026-09-01T10:00:00.000Z',
      replies: [
        {
          author: 'Ada Lovelace',
          body: 'Yes, everything in the current milestone.',
          time: '2026-09-01T10:05:00.000Z',
        },
      ],
    },
    {
      author: 'Alan Turing',
      body: 'Thanks for the update.',
      time: '2026-09-01T11:00:00.000Z',
    },
  ],
};

describe('extractPost', () => {
  it('reads author, body and timestamp', () => {
    const post = extractPost(mount(THREAD));
    expect(post.author).toBe('Ada Lovelace');
    expect(post.body).toContain('moving the release');
    expect(post.timestamp.iso).toBe('2026-09-01T09:30:00.000Z');
  });

  it('keeps the reply tree', () => {
    const post = extractPost(mount(THREAD));
    expect(post.replies).toHaveLength(2);
    expect(post.replies[0].replies[0].author).toBe('Ada Lovelace');
    expect(countPosts(post)).toBe(4);
  });

  it('does not leak reply text into the parent body', () => {
    const post = extractPost(mount(THREAD));
    expect(post.body).not.toContain('migration work');
  });

  it('strips action-bar labels', () => {
    const post = extractPost(mount({ author: 'Ada', body: 'Short note here.' }));
    expect(post.body).toBe('Short note here.');
  });

  it('returns null for a container with no content', () => {
    const empty = document.createElement('div');
    empty.setAttribute('role', 'article');
    document.body.append(empty);
    expect(extractPost(empty)).toBe(null);
  });

  it('finds a permalink when the page exposes one', () => {
    const post = extractPost(
      mount({ ...THREAD, permalink: '/main/groups/eng/threads/12345' }),
    );
    expect(post.permalink).toContain('/threads/12345');
  });
});

describe('renderThread', () => {
  it('nests replies as blockquotes in Markdown', () => {
    const post = extractPost(mount(THREAD));
    const markdown = renderThread(post, { format: 'markdown', sourceUrl: 'https://example.test/t/1' });

    expect(markdown).toMatch(/^## Ada Lovelace/m);
    expect(markdown).toMatch(/^> \*\*Grace Hopper\*\*/m);
    expect(markdown).toMatch(/^> > \*\*Ada Lovelace\*\*/m);
    expect(markdown).toContain('[Open in Viva Engage](https://example.test/t/1)');
  });

  it('indents replies in plain text', () => {
    const post = extractPost(mount(THREAD));
    const text = renderThread(post, { format: 'text', includePermalink: false });

    expect(text).not.toContain('##');
    expect(text).toMatch(/^ {4}Grace Hopper/m);
    expect(text).toMatch(/^ {8}Ada Lovelace/m);
  });

  it('omits timestamps when asked', () => {
    const post = extractPost(mount(THREAD));
    const markdown = renderThread(post, { includeTimestamps: false, includePermalink: false });
    expect(markdown).not.toContain('2026-09-01');
  });

  it('omits the permalink when asked', () => {
    const post = extractPost(mount(THREAD));
    const markdown = renderThread(post, { includePermalink: false });
    expect(markdown).not.toContain('Open in Viva Engage');
  });

  it('never emits more than one blank line in a row', () => {
    const post = extractPost(mount(THREAD));
    expect(renderThread(post)).not.toMatch(/\n{3}/);
  });
});

describe('postIdentity', () => {
  it('prefers a thread id from the permalink', () => {
    const article = mount({ ...THREAD, permalink: '/main/groups/eng/threads/abc123' });
    expect(postIdentity(article)).toBe('id:abc123');
  });

  it('falls back to a content hash and is stable across calls', () => {
    const article = mount(THREAD);
    const first = postIdentity(article);
    expect(first.startsWith('h:')).toBe(true);
    expect(postIdentity(article)).toBe(first);
  });

  it('distinguishes different posts', () => {
    const one = mount({ author: 'Ada', body: 'First post about releases.' });
    const two = mount({ author: 'Grace', body: 'Second post about migrations.' });
    expect(postIdentity(one)).not.toBe(postIdentity(two));
  });
});
