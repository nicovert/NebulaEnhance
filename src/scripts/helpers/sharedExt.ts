import browser from 'webextension-polyfill';
import type { CreatorSettings } from '../content/nebula/creator-settings';
import { notification } from './shared';
import './shared/prototype';
export * from './shared';

export const getBrowserInstance = () => browser; // poly-filled
export const isChrome = () => (window as any).chrome !== undefined;

const { sync, local } = browser.storage;
export function getFromStorage<T extends { [key: string]: any; }>(key: T): Promise<T>;
export function getFromStorage<T>(key?: string | string[] | null): Promise<T>;
export function getFromStorage<T>(key?: string | string[] | { [key: string]: any; } | null) {
  return (sync || local).get(key) as Promise<T>;
}
export function setToStorage(key: { [key: string]: any; }) {
  return (sync || local).set(key);
}

const hidingCreator = browser.i18n.getMessage('pageHidingCreator');
const showingCreator = browser.i18n.getMessage('pageShowingCreator');
const localeTimeMappings = browser.i18n.getMessage('miscTimeLocaleMappings');
const invalidElements = browser.i18n.getMessage('miscTimeInvalidElements');

export const toggleHideCreator = async (creator: string, hide: boolean) => {
  // let's hope we don't get interrupted here, could lose data, but no way to lock...
  const { hiddenCreators } = await getFromStorage({ hiddenCreators: [] as string[] });
  const idx = hiddenCreators.indexOf(creator);
  if (idx !== -1) hiddenCreators.splice(idx, 1);
  if (hide) hiddenCreators.push(creator);
  console.debug(hide ? 'Hiding creator' : 'Showing creator', creator,
    '\nHidden creators:', hiddenCreators.length);
  notification(hide ? hidingCreator : showingCreator);
  await setToStorage({ hiddenCreators });
  return hiddenCreators;
};

export const setCreatorHideAfter = async (creator: string, hideAfter: string) => {
  // let's hope we don't get interrupted here, could lose data, but no way to lock...
  const { creatorSettings } = await getFromStorage({ creatorSettings: {} as Record<string, CreatorSettings> });
  if (!(creator in creatorSettings)) creatorSettings[creator] = {};
  hideAfter = hideAfter.trim();
  creatorSettings[creator].hideAfter = hideAfter !== '' ? hideAfter : undefined;
  await setToStorage({ creatorSettings });
  return creatorSettings;
};

export const uploadIsBefore = (upload: number, seconds: number | string) => {
  if (typeof seconds === 'string') seconds = parseTimeString(seconds);
  const before = Date.now() - seconds * 1000;
  return upload < before;
};

const timeMapping: Record<string, number> = {
  w: 7 * 24 * 60 * 60,
  d: 24 * 60 * 60,
  h: 60 * 60,
  m: 60,
  s: 1,
};
export const parseTimeString = (str: string): number => {
  if (!str.match(/^(\s*\d+\s*[A-Za-z]*)*\s*$/)) throw new Error(invalidElements);
  const units = JSON.parse(localeTimeMappings);
  return Array.from(str.matchAll(/(\d+)\s*([A-Za-z]*)/g)).map(match => {
    const d = match[1];
    const u = match[2].toLowerCase() || 's';
    const unit = u in units ? units[u] : u;
    if (!(unit in timeMapping)) throw new Error(browser.i18n.getMessage('miscTimeInvalidUnit', unit));
    return (+d) * timeMapping[unit];
  }).reduce((acc, v) => acc + v, 0);
};
export const toTimeString = (seconds: number): string => {
  const { str, seconds: rest } = Object.keys(timeMapping)
    .sort((a, b) => timeMapping[a] - timeMapping[b]) // probably not necessary
    .reduceRight(({ str, seconds }, u) => {
      const maxUnit = Math.floor(seconds / timeMapping[u]);
      if (maxUnit > 0) return { str: `${str} ${maxUnit}${u}`, seconds: seconds - maxUnit * timeMapping[u] };
      return { str, seconds };
    }, { str: '', seconds });
  if (!str) return `${Math.floor(rest)}s`;
  console.assert(rest >= 0 && rest < 1, `Expected no rest, got ${rest}`);
  return str.trim();
};