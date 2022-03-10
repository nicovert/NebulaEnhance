import iconWatchLater from '../../../icons/watchlater.svg';
import { enqueueChannelVideos } from '../../helpers/api';
import { creatorLink, durationLocation, queueBottonLocation } from '../../helpers/locations';
import { BrowserMessage, clone, debounce, devClone, devExport, getBrowserInstance, getFromStorage, injectScript, isMobile, isVideoListPage, isVideoPage, setToStorage, videoUrlMatch, ytvideo } from '../../helpers/sharedExt';
import { creatorRegex, loadPrefix, videoselector, xhrPrefix } from '../../page/dispatcher';
import { Queue } from '../queue';
import { handle } from './message';

const addToQueue = getBrowserInstance().i18n.getMessage('pageAddToQueue');

export const nebula = async () => {
  const { youtube, customScriptPage, hiddenCreators } = await getFromStorage({ youtube: false, customScriptPage: '', hiddenCreators: [] as string[] });
  console.debug('Youtube:', youtube);
  console.debug('Hiding', hiddenCreators.length, 'creators');

  // attach listeners
  const cb = debounce(doVideoActions, 500, hiddenCreators);
  window.addEventListener('message', handle);
  window.addEventListener('hashchange', hashChange);
  document.addEventListener(`${loadPrefix}-video`, maybeLoadComments.bind(null, youtube));
  document.addEventListener(`${loadPrefix}-creator`, createLinkForAll);
  document.addEventListener(loadPrefix, cb);
  document.addEventListener(xhrPrefix, cb);
  document.body.addEventListener('mouseover', hover);
  document.body.addEventListener('click', click);
  cb();

  // inject web content script
  await injectScript(getBrowserInstance().runtime.getURL('/scripts/player.js'), document.body);

  // start up own content
  const queue = Queue.get(); // initialize
  await hashChange();
  await Queue.get().restoreStorage();
  await maybeLoadComments(youtube);

  // inject custom script (if available)
  if (customScriptPage)
    await injectScript(document.body, customScriptPage);

  document.body.classList.add('enhancer-initialized');

  // debug code
  // rollup optimizes everything that relies on __DEV__ out
  // but because of potential side-effects in queue[key] and v.bind(queue),
  // we need to explicitly guard here
  if (!__DEV__) return;
  devClone('queue', {});
  Object.keys(queue).forEach(key => {
    const v = queue[key];
    const str = Object.prototype.toString.call(v);
    if (typeof v === 'function') devClone(key, v.bind(queue), 'queue');
    else if (str !== '[object Object]') devExport(key, () => queue[key], 'queue');
    else devExport(key, () => clone(queue[key]), 'queue');
  });
};

const doVideoActions = (hiddenCreators: string[]) => {
  // add links on mobile to substitute hover
  if (isMobile())
    Array.from(document.querySelectorAll<HTMLImageElement>(`${videoselector} img`)).forEach(createLink);
  // hide creators
  if (isVideoListPage())
    Array.from(document.querySelectorAll<HTMLImageElement>(videoselector)).forEach(el => hideVideo(el, hiddenCreators));
};

const imgLink = (e: HTMLElement) => {
  // check if element is the image in a video link
  if (e.tagName !== 'IMG')
    return null;
  const link = e.closest(videoselector);
  if (link === null)
    return null;
  return link;
};
const hover = (e: MouseEvent) => {
  const link = imgLink(e.target as HTMLElement);
  if (link === null)
    return;
  createLink(e.target as HTMLImageElement);
};
const createLink = (img: HTMLImageElement) => {
  if (queueBottonLocation(img).querySelector('.enhancer-queueButton') !== null)
    return; // queue button exists
  // create queue button
  const later = document.createElement('div');
  const time = durationLocation(img);
  if (!time || !time.querySelector('span'))
    return; // ignore profile pic
  later.innerHTML = `<span class="${time.querySelector('span')?.className}">${addToQueue}</span>${iconWatchLater}`;
  later.className = `${time?.className} enhancer-queueButton`;
  queueBottonLocation(img).appendChild(later);
};

const click = async (e: MouseEvent) => {
  const q = Queue.get();
  const target = e.target as HTMLElement;

  if (target.closest('[href="https://standard.tv/"] + * + * > *:nth-child(2)'))
    return changeTheme(e);

  const addAll = target.closest('.enhancer-queueButtonAll');
  if (addAll !== null) {
    e.preventDefault();
    const creator = window.location.pathname.match(creatorRegex)[1];
    document.body.style.cursor = 'wait';
    (document.activeElement as HTMLElement).blur();
    // Queue.get().set(await getChannelVideos(creator));
    await enqueueChannelVideos(Queue.get(), creator);
    document.body.style.cursor = '';
    return;
  }

  const later = target.closest('.enhancer-queueButton');
  const link = target.closest<HTMLAnchorElement>(videoselector);
  if (link === null)
    return;
  const name = link.getAttribute('href').substr(8);
  // extract and store information on video
  await q.addToStore(name, link);
  // no queue and video clicked
  if (q.isEmpty() && later === null)
    return;
  // always prevent going to video
  e.preventDefault();
  if (later !== null) {
    // queue button clicked
    q.enqueue(name);
  } else {
    // video clicked
    q.enqueueNow(name);
    q.gotoNext();
  }
};

const hashChange = async () => {
  const current = window.location.pathname.match(videoUrlMatch);
  const hash = window.location.hash.match(/^#([A-Za-z0-9\-_]+(?:,[A-Za-z0-9\-_]+)*)$/);
  if (!hash)
    return; // invalid video list
  // extract comma separated list of friendly-names from hash
  const q = hash[1].split(',');
  const cur = current ? current[1] : undefined;
  console.dev.debug('queue:', q, '\ncurrent:', cur);
  await Queue.get().set(q, cur);
  console.debug('Queue: loaded from hash');
};

const maybeLoadComments = (yt: boolean) => {
  if (yt && isVideoPage())
    return loadComments();
};
const loadComments = async () => {
  const h2 = Array.from(document.querySelectorAll('h2'));
  if (h2.length < 2) return;
  const title = h2[0].textContent;
  const creator = h2[1].textContent;
  const nebula = (h2[1].parentElement as HTMLAnchorElement).href;
  if (!title || !creator) return;
  const e = h2[0].nextElementSibling;
  if (!e || e.querySelector('.enhancer-yt, .enhancer-yt-err'))
    return; // already requested
  console.debug(`Requesting '${title}' by ${creator} (${nebula})`);

  try {
    const vid: ytvideo = await getBrowserInstance().runtime.sendMessage({ type: BrowserMessage.GET_YTID, creator, title, nebula });
    console.debug('Found video:', vid);
    const v = document.createElement('span');
    v.classList.add('enhancer-yt');
    const a = document.createElement('a');
    a.href = `https://youtu.be/${vid.video}`;
    a.target = '_blank';
    a.textContent = a.href;
    v.append(a, ` (${(vid.confidence * 100).toFixed(1)}%)`);
    e.append(e.querySelector('span[class]')?.cloneNode(true), v); // dot
  } catch (err) {
    console.debug('Request failed:', err);
    console.dev.error(err);
    const er = document.createElement('span');
    er.classList.add('enhancer-yt-err');
    er.textContent = `${err}`;
    e.append(er);
  }
  console.debug('Loading comments done.');
};

const createLinkForAll = () => {
  document.querySelector('.enhancer-queueButtonAll')?.remove();
  const container = document.querySelector('picture + div > p + div');
  if (!container)
    return;

  const link = !container.children.length ? document.createElement('a') : container.children[0].cloneNode(true) as HTMLAnchorElement;
  link.style.color = link.querySelector('svg')?.getAttribute('fill');
  link.innerHTML = iconWatchLater;
  link.href = '#';
  link.classList.add('enhancer-queueButton', 'enhancer-queueButtonAll');
  container.appendChild(link);
};

const changeTheme = (e: MouseEvent) => {
  const theme = (e.target as HTMLElement).textContent.toLowerCase();
  console.debug('Saving theme', theme);
  setToStorage({ theme });
};

const hideVideo = (el: HTMLElement, hiddenCreators: string[]) => {
  const creator = creatorLink(el)?.substring(1);
  if (!creator) return;
  if (hiddenCreators.indexOf(creator) === -1) return;
  console.debug('Hiding video by creator', creator);
  el.parentElement.remove();
};
