import { purgeCache } from './background/ext';
import { BrowserMessage, getBrowserInstance, getFromStorage, notification, setToStorage } from './helpers/sharedExt';
import { load } from './options/form';
import { showLogs } from './options/logs';
import { showManageCreators } from './options/managecreators';
import { Settings, toData } from './options/settings';
import { standalone } from './options/standalone';

const cl = decodeURIComponent(window.location.hash.slice(1)).split(' ').filter(c => !!c);
if (cl.length)
  document.body.classList.add(...cl);

const els = Settings.get();
const purgeField = document.querySelector('#purgeCacheField');

// permissions for youtube comments
const { permissions } = getBrowserInstance();
els.youtube.addEventListener('change', async () => {
  const y = els.youtube;
  const perms: browser.permissions.Permissions = {
    origins: [
      '*://*.googleapis.com/*',
    ],
  };
  const success = await (y.checked ? permissions.request : permissions.remove)(perms);
  if (!success) y.checked = !y.checked; // revert
  if (y.checked && success) getBrowserInstance().runtime.sendMessage(BrowserMessage.LOAD_CREATORS);
});
permissions.onRemoved.addListener(p => p.origins?.length && (els.youtube.checked = false));

const aChange = () => {
  els.autoplayQueue.disabled = els.autoplay.checked;
};
els.autoplay.addEventListener('change', aChange);
const vChange = () => {
  const c = els.volumeEnabled.checked;
  els.volumeLog.disabled = !c;
  els.volumeChange.disabled = !c;
};
els.volumeEnabled.addEventListener('change', vChange);
const nChange = () => {
  els.ytOpenTab.disabled = !els.watchnebula.checked;
};
els.watchnebula.addEventListener('change', nChange);
const nTabChange = () => {
  els.ytMuteOnly.disabled = !els.ytOpenTab.checked;
};
els.ytOpenTab.addEventListener('change', nTabChange);
const vidChange = () => {
  els.purgetime.disabled = !els.youtube.checked && !els.watchnebula.checked;
  purgeField.classList.toggle('disabled', els.purgetime.disabled);
};
els.youtube.addEventListener('change', vidChange);
els.watchnebula.addEventListener('change', vidChange);
const hChange = () => {
  els.hideVideosPerc.disabled = !els.hideVideosEnabled.checked;
};
els.hideVideosEnabled.addEventListener('change', hChange);

const purged = getBrowserInstance().i18n.getMessage('optionsPurged');
document.querySelector('#purgeCacheNow').addEventListener('click', async () => {
  await purgeCache();
  notification(purged);
  await toData();
});
document.querySelector('#showChangelogsNow').addEventListener('click', () => showLogs(getBrowserInstance().runtime.getManifest().version));
document.querySelector('#manageHiddenCreators').addEventListener('click', showManageCreators);

// load initial values from storage
load(true)
  .then(aChange)
  .then(vChange)
  .then(nChange)
  .then(nTabChange)
  .then(hChange)
  .then(vidChange);

// changelog
(async () => {
  standalone(document.body.classList.contains('standalone'));

  const showChangelogs = document.body.classList.contains('show-changelogs');
  document.body.classList.remove('show-changelogs');
  window.location.hash = document.body.className;

  const { showChangelogs: show, lastVersion: version, theme } = await getFromStorage({ showChangelogs: true, lastVersion: '-1', theme: '' });

  if (theme === 'dark' || theme === 'light') document.querySelector('html').setAttribute('data-theme', theme);

  const actualVersion = getBrowserInstance().runtime.getManifest().version;
  const installed = version === '-1';
  console.debug(show, version, actualVersion, installed);
  // show changelog or install message
  if (installed || (show && version !== actualVersion) || showChangelogs)
    showLogs(actualVersion, installed);
  setToStorage({ lastVersion: actualVersion });

  getBrowserInstance().storage.onChanged.addListener(changes => {
    if ('theme' in changes && 'newValue' in changes['theme']) {
      const theme = changes['theme'].newValue;
      if (theme === 'dark' || theme === 'light') document.querySelector('html').setAttribute('data-theme', theme);
      else document.querySelector('html').removeAttribute('data-theme');
    }
  });
})();