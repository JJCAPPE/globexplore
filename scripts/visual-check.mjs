import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.BASE_URL || 'https://globexplore.vercel.app';
const expectedFeature = 'pole-lens-3d-v1';
const outDir = path.resolve('artifacts/visual-check');
await fs.mkdir(outDir, { recursive: true });

const report = {
  baseUrl,
  expectedFeature,
  checkedAt: new Date().toISOString(),
  status: 'pending',
  pages: [],
  errors: [],
};

async function waitForDeployment(browser) {
  let lastError = '';
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(30000);

  try {
    for (let attempt = 1; attempt <= 48; attempt += 1) {
      try {
        const response = await page.goto(baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        const featureVisible = await page
          .locator(`[data-feature="${expectedFeature}"]`)
          .isVisible({ timeout: 5000 })
          .catch(() => false);

        if (response?.ok() && featureVisible) return response.status();
        lastError = response?.ok()
          ? `HTTP ${response.status()}, rendered feature marker not present`
          : `HTTP ${response?.status() ?? 'no response'}`;
      } catch (error) {
        lastError = String(error);
      }
      await page.waitForTimeout(5000);
    }
  } finally {
    await context.close();
  }

  throw new Error(`Production URL never rendered ${expectedFeature}: ${lastError}`);
}

function edges(box) {
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
  };
}

function overlap(a, b) {
  const first = edges(a);
  const second = edges(b);
  return !(
    first.right <= second.left ||
    second.right <= first.left ||
    first.bottom <= second.top ||
    second.bottom <= first.top
  );
}

async function forceClick(locator) {
  const visible = await locator.isVisible({ timeout: 2500 }).catch(() => false);
  if (!visible) return false;
  await locator.click({ force: true, timeout: 5000 });
  return true;
}

async function setRange(locator, value) {
  await locator.evaluate((element, nextValue) => {
    const input = element;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
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
    await page.locator(`[data-feature="${expectedFeature}"]`).waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('canvas').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1400);

    await page.screenshot({ path: path.join(outDir, `${spec.name}-default.png`), fullPage: false });

    const text = await page.locator('body').innerText();
    const primary = (await page.locator('.metricPrimary strong').first().innerText()).trim();
    const canvasBox = await page.locator('canvas').boundingBox();
    const metricsBox = await page.locator('.metrics').boundingBox();
    const controlsBox = await page.locator('.controlDock').boundingBox();
    const poleLensBox = await page.locator('.poleLensPanel').boundingBox().catch(() => null);
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
      ['3d-pole-lens', poleLensBox],
      ['2d-axis-lens', lensBox],
    ].filter((entry) => entry[1]);
    const outside = criticalBoxes
      .filter(([, box]) => {
        const bounds = edges(box);
        return (
          bounds.left < -1 ||
          bounds.top < -1 ||
          bounds.right > viewport.width + 1 ||
          bounds.bottom > viewport.height + 1
        );
      })
      .map(([name]) => name);

    const overlaps = [];
    if (metricsBox && controlsBox && overlap(metricsBox, controlsBox)) overlaps.push('metrics-controls');
    if (poleLensBox && controlsBox && overlap(poleLensBox, controlsBox)) overlaps.push('3d-pole-lens-controls');
    if (poleLensBox && metricsBox && overlap(poleLensBox, metricsBox)) overlaps.push('3d-pole-lens-metrics');
    if (lensBox && controlsBox && overlap(lensBox, controlsBox)) overlaps.push('2d-axis-lens-controls');
    if (lensBox && metricsBox && overlap(lensBox, metricsBox)) overlaps.push('2d-axis-lens-metrics');

    console.log(`[visual-check] ${spec.name}: checking 3D pole lens`);
    const poleLensPanel = page.locator('.poleLensPanel');
    if (!(await poleLensPanel.isVisible().catch(() => false))) {
      await forceClick(page.locator('.poleLensTrigger'));
      await page.waitForTimeout(350);
    }

    if (await poleLensPanel.isVisible().catch(() => false)) {
      const beforeMetric = (await page.locator('.metricPrimary strong').first().innerText()).trim();
      const beforeMultiplier = await poleLensPanel.getAttribute('data-visual-multiplier');
      await setRange(page.locator('input[aria-label="3D pole magnification"]'), 12);
      await page.waitForTimeout(400);
      const afterMetric = (await page.locator('.metricPrimary strong').first().innerText()).trim();
      const afterMultiplier = await poleLensPanel.getAttribute('data-visual-multiplier');
      const displayAngle = Number(await poleLensPanel.getAttribute('data-display-angle'));

      if (beforeMetric !== afterMetric) {
        report.errors.push(`${spec.name}: physical metric changed under 3D magnification (${beforeMetric} → ${afterMetric})`);
      }
      if (beforeMultiplier === afterMultiplier) {
        report.errors.push(`${spec.name}: 3D magnification slider did not change the rendered scale (${beforeMultiplier})`);
      }
      if (!Number.isFinite(displayAngle) || displayAngle <= 0.1 || displayAngle > 24.001) {
        report.errors.push(`${spec.name}: invalid 3D rendered pole angle (${displayAngle})`);
      }

      await forceClick(page.locator('.poleCameraModes button').filter({ hasText: /North focus/i }));
      await page.waitForTimeout(spec.reducedMotion ? 150 : 950);
      await page.screenshot({ path: path.join(outDir, `${spec.name}-3d-pole-lens.png`), fullPage: false });
      await forceClick(page.locator('.poleLensHead button'));
      await page.waitForTimeout(280);
    } else {
      report.errors.push(`${spec.name}: 3D pole lens could not be opened`);
    }

    console.log(`[visual-check] ${spec.name}: checking 2D axis lens`);
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
      if (before !== after) report.errors.push(`${spec.name}: physical metric changed when 2D magnification changed (${before} → ${after})`);
      await forceClick(page.locator('.lensHead button'));
      await page.waitForTimeout(250);
    } else {
      report.errors.push(`${spec.name}: 2D axis lens could not be opened`);
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

    const requiredText = ['GLOBEXPLORE', 'FIGURE POLE SHIFT', '3D pole lens', '2D axis lens'];
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
      poleLens: poleLensBox,
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
  browser = await chromium.launch({ headless: true });
  report.httpStatus = await waitForDeployment(browser);
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
