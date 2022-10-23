import type { VPlayer } from '../../types/videojs';
import QueueButton from './components/queue';
import SpeedDial from './components/speeddial';
import Time from './components/time';
import VolumeText from './components/volume';
import { init as initDispatch, loadPrefix } from './dispatcher';
import { Message, arrFromLengthy, getFromStorage, onStorageChange, sendMessage } from './sharedpage';

type Comp<T> = T extends (...args: any[]) => Promise<infer R> ? R : T extends (...args: any[]) => infer R ? R : never;

const optionsDefaults = {
  playbackChange: 0.1,
  autoplay: false,
  autoplayQueue: false,
  volumeEnabled: false,
  volumeShow: false,
  volumeChange: 0.1,
  volumeLog: false,
  useFirstSubtitle: false,
};
let options = { ...optionsDefaults };

export const init = async () => {
  const {
    playbackChange, autoplay, autoplayQueue, volumeEnabled,
    volumeChange, volumeLog, volumeShow, useFirstSubtitle,
  } = options = await getFromStorage(optionsDefaults);
  console.debug('playbackChange:', playbackChange, 'autoplay?', autoplay, 'autoplay in queue?', autoplayQueue,
    '\nvolume scroll?', volumeEnabled, 'change:', volumeChange, 'log?', volumeLog, 'show?', volumeShow,
    '\nuse first subtitle?', useFirstSubtitle);

  await waitForVJS();
  await registerComponents();
  setPlayerDefaults(autoplay);

  document.addEventListener('keydown', keydownHandler, { capture: true });
  document.addEventListener('wheel', wheelHandler, { passive: false });
  document.addEventListener('click', clickHandler, { capture: true });
  document.addEventListener(`${loadPrefix}-video`, initPlayer);
  await initDispatch();

  onStorageChange(changed => {
    Object.keys(options).forEach(prop => {
      if (prop in changed && 'newValue' in changed[prop]) {
        /* @ts-expect-error for some reason, options[prop] narrows to never... */
        options[prop] = changed[prop].newValue as typeof options[typeof prop];
      }
    });
    const player = findAPlayer();
    if (!player) return;
    window.videojs.options.autoplay = options.autoplay;
    (player.controlBar.getChild('VolumeText') as InstanceType<Comp<typeof VolumeText>>).setShown(options.volumeShow);
  });
};

export const initPlayer = async () => {
  const player = await getAPlayer();

  if (!player || player._enhancerInit)
    return; // already initialized this player

  player.on('ended', () => sendMessage(Message.QUEUE_NEXT, null, false));

  const { autoplay, autoplayQueue } = options;
  console.debug('autoplay?', autoplay, 'autoplayQueue?', autoplayQueue);

  if (player.controlBar.getChild('SpeedDial') === undefined)
    addPlayerControls(player, autoplay);

  const { canNext, canPrev, length: queueLen } = await sendMessage(Message.GET_QSTATUS);
  console.debug('canGoNext?', canNext, 'canGoPrev?', canPrev, 'queueLen:', queueLen);
  updatePlayerControls(player, canNext, canPrev);
  player.autoplay(autoplay || (autoplayQueue && !!queueLen));
  if (player.autoplay()) player.play();
  else player.pause();

  player._enhancerInit = true;
};

export const waitForVJS = () => new Promise<typeof window.videojs>(resolve => {
  const i = window.setInterval(() => {
    if (window.videojs) {
      window.clearInterval(i);
      resolve(window.videojs);
    }
  }, 100);
});

export const findAPlayer = () => {
  if (!window.videojs || !window.videojs.players)
    return undefined;
  const player = document.querySelector('.video-js');
  if (!player)
    return undefined;
  return window.videojs.players[player.id];
};

export const getAPlayer = (maxiter: number | null = 10) => new Promise<VPlayer>((resolve, reject) => {
  let iter = 0;
  const i = window.setInterval(() => {
    if (maxiter !== null && iter++ > maxiter) {
      window.clearInterval(i);
      reject('No player found');
      return;
    }
    const player = findAPlayer();
    if (player) {
      window.clearInterval(i);
      resolve(player);
    }
  }, 100);
});

const registerComponents = async () => {
  console.debug('registering video components');
  /* eslint-disable new-cap */
  window.videojs.registerComponent('SpeedDial', await SpeedDial(options));
  window.videojs.registerComponent('Time', Time());
  window.videojs.registerComponent('VolumeText', VolumeText(options));
  window.videojs.registerComponent('QueueNext', await QueueButton(true));
  window.videojs.registerComponent('QueuePrev', await QueueButton(false));
  /* eslint-enable new-cap */
};

const setPlayerDefaults = (autoplay: boolean) => {
  window.videojs.options.autoplay = autoplay;

  const comps = window.videojs.getComponent('controlBar').prototype.options_.children;
  comps.push('speedDial');
  const tidx = comps.findIndex(c => c === 'currentTimeDisplay');
  comps.splice(tidx, 0, 'time');
  const vidx = comps.findIndex(c => c === 'volumePanel');
  comps.splice(vidx + 1, 0, 'volumeText');
  const pidx = comps.findIndex(c => c === 'playToggle');
  comps.splice(pidx + 1, 0, 'queueNext');
  comps.splice(pidx, 0, 'queuePrev');
};

const addPlayerControls = (player: VPlayer, autoplay: boolean) => {
  // call only if player already existed by the time defaults were set
  console.debug('Adding player controls because not present yet');

  player.autoplay(autoplay);

  const bar = player.controlBar;
  bar.addChild('SpeedDial');
  const tidx = bar.children().findIndex(c => c.name() === 'CurrentTimeDisplay');
  bar.addChild('Time', {}, tidx);
  const vidx = bar.children().findIndex(c => c.name() === 'VolumePanel');
  bar.addChild('VolumeText', {}, vidx + 1);
  const pidx = bar.children().findIndex(c => c.name() === 'PlayToggle');
  bar.addChild('QueueNext', {}, pidx + 1);
  bar.addChild('QueuePrev', {}, pidx);
};

export const updatePlayerControls = (player: VPlayer, canNext: boolean, canPrev: boolean) => {
  if (!player) return;
  (player.controlBar.getChild('QueueNext') as InstanceType<Comp<typeof QueueButton>>).toggle(canNext);
  (player.controlBar.getChild('QueuePrev') as InstanceType<Comp<typeof QueueButton>>).toggle(canPrev);
};

const keydownHandler = (e: KeyboardEvent) => {
  if (e.altKey || e.ctrlKey || e.metaKey)
    return;
  if (document.activeElement.tagName === 'INPUT')
    return;
  const pressedKey = e.key;
  const player = findAPlayer();
  if (!player)
    return;

  switch (pressedKey) {
    case ',':
      player.currentTime(player.currentTime() - 0.03); // "frame" back
      break;
    case '.':
      player.currentTime(player.currentTime() + 0.03); // "frame" forward
      break;
    case '0': case '1': case '2': case '3': case '4':
    case '5': case '6': case '7': case '8': case '9':
      player.currentTime(player.duration() * (+pressedKey) / 10);
      break;
    case 'Home':
      player.currentTime(0);
      break;
    case 'End':
      player.currentTime(player.duration());
      break;
    case '<':
      player.playbackRate(Math.round((player.playbackRate() - options.playbackChange) * 100) / 100);
      break;
    case '>':
      player.playbackRate(Math.round((player.playbackRate() + options.playbackChange) * 100) / 100);
      break;
    case ' ': // normally handled by video.js, but they don't use capture, see #12
      player.paused() ? player.play() : player.pause();
      break;
    case 'n':
      sendMessage(Message.QUEUE_NEXT, null, false);
      break;
    case 'p':
      sendMessage(Message.QUEUE_PREV, null, false);
      break;
    default:
      return;
  }
  e.stopPropagation();
  e.preventDefault();
};

const wheelHandler = async (e: WheelEvent) => {
  if (!options.volumeEnabled)
    return;
  const player = findAPlayer();
  if (!player)
    return;
  const target = e.target as HTMLElement;
  if (target.closest('.video-js') === null) // only consider sub-elements of player
    return;
  e.stopPropagation();
  e.preventDefault();

  // use polynomial as approximation for logarithmic scale (https://www.dr-lex.be/info-stuff/volumecontrols.html)
  // using x^2 now because x^4 is too aggressive for this range
  const pow = 2;
  const cur = options.volumeLog ? Math.pow(player.volume(), 1 / pow) : player.volume(); // root
  const v = cur - Math.sign(e.deltaY) * options.volumeChange;
  const n = options.volumeLog ? Math.pow(Math.max(v, 0), pow) : v; // if log, also take care that it's not negative (x^2 increases again below x=0)
  player.volume(e.deltaY * options.volumeChange > 0 && n < 0.01 ? 0 : n); // lower volume and below threshold -> mute

  (player.controlBar.getChild('VolumeText') as InstanceType<Comp<typeof VolumeText>>).show();
};

const clickHandler = (e: MouseEvent) => {
  if (!options.useFirstSubtitle)
    return;
  const player = findAPlayer();
  if (!player)
    return;
  const target = e.target as HTMLElement;
  if (target.closest('.vjs-subs-caps-button.vjs-control') === null) // clicked subtitles button
    return;
  const subs = arrFromLengthy(player.textTracks()).filter(e => e.kind === 'subtitles');
  if (subs.length !== 1)
    return;
  // only one subtitle track (not already active), use it and prevent popup
  e.stopPropagation();
  e.preventDefault();
  const { label } = subs[0];
  if (subs[0].mode === 'showing') {
    subs[0].mode = 'hidden';
    console.dev.log(`Set subtitle track '${label}' inactive`);
    window.localStorage.removeItem('player-v1-subtitle-track');
  } else {
    subs[0].mode = 'showing';
    console.dev.log(`Set subtitle track '${label}' active`);
    window.localStorage.setItem('player-v1-subtitle-track', JSON.stringify(label));
  }
};
