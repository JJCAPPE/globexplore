import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.BASE_URL || 'https://globexplore.vercel.app';
const outDir = path.resolve('artifacts/visual-check');
await fs.mkdir(outDir, { recursive: true });

const report = {
  baseUrl,
  checkedAt: new Date().toISOString(),
  status: 'pending',
  pages: [],
  errors: [],
};

async function waitForDeployment() {
  let lastError = '';
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { redirect: 'follow' });
      if (response.ok) return response.status;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Production URL never became ready: ${lastError}`);
}

function overlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

async function forceClick(locator) {
  const visible = await locator.isVisible({ timeout: 2500 }).catch(() => false);
  if (!visible) return false;
  await locator.click({ force: true, timeout: 5000 });
  return true;
}

async function inspectViewport(browser, spec) {
  console.log(`[visual-check] ${spec.name}: opening production`);
  const context = await browser.newContext({
    viewport: spec.viewport,
    deviceScaleFactor: spec.scale,
    isMobile: spec.mobile,
    hasTouch: spec.mobile,
    colorScheme: 'dark',
    reducedMotion: spec.reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.setDefaultNavigationTimeout(45000);

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.appShell').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('canvas').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1400);

    await page.screenshot({ path: path.join(outDir, `${spec.name}-default.png`), fullPage: false });

    const text = await page.locator('body').innerText();
    const primary = (await page.locator('.metricPrimary strong').first().innerText()).trim();
    const canvasBox = await page.locator('canvas').boundingBox();
    const metricsBox = await page.locator('.metrics').boundingBox();
    const controlsBox = await page.locator('.controlDock').boundingBox();
    const lensBox = await page.locator('.lensPanel').boundingBox().catch(() => null);
    const viewport = page.viewportSize();
    const documentSize = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));

    const criticalBoxes = [
      ['canvas', canvasBox],
      ['metrics', metricsBox],
      ['controls', controlsBox],
      ['lens', lensBox],
    ].filter((entry) => entry[1]);
    const outside = criticalBoxes
      .filter(([, box]) => box.left < -1 || box.top < -1 || box.right > viewport.width + 1 || box.bottom > viewport.height + 1)
      .map(([name]) => name);

    const overlaps = [];
    if (metricsBox && controlsBox && overlap(metricsBox, controlsBox)) overlaps.push('metrics-controls');
    if (lensBox && controlsBox && overlap(lensBox, controlsBox)) overlaps.push('lens-controls');
    if (lensBox && metricsBox && overlap(lensBox, metricsBox)) overlaps.push('lens-metrics');

    console.log(`[visual-check] ${spec.name}: checking axis lens`);
    const lensPanel = page.locator('.lensPanel');
    if (!(await lensPanel.isVisible().catch(() => false))) {
      await forceClick(page.locator('.lensTrigger'));
      await page.waitForTimeout(300);
    }

    if (await lensPanel.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(outDir, `${spec.name}-axis-lens.png`), fullPage: false });
      const before = (await page.locator('.metricPrimary strong').first().innerText()).trim();
      const lensButtons = page.locator('.lensModes button');
      const count = await lensButtons.count();
      for (let index = 0; index < Math.min(count, 4); index += 1) {
        await lensButtons.nth(index).click({ force: true, timeout: 5000 });
        await page.waitForTimeout(120);
      }
      const after = (await page.locator('.metricPrimary strong').first().innerText()).trim();
      if (before !== after) report.errors.push(`${spec.name}: physical metric changed when lens magnification changed (${before} → ${after})`);
      await forceClick(page.locator('.lensHead button'));
      await page.waitForTimeout(250);
    } else {
      report.errors.push(`${spec.name}: axis lens could not be opened`);
    }

    console.log(`[visual-check] ${spec.name}: checking transfer interaction`);
    const moveButton = page.locator('.modeTabs button').filter({ hasText: /Move mass/i });
    if (await forceClick(moveButton)) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, `${spec.name}-move-mass.png`), fullPage: false });
    } else {
      report.errors.push(`${spec.name}: move-mass control is not available`);
    }

    console.log(`[visual-check] ${spec.name}: checking model sheet`);
    const infoButton = page.locator('button[title="About the model"]');
    if (await forceClick(infoButton)) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, `${spec.name}-model-sheet.png`), fullPage: false });
      await forceClick(page.locator('.infoSheet .close'));
    } else {
      report.errors.push(`${spec.name}: model information control is not available`);
    }

    const requiredText = ['GLOBEXPLORE', 'FIGURE POLE SHIFT', 'Axis lens'];
    const missingText = requiredText.filter((value) => !text.includes(value));
    if (!response?.ok()) report.errors.push(`${spec.name}: navigation returned ${response?.status()}`);
    if (!primary || primary === '0 m') report.errors.push(`${spec.name}: primary pole shift is empty or collapsed to zero (${primary || 'empty'})`);
    if (outside.length) report.errors.push(`${spec.name}: critical elements outside viewport: ${outside.join(', ')}`);
    if (overlaps.length) report.errors.push(`${spec.name}: critical layout overlap: ${overlaps.join(', ')}`);
    if (documentSize.width > viewport.width + 1 || documentSize.height > viewport.height + 1) {
      report.errors.push(`${spec.name}: document overflows viewport (${documentSize.width}×${documentSize.height} vs ${viewport.width}×${viewport.height})`);
    }
    if (missingText.length) report.errors.push(`${spec.name}: missing expected content: ${missingText.join(', ')}`);
    if (consoleErrors.length) report.errors.push(`${spec.name}: console errors: ${consoleErrors.join(' | ')}`);
    if (pageErrors.length) report.errors.push(`${spec.name}: page errors: ${pageErrors.join(' | ')}`);

    report.pages.push({
      name: spec.name,
      viewport: spec.viewport,
      primary,
      outside,
      overlaps,
      documentSize,
      consoleErrors,
      pageErrors,
      missingText,
      canvas: canvasBox,
      metrics: metricsBox,
      controls: controlsBox,
      lens: lensBox,
    });
    console.log(`[visual-check] ${spec.name}: complete`);
  } catch (error) {
    const message = `${spec.name}: ${String(error?.stack || error)}`;
    report.errors.push(message);
    await page.screenshot({ path: path.join(outDir, `${spec.name}-failure.png`), fullPage: false }).catch(() => {});
    console.error(message);
  } finally {
    await context.close();
  }
}

let browser;
try {
  report.httpStatus = await waitForDeployment();
  browser = await chromium.launch({ headless: true });
  const specs = [
    { name: 'desktop-1440x900', viewport: { width: 1440, height: 900 }, scale: 1, mobile: false },
    { name: 'iphone-393x852', viewport: { width: 393, height: 852 }, scale: 2, mobile: true },
    { name: 'mobile-short-375x667', viewport: { width: 375, height: 667 }, scale: 2, mobile: true },
    { name: 'desktop-reduced-motion', viewport: { width: 1280, height: 800 }, scale: 1, mobile: false, reducedMotion: true },
  ];
  for (const spec of specs) await inspectViewport(browser, spec);
  report.status = report.errors.length ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed';
  report.errors.push(String(error?.stack || error));
} finally {
  await browser?.close().catch(() => {});
}

await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
