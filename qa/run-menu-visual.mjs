#!/usr/bin/env node
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveBrowserExecutable } from './browser-resolver.mjs';
import { closeBrowserSafely, closeContextSafely, installHardProcessTimeout, withTimeout } from './browser-lifecycle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'qa.config.json'), 'utf8'));
const args = process.argv.slice(2);
const option = name => args.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const label = option('label') ?? 'current';
const stylesheet = option('stylesheet');
const preferredMenuTitle = option('menu-title');
const baseUrl = process.env.WORKFLOW_BASE_URL ?? config.baseUrl;
const artifactsDir = path.join(root, 'qa', 'artifacts', 'menu-visual');
const resultPath = path.join(artifactsDir, `${label}.json`);
fs.mkdirSync(artifactsDir, { recursive: true });

const resolution = resolveBrowserExecutable({ configuredPath: config.browserExecutable, playwrightChromium: chromium });
if (!resolution.executablePath) throw new Error(resolution.error);
const hardTimeout = installHardProcessTimeout({ timeoutMs: 3 * 60_000, label: 'Mega-Menu-Visual-QA' });
let browser;
try {
  browser = await withTimeout(() => chromium.launch({ executablePath: resolution.executablePath, headless: true }), 30_000, 'Browser-Start');
} catch (error) {
  hardTimeout.clear();
  throw error;
}

async function preparePage(viewport) {
  const context = await browser.newContext({ viewport, locale: 'de-DE', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
  process.stderr.write(`Mega-Menu-QA: ${viewport.width}px geladen\n`);
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  if (stylesheet) await page.addStyleTag({ path: path.resolve(root, stylesheet) });
  return { context, page };
}

async function desktopCheck() {
  const { context, page } = await preparePage(config.viewports.Desktop);
  try {
    const allTriggers = page.locator('header-menu .menu-list__link[aria-haspopup="true"]:visible');
    const titles = (await allTriggers.allTextContents()).map(title => title.trim()).filter(Boolean);
    if (stylesheet) await page.evaluate(() => {
      document.querySelectorAll('header-menu .menu-list__list-item').forEach(item => {
        const title = item.querySelector(':scope > .menu-list__link .menu-list__link-title')?.textContent?.trim();
        const grid = item.querySelector(':scope > .menu-list__submenu .mega-menu__grid');
        if (!title || !grid || grid.querySelector('.mega-menu__intro')) return;
        const intro = document.createElement('div');
        intro.className = 'mega-menu__intro';
        const heading = document.createElement('p');
        heading.className = 'mega-menu__intro-title';
        heading.textContent = title;
        intro.append(heading);
        grid.prepend(intro);
      });
    });
    let trigger = preferredMenuTitle ? allTriggers.filter({ hasText: preferredMenuTitle }).first() : allTriggers.first();
    if (!(await trigger.count())) trigger = allTriggers.first();
    if (!(await trigger.count())) throw new Error('Kein sichtbarer Mega-Menu-Trigger gefunden');
    await trigger.hover();
    await page.waitForTimeout(700);
    const active = page.locator('header-menu .menu-list__link[aria-expanded="true"]:visible').first();
    const activeTitle = (await active.innerText()).trim();
    const submenu = active.locator('xpath=following-sibling::*[contains(@class,"menu-list__submenu")]');
    await submenu.waitFor({ state: 'visible', timeout: 5000 });
    const metrics = await submenu.evaluate(element => {
      const headings = [...element.querySelectorAll('.mega-menu__column > div > .mega-menu__link')];
      const columns = [...element.querySelectorAll('.mega-menu__column')];
      const overlaps = [];
      for (let leftIndex = 0; leftIndex < columns.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < columns.length; rightIndex += 1) {
        const left = columns[leftIndex].getBoundingClientRect();
        const right = columns[rightIndex].getBoundingClientRect();
        if (left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top) overlaps.push([leftIndex, rightIndex]);
      }
      const firstHeadingStyle = headings[0] ? getComputedStyle(headings[0]) : null;
      const firstGroup = headings[0]?.parentElement;
      const firstGroupStyle = firstGroup ? getComputedStyle(firstGroup) : null;
      return {
        headings: headings.map(heading => heading.textContent?.trim()).filter(Boolean),
        columnCount: columns.length,
        overlaps,
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        headingWeight: firstHeadingStyle?.fontWeight ?? null,
        headingBorder: firstHeadingStyle?.borderBottomWidth ?? null,
        groupBorder: firstGroupStyle?.borderInlineStartWidth ?? null,
        groupBackground: firstGroupStyle?.backgroundColor ?? null,
        firstColumnGrid: columns[0] ? getComputedStyle(columns[0]).gridTemplateColumns : null,
      };
    });
    await page.screenshot({ path: path.join(artifactsDir, `${label}-desktop.png`), fullPage: false });
    return { triggerTitles: titles, activeTitle, ...metrics };
  } finally {
    await closeContextSafely(context);
  }
}

async function mobileCheck() {
  const { context, page } = await preparePage(config.viewports.Mobile);
  try {
    const menuButton = page.locator('#Details-menu-drawer-container > summary').first();
    await menuButton.click();
    await page.locator('#Details-menu-drawer-container[open]').waitFor({ state: 'attached', timeout: 5000 });
    await page.waitForTimeout(400);
    const metrics = await page.locator('.menu-drawer').first().evaluate(element => ({
      visible: getComputedStyle(element).visibility !== 'hidden',
      horizontalOverflow: element.scrollWidth - element.clientWidth,
      topLevelItems: element.querySelectorAll('.menu-drawer__menu-item--mainlist').length,
    }));
    await page.screenshot({ path: path.join(artifactsDir, `${label}-mobile.png`), fullPage: false });
    return metrics;
  } finally {
    await closeContextSafely(context);
  }
}

try {
  const result = { label, baseUrl, stylesheet: stylesheet ?? null, desktop: await desktopCheck(), mobile: await mobileCheck() };
  const problems = [];
  if (result.desktop.horizontalOverflow > config.overflowTolerancePx) problems.push('Desktop Mega Menu hat horizontalen Overflow');
  if (result.desktop.overlaps.length) problems.push('Desktop Mega-Menu-Spalten überlappen');
  if (!result.desktop.headings.length) problems.push('Keine Gruppenüberschriften erkannt');
  if (!result.mobile.visible || result.mobile.horizontalOverflow > config.overflowTolerancePx) problems.push('Mobiles Menü ist nicht sauber sichtbar');
  result.status = problems.length ? 'FAIL' : 'PASS';
  result.problems = problems;
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = problems.length ? 1 : 0;
} finally {
  await closeBrowserSafely(browser);
  hardTimeout.clear();
}
