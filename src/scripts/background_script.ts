import { Creator, loadCreators as _loadCreators, creatorHasNebulaVideo, creatorHasYTVideo, existsNebulaVideo, normalizeString } from './background';
import { BrowserMessage, getBrowserInstance, getFromStorage, nebulavideo, parseTypeObject } from './helpers/sharedExt';

const videoFetchYt = 50;
const videoFetchNebula = 50;

const { local, sync } = getBrowserInstance().storage;

getBrowserInstance().browserAction.onClicked.addListener(() => openOptions());

getBrowserInstance().runtime.onMessage.addListener(async (message: string | { [key: string]: any }) => {
  try {
    const msg = parseTypeObject(message);
    console.dev.log('Handling message', msg);
    switch (msg.type) {
      case BrowserMessage.INIT_PAGE:
        return openChangelog();
      case BrowserMessage.LOAD_CREATORS:
        return console.debug(await loadCreators());
      case BrowserMessage.GET_YTID:
        return getYoutubeId(msg);
      case BrowserMessage.GET_VID:
        return getNebulaVideo(msg);
    }
  } catch {}
});

getBrowserInstance().runtime.onInstalled.addListener(async (details) => {
  if (sync) {
    await sync.set(await local.get());
    await local.clear();
  }

  if (details.reason === 'install') openOptions(true, 'show-changelogs');
});

const openChangelog = async () => {
  const { showChangelogs: show, lastVersion: version } = await getFromStorage({ showChangelogs: true, lastVersion: '-1' });
  console.debug({ show, version }, 'open changelogs?', show && version !== getBrowserInstance().runtime.getManifest().version);
  if (show && version !== getBrowserInstance().runtime.getManifest().version)
    openOptions(false, 'show-changelogs');
};

const loadCreators = (() => {
  let promise: Promise<Creator[]> = null;
  return () => {
    if (promise) return promise;
    return promise = _loadCreators();
  };
})();

const getYoutubeId = async (message: { [key: string]: any }) => {
  const { creator, title, nebula } = message;
  const normalizedCreator = normalizeString(creator);
  console.debug('creator:', creator, '\nnebula:', nebula, '\ntitle:', title);

  try {
    const creators = await loadCreators();
    const uploads = creators.find(e => e.name === creator || normalizeString(e.name) === normalizedCreator || e.nebula === nebula)?.uploads;
    return creatorHasYTVideo(uploads, title, videoFetchYt);
  } catch (err) {
    console.error(err);
    return Promise.reject(err);
  }
};

const getNebulaVideo = async (message: { [key: string]: any }): Promise<nebulavideo> => {
  const { channelID, videoTitle } = message;

  const creators = await loadCreators();
  const creator = creators.find(c => c.channel === channelID);
  console.debug('creator:', creator, '\nchannelID:', channelID, '\nvideoTitle:', videoTitle);
  if (!creator) return;

  // try search the channel's newest videos locally
  if (creator.nebula) {
    try {
      const video = await creatorHasNebulaVideo(creator.nebula, videoTitle, videoFetchNebula);
      return {
        is: 'video',
        confidence: video.confidence,
        link: video.video,
      };
    } catch (err) {
      console.error(err);
    }
  }

  // try search the alternative channel's newest videos locally
  if (creator.nebulaAlt && creator.nebula !== creator.nebulaAlt) {
    try {
      const video = await creatorHasNebulaVideo(creator.nebulaAlt, videoTitle, videoFetchNebula);
      return {
        is: 'video',
        confidence: video.confidence,
        link: video.video,
      };
    } catch (err) {
      console.error(err);
    }
  }

  // fall back to site-wide search
  try {
    const video = await existsNebulaVideo(videoTitle, videoFetchNebula);
    return {
      is: 'search',
      confidence: video.confidence,
      link: video.video,
    };
  } catch (err) {
    console.error(err);
  }

  // last resort: link to channel
  if (!creator.nebula && !creator.nebulaAlt) return;
  return {
    is: 'channel',
    link: `https://nebula.app/${creator.nebula || creator.nebulaAlt}`,
  };
};

const openOptions = (active = true, ...args: string[]) => {
  getBrowserInstance().tabs.create({
    url: getBrowserInstance().runtime.getURL(`options.html#standalone ${args.join(' ')}`),
    active,
  });
};

(async () => {
  const yt = (await getFromStorage({ youtube: false })).youtube;
  if (!yt) return;
  console.debug(await loadCreators());
})();