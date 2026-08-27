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

async function inspectViewport(browser, spec) {
  const context = await browser.newContext({
    viewport: spec.viewport,
    deviceScaleFactor: spec.scale,
    isMobile: spec.mobile,
    hasTouch: spec.mobile,
    colorScheme: 'dark',
    reducedMotion: spec.reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const response = await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('.appShell').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1800);

  const baseShot = path.join(outDir, `${spec.name}-default.png`);
  await page.screenshot({ path: baseShot, fullPage: false });

  const text = await page.locator('body').innerText();
  const primary = (await page.locator('.metricPrimary strong').first().innerText()).trim();
  const canvasBox = await page.locator('canvas').boundingBox();
  const metricsBox = await page.locator('.metrics').boundingBox();
  const controlsBox = await page.locator('.controlDock').boundingBox();
  const lensBox = await page.locator('.lensPanel').boundingBox().catch(() => null);
  const viewport = page.viewportSize();

  const criticalBoxes = [
    ['canvas', canvasBox],
    ['metrics', metricsBox],
    ['controls', controlsBox],
    ['lens', lensBox],
  ].filter((entry) => entry[1]);
  const outside = criticalBoxes.filter(([, box]) => box.left < -1 || box.top < -1 || box.right > viewport.width + 1 || box.bottom > viewport.height + 1).map(([name]) => name);

  const overlaps = [];
  if (metricsBox && controlsBox && overlap(metricsBox, controlsBox)) overlaps.push('metrics-controls');
  if (lensBox && controlsBox && overlap(lensBox, controlsBox)) overlaps.push('lens-controls');
  if (lensBox && metricsBox && overlap(lensBox, metricsBox)) overlaps.push('lens-metrics');

  const lensTrigger = page.locator('.lensTrigger');
  if (await lensTrigger.isVisible()) {
    await lensTrigger.click();
    await page.waitForTimeout(400);
    if (!(await page.locator('.lensPanel').isVisible().catch(() => false))) {
      await lensTrigger.click();
      await page.waitForTimeout(500);
    }
  }

  if (await page.locator('.lensPanel').isVisible().catch(() => false)) {
    const lensShot = path.join(outDir, `${spec.name}-axis-lens.png`);
    await page.screenshot({ path: lensShot, fullPage: false });
    const lensModes = await page.locator('.lensModes button').allInnerTexts();
    if (lensModes.length) {
      const before = (await page.locator('.metricPrimary strong').first().innerText()).trim();
      for (const label of lensModes.slice(0, 3)) {
        await page.locator('.lensModes button', { hasText: label }).click();
        await page.waitForTimeout(180);
      }
      const after = (await page.locator('.metricPrimary strong').first().innerText()).trim();
      if (before !== after) report.errors.push(`${spec.name}: physical metric changed when lens magnification changed (${before} → ${after})`);
    }
  }

  const moveButton = page.locator('.modeTabs button', { hasText: /Move mass/i });
  if (await moveButton.isVisible().catch(() => false)) {
    await moveButton.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(outDir, `${spec.name}-move-mass.png`), fullPage: false });
  }

  const infoButton = page.locator('button[title="About the model"]');
  if (await infoButton.isVisible().catch(() => false)) {
    await infoButton.click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(outDir, `${spec.name}-model-sheet.png`), fullPage: false });
    await page.keyboard.press('Escape').catch(() => {});
  }

  const requiredText = ['GLOBEXPLORE', 'FIGURE POLE SHIFT', 'Axis lens'];
  const missingText = requiredText.filter((value) => !text.includes(value));
  if (!response?.ok()) report.errors.push(`${spec.name}: navigation returned ${response?.status()}`);
  if (!primary || primary === '0 m') report.errors.push(`${spec.name}: primary pole shift is empty or collapsed to zero (${primary || 'empty'})`);
  if (outside.length) report.errors.push(`${spec.name}: critical elements outside viewport: ${outside.join(', ')}`);
  if (overlaps.length) report.errors.push(`${spec.name}: critical layout overlap: ${overlaps.join(', ')}`);
  if (missingText.length) report.errors.push(`${spec.name}: missing expected content: ${missingText.join(', ')}`);
  if (consoleErrors.length) report.errors.push(`${spec.name}: console errors: ${consoleErrors.join(' | ')}`);
  if (pageErrors.length) report.errors.push(`${spec.name}: page errors: ${pageErrors.join(' | ')}`);

  report.pages.push({
    name: spec.name,
    viewport: spec.viewport,
    primary,
    outside,
    overlaps,
    consoleErrors,
    pageErrors,
    missingText,
    canvas: canvasBox,
    metrics: metricsBox,
    controls: controlsBox,
    lens: lensBox,
  });

  await context.close();
}

try {
  report.httpStatus = await waitForDeployment();
  const browser = await chromium.launch({ headless: true });
  const specs = [
    { name: 'desktop-1440x900', viewport: { width: 1440, height: 900 }, scale: 1, mobile: false },
    { name: 'iphone-393x852', viewport: { width: 393, height: 852 }, scale: 2, mobile: true },
    { name: 'mobile-short-375x667', viewport: { width: 375, height: 667 }, scale: 2, mobile: true },
    { name: 'desktop-reduced-motion', viewport: { width: 1280, height: 800 }, scale: 1, mobile: false, reducedMotion: true },
  ];
  for (const spec of specs) await inspectViewport(browser, spec);
  await browser.close();
  report.status = report.errors.length ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed';
  report.errors.push(String(error?.stack || error));
}

await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
