import iconWatchLater from "../../icons/watchlater.svg";
import { durationLocation, queueBottonLocation } from '../helpers/locations';
import { getBrowserInstance, injectScript, isMobile, isVideoPage, mutation, videoUrlMatch, ytvideo } from "../helpers/sharedBrowser";
import { loadPrefix } from '../page/dispatcher';
import { Queue } from "./queue";
import { handle } from './message';

const videoselector = 'a[href^="/videos/"]';
const addToQueue = getBrowserInstance().i18n.getMessage('pageAddToQueue');

function getFromStorage<T extends { [key: string]: any }>(key: T): Promise<T>;
function getFromStorage(key: string | string[] | { [key: string]: any }) { return getBrowserInstance().storage.local.get(key); }

let theatreMode = false;
export const nebula = async () => {
  await injectScript(getBrowserInstance().runtime.getURL('/scripts/player.js'), document.body);

  const menu = document.querySelector('menu');
  window.addEventListener('message', message.bind(null, menu));
  document.body.addEventListener('mouseover', hover);
  document.body.addEventListener('click', click);
  Queue.get(); // initialize
  window.addEventListener('hashchange', hashChange);
  hashChange();
  window.addEventListener('focus', () => focusIframe());
  focusIframe();

  const mobile = isMobile();
  const { youtube, theatre, customScriptPage } = await getFromStorage({ youtube: false, theatre: false, customScriptPage: '' });
  console.debug('Youtube:', youtube, 'Theatre Mode:', theatre);
  theatreMode = theatre && !mobile;

  maybeLoadComments(youtube);
  
  const r = refreshTheatreMode.bind(null, menu);
  
  document.addEventListener(`${loadPrefix}-video`, () => {
    maybeLoadComments(youtube);
    domRefreshTheatreMode(menu);
    const f = document.querySelector('iframe');
    if (!f) return;
    f.removeEventListener('fullscreenchange', r);
    f.addEventListener('fullscreenchange', r);
    f.setAttribute('allow', 'autoplay');
  });

  const cb = mutation(() => {
    // substitute hover listener
    if (isMobile())
      Array.from(document.querySelectorAll<HTMLImageElement>(`${videoselector} img`)).forEach(createLink);
  });
  const m = new MutationObserver(cb);
  m.observe(document.querySelector('#root'), { subtree: true, childList: true });
  window.addEventListener('resize', updateTheatreMode.bind(null, menu));
  cb();

  // inject custom script (if available)
  if (customScriptPage)
    injectScript(document.body, customScriptPage);
};

const message = (menu: HTMLElement, e: MessageEvent) => {
  const msg = handle(e);
  if (msg === true)
    return; // one of standard events
  switch (msg.type) {
    case "goTheatreMode":
      return goTheatreMode(menu);
    case "cancelTheatreMode":
      return cancelTheatreMode();
    case "toggleTheatreMode":
      return theatreMode ? cancelTheatreMode() : goTheatreMode(menu);
  }
}

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

const hashChange = () => {
  const current = window.location.pathname.match(videoUrlMatch);
  const hash = window.location.hash.match(/^#([A-Za-z0-9\-_]+(?:,[A-Za-z0-9\-_]+)*)$/);
  if (!hash)
    return; // invalid video list
  // extract comma separated list of friendly-names from hash
  const q = hash[1].split(',');
  Queue.get().set(q, current ? current[1] : undefined);
};

const maybeLoadComments = (yt: boolean) => {
  if (yt && isVideoPage())
    loadComments();
};
const loadComments = async () => {
  const h2 = Array.from(document.querySelectorAll('h2'));
  if (h2.length < 2) return;
  const title = h2[0].textContent;
  const creator = h2[1].textContent;
  if (!title || !creator) return;
  const e = h2[0].nextElementSibling;
  if (!e || e.querySelector('.enhancer-yt, .enhancer-yt-err'))
    return; // already requested
  console.debug(`Requesting '${title}' by ${creator}`);

  try {
    const vid: ytvideo = await getBrowserInstance().runtime.sendMessage({ type: 'getYoutubeId', creator, title });
    const v = document.createElement('span');
    v.classList.add('enhancer-yt');
    const a = document.createElement('a');
    a.href = `https://youtu.be/${vid.video}`;
    a.target = '_blank';
    a.textContent = a.href;
    v.append(a, ` (${(vid.confidence * 100).toFixed(1)}%)`);
    e.append(e.querySelector('span[class]')?.cloneNode(true), v); // dot
  } catch (err) {
    console.error(err);
    const er = document.createElement('span');
    er.classList.add('enhancer-yt-err');
    er.textContent = `${err}`;
    e.append(er);
  }
  console.debug('Loading comments done.');
};

const maybeGoTheatreMode = (menu: HTMLElement) => {
  if (isVideoPage())
    setTimeout(goTheatreMode, 0, menu);
};
const goTheatreMode = (menu: HTMLElement) => {
  const mh = menu.getBoundingClientRect().height;
  const frame = document.querySelector('iframe');
  if (!frame)
    return;
  const ratio = frame.clientWidth / frame.clientHeight;
  const top = +window.getComputedStyle(frame.parentElement.parentElement).paddingTop.slice(0, -2);
  if (!ratio)
    return;
  let newheight = window.innerHeight - 2 * mh - 2 * top;
  let newwidth = ratio * newheight;
  if (newwidth > window.innerWidth - top * 2) {
    const ratio2 = frame.clientHeight / frame.clientWidth;
    newwidth = window.innerWidth - top * 2;
    newheight = ratio2 * newwidth;
  }
  if (!newheight || !newwidth)
    return;
  frame.parentElement.style.height = `${newheight}px`;
  frame.parentElement.style.width = `${newwidth}px`;
  theatreMode = true;
};
const cancelTheatreMode = () => {
  const frame = document.querySelector('iframe');
  if (!frame)
    return;
  frame.parentElement.style.height = '';
  frame.parentElement.style.width = '';
  theatreMode = false;
};
const updateTheatreMode = (menu: HTMLElement) => {
  if (theatreMode)
    maybeGoTheatreMode(menu);
};
const refreshTheatreMode = (menu: HTMLElement) => {
  if (!theatreMode || !isVideoPage())
    return;
  cancelTheatreMode();
  setTimeout(goTheatreMode, 0, menu);
};
const domRefreshTheatreMode = (() => {
  let hadIFrame = false;
  return (menu: HTMLElement) => {
    const hasIFrame = document.querySelector('iframe');
    if (!hadIFrame && hasIFrame)
      refreshTheatreMode(menu);
    if (theatreMode && !hasIFrame.style.height)
      goTheatreMode(menu);
    hadIFrame = !!hasIFrame;
  };
})();

const focusIframe = (iter = 0) => {
  if (!isVideoPage()) return;
  if (iter > 10) return;
  const f = document.querySelector('iframe');
  if (!f) setTimeout(focusIframe, 100, iter + 1);
  else f.focus();
};