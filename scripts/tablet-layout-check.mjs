import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.env.BASE_URL || 'https://globexplore.vercel.app'
const outDir = path.resolve('artifacts/visual-check')
await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1024, height: 768 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
})
const page = await context.newPage()
page.setDefaultTimeout(20000)

const errors = []
try {
  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
  if (!response?.ok()) errors.push(`navigation returned ${response?.status()}`)

  const lens = page.locator('.poleLensPanel')
  await lens.waitFor({ state: 'visible' })
  await page.locator('canvas').waitFor({ state: 'visible' })
  await page.waitForTimeout(1200)

  const active3d = await page.locator('.poleLensTrigger.active').isVisible().catch(() => false)
  if (!active3d) errors.push('3D pole lens is not active by default')

  const lensBox = await lens.boundingBox()
  const controlsBox = await page.locator('.controlDock').boundingBox()
  const metricsBox = await page.locator('.metrics').boundingBox()
  const scenarioBox = await page.locator('.scenarioRail').boundingBox().catch(() => null)

  if (!lensBox) errors.push('3D pole lens has no layout box')
  if (lensBox && lensBox.x + lensBox.width > 260) {
    errors.push(`3D pole lens leaves the tablet UI gutter: right edge ${Math.round(lensBox.x + lensBox.width)}px`)
  }

  const overlaps = (a, b) => a && b && !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )

  if (overlaps(lensBox, controlsBox)) errors.push('3D pole lens overlaps bottom controls')
  if (overlaps(lensBox, metricsBox)) errors.push('3D pole lens overlaps metrics')
  if (overlaps(lensBox, scenarioBox)) errors.push('3D pole lens overlaps scenario menu')

  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  if (size.width > 1025 || size.height > 769) {
    errors.push(`document overflow ${size.width}×${size.height}`)
  }

  await page.screenshot({
    path: path.join(outDir, 'ipad-1024x768-default-pole-lens.png'),
    fullPage: false,
  })

  console.log(JSON.stringify({
    status: errors.length ? 'failed' : 'passed',
    viewport: '1024x768',
    default3d: active3d,
    lensBox,
    scenarioBox,
    metricsBox,
    controlsBox,
    errors,
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}

if (errors.length) process.exitCode = 1
