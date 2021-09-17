import fetch, { Response } from 'node-fetch';
import type { Video } from '../../src/scripts/background';
import { NEBULA_AUTH_KEY } from '../../src/scripts/helpers/shared';

global.fetch = fetch as unknown as typeof global.fetch;

jest.mock('../../src/scripts/helpers/api/store', (): typeof import('../../src/scripts/helpers/api/store') => {
  const orig = jest.requireActual('../../src/scripts/helpers/api/store') as typeof import('../../src/scripts/helpers/api/store');
  return {
    ...orig,
    refreshToken: jest.fn(orig.refreshToken),
  };
});
// need to do this here with a require, because rollup will hoist all imports, and we don't have a plugin to hoist jest.mock (like babel-plugin-jest-hoist)
const { opt, refreshToken } = require('../../src/scripts/helpers/api/store') as typeof import('../../src/scripts/helpers/api/store');
const { getVideo } = require('../../src/scripts/helpers/api') as typeof import('../../src/scripts/helpers/api');
const { creatorHasNebulaVideo, loadNebulaChannelVideos, existsNebulaVideo, loadNebulaSearchVideos } = require('../../src/scripts/background') as typeof import('../../src/scripts/background');
const refMock = refreshToken as jest.MockedFunction<typeof refreshToken>;

describe('loading nebula videos', () => {
  const consoleError = console.error;
  const consoleDebug = console.debug;
  beforeEach(() => {
    console.error = consoleError;
    console.debug = consoleDebug;
  });

  test('non-existant channel', async () => {
    console.debug = jest.fn();
    console.error = jest.fn();
    await expect(creatorHasNebulaVideo('', '', 50)).rejects.toBeDefined();
    await expect(creatorHasNebulaVideo('UU', '', 50)).rejects.toBeDefined();
    await expect(creatorHasNebulaVideo('', 'test', 50)).rejects.toBeDefined();
    await expect(creatorHasNebulaVideo('UU', 'test', 50)).rejects.toBeDefined();
  });

  jest.setTimeout(10000);
  test('Half as Interesting', async () => {
    console.debug = jest.fn();
    console.error = jest.fn();
    await expect(loadNebulaChannelVideos('hai', 0)).resolves.toHaveLength(0);
    await expect(loadNebulaChannelVideos('hai', 50)).resolves.toHaveLength(50);
    await expect(loadNebulaChannelVideos('hai', 100)).resolves.toHaveLength(100);
    const vid = (await loadNebulaChannelVideos('hai', 1))[0] as Video;
    await expect(creatorHasNebulaVideo('hai', vid.title, 50)).resolves.toEqual({ confidence: 1, video: vid.videoId });
    await expect(creatorHasNebulaVideo('hai', vid.title + ' asdf', 50)).resolves.toMatchObject({ video: vid.videoId });
    await expect(creatorHasNebulaVideo('hai', vid.title, 100)).resolves.toEqual({ confidence: 1, video: vid.videoId });

    // from cache
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    await expect(creatorHasNebulaVideo('hai', vid.title, 50)).resolves.toEqual({ confidence: 1, video: vid.videoId });
    expect(fetchMock).not.toBeCalled();
    await expect(loadNebulaChannelVideos('hai', 100)).resolves.toHaveLength(100);
    expect(fetchMock).not.toBeCalled();
    global.fetch = fetch as unknown as typeof global.fetch;
  });

  test('search', async () => {
    console.debug = jest.fn();
    console.error = jest.fn();
    await expect(loadNebulaSearchVideos('test', 0)).resolves.toHaveLength(0);
    await expect(loadNebulaSearchVideos('test', 50)).resolves.toHaveLength(50);
    await expect(loadNebulaSearchVideos('test', 100)).resolves.toHaveLength(100);
    const vid = (await loadNebulaSearchVideos('test', 1))[0] as Video;
    await expect(existsNebulaVideo(vid.title, 50)).resolves.toEqual({ confidence: 1, video: vid.videoId });
    const t = vid.title.substring(vid.title.indexOf(' '));
    await expect(existsNebulaVideo(t, 50)).resolves.toMatchObject({ video: vid.videoId });
    await expect(existsNebulaVideo(vid.title, 100)).resolves.toEqual({ confidence: 1, video: vid.videoId });

    // from cache
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    await expect(existsNebulaVideo(vid.title, 50)).resolves.toEqual({ confidence: 1, video: vid.videoId });
    expect(fetchMock).not.toBeCalled();
    await expect(loadNebulaSearchVideos('test', 100)).resolves.toHaveLength(100);
    expect(fetchMock).not.toBeCalled();
    global.fetch = fetch as unknown as typeof global.fetch;
  });
});

describe('api', () => {
  const fetchMock = jest.fn();

  beforeAll(() => {
    global.fetch = fetchMock;
  });

  const consoleError = console.error;
  const consoleDebug = console.debug;
  beforeEach(() => {
    console.error = consoleError;
    console.debug = consoleDebug;

    document.cookie = `${NEBULA_AUTH_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 GMT`; // remove auth cookie
    opt.auth = null;
    fetchMock.mockClear();
    refMock.mockClear();
  });

  afterAll(() => {
    global.fetch = fetch as unknown as typeof global.fetch;
  });

  const genTokenResponse = () => Promise.resolve(new Response(JSON.stringify({ token: Math.random().toString(16).substr(2) })));

  test('no token', async () => {
    fetchMock.mockImplementationOnce(genTokenResponse);

    console.debug = jest.fn();
    const token = await refreshToken();
    expect(fetchMock).toHaveBeenCalled();
    expect(token).toBeTruthy();
    expect(opt.auth).toBe(token);
  });

  test('token from cookie', async () => {
    fetchMock.mockImplementationOnce((_, init) => {
      expect(init.headers.Authorization).toContain('test');
      return genTokenResponse();
    });

    document.cookie = `${NEBULA_AUTH_KEY}=${JSON.stringify({ apiToken: 'test' })}`;
    const token = await refreshToken();
    expect(fetchMock).toHaveBeenCalled();
    expect(token).toBeTruthy();
    expect(opt.auth).toBe(token);
  });

  test('request refreshes token automatically', async () => {
    fetchMock.mockImplementationOnce(genTokenResponse)
      .mockReturnValueOnce(Promise.resolve(new Response('{}')));

    console.debug = jest.fn();
    await getVideo('test');
    expect(refMock).toHaveBeenCalled();
  });

  test('request refreshes after token expired', async () => {
    fetchMock.mockImplementationOnce(genTokenResponse)
      .mockReturnValueOnce(Promise.resolve(new Response(JSON.stringify({ detail: 'Signature has expired' }))))
      .mockImplementationOnce(genTokenResponse)
      .mockReturnValueOnce(Promise.resolve(new Response('{}')));

    console.debug = jest.fn();
    await getVideo('test');
    expect(refMock).toHaveBeenCalledTimes(2);
  });
});
