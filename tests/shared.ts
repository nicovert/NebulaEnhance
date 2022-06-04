import type { Browser } from 'puppeteer';

export const videoSelector = 'a[href^="/videos/"][aria-hidden]';
export const qbuttSelector = '.enhancer-queueButton';
export const queueSelector = '.enhancer-queue';

let actualVideoSelector: string = null;

export const getNthVideo = async (num: number) => {
  if (actualVideoSelector === null) actualVideoSelector = await page.$eval(videoSelector, el => el.parentElement.className);
  return `.${actualVideoSelector}:nth-child(${num})`;
};
export const addToQueue = async (num: number, offset = 0) => {
  for (let index = 0; index < num; index++) {
    await page.hover(`${await getNthVideo(index + 1 + offset)} img`);
    await page.click(`${await getNthVideo(index + 1 + offset)} ${qbuttSelector}`);
  }
};
export const expectQueueLength = () => expect(page.evaluate(sel => document.querySelector(`${sel} .elements`).children.length, queueSelector)).resolves;
export const titles = () => page.evaluate(sel => Array.from(document.querySelectorAll(`${sel} .element .title`)).map(n => n.textContent), queueSelector);

const formSelector = '#NebulaApp > :nth-child(2) > :nth-child(2) form';
let optionsURL: string;
const b = (browser as never as Browser);
declare const chrome: typeof browser;

export const login = async (force = false) => {
  console.log('Using base', __NEBULA_BASE__);

  await page.goto('chrome://settings');
  optionsURL = await page.evaluate(async () => (await chrome.management.getAll())[0].optionsUrl);
  await page.goto(`${__NEBULA_BASE__}/login`);
  await page.bringToFront();
  if (!force && await page.evaluate(() => document.cookie.indexOf('nebula-auth')) !== -1)
    return;

  await expect(page).toFillForm(formSelector, {
    email: __NEBULA_USER__,
    password: __NEBULA_PASS__,
  });
  await expect(page).toClick(`${formSelector} button`, { text: 'Sign in' });
  await page.waitForResponse('https://api.watchnebula.com/api/v1/authorization/'); // wait until logged in
  // await page.waitForSelector('[href="/settings/account"]');
  await page.waitForTimeout(1000);
};

export const maybeLogin = (cb: () => Promise<void>) => async () => {
  // Every so often, Nebula logs us out
  // in particular, it seems the combination of reloading the page and clearing localstorage does this
  // even though the cookie appears to still be there
  // happens most often on `ignores completed queue` and `adds proper controls`
  await page.bringToFront();
  await cb();
  if ((await page.$x('//button[contains(text(), "Sign Up")]')).length == 0)
    return;
  console.log('Had to login again...', expect.getState().currentTestName);
  await login(true);
  await cb();
};

export const setSettings = async (set: { [key: string]: string | boolean}) => {
  const pg = await b.newPage();
  await pg.goto(optionsURL);
  const form = await expect(pg).toMatchElement('form');
  for (const key in set) {
    if (typeof (set[key]) !== 'boolean')
      continue;
    // need to check booleans manually
    await form.$eval(`[name="${key}"]`, (el: HTMLInputElement, val: boolean) => el.checked = val, set[key]);
    delete set[key];
  }
  await expect(pg).toFillForm('form', set, { timeout: 1000 });
  await expect(pg).toClick('button[type="submit"]');
  await pg.close();
};

export const waitForPlayerInit = async () => {
  await page.waitForSelector('.video-js');
  await page.waitForFunction(() => window.videojs.players[Object.keys(window.videojs.players).find(k => window.videojs.players[k])]._enhancerInit);
};