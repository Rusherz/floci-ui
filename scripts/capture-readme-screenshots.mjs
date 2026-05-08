import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const base = 'http://localhost:4173';
const outDir = path.resolve(__dirname, '../public/readme');

const shots = [
  { name: 'overview.png', route: '/', prep: null },
  { name: 'sqs.png', route: '/sqs', prep: null },
  { name: 'lambda.png', route: '/lambda', prep: null },
  { name: 'create-dialog.png', route: '/sqs', prep: 'openCreateQueueDialog' },
  { name: 'cloudwatch.png', route: '/cloudwatch', prep: null },
];

const sanitize = () => {
  const hasSensitive = (t) =>
    /\b\d{12}\b/.test(t) ||
    /arn:aws:[^\s<>"']+/.test(t) ||
    /request[-_ ]?id[: ]+[A-Za-z0-9-]+/i.test(t) ||
    /\/(aws|tmp|var|home)\/[A-Za-z0-9._/-]+/.test(t) ||
    /https?:\/\/[^\s<>"']+/i.test(t);

  const removableSelector = [
    '[role="row"]',
    '[role="listitem"]',
    '[role="treeitem"]',
    '[role="option"]',
    'tr',
    'li',
    'button',
    'a',
    'pre',
    'code',
    'p',
    'span',
    'div',
  ].join(',');

  const markForRemoval = new Set();

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const raw = node.nodeValue || '';
    if (!raw.trim()) continue;
    if (!hasSensitive(raw)) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const container = parent.closest(removableSelector) || parent;
    markForRemoval.add(container);
  }

  for (const el of document.querySelectorAll('input, textarea')) {
    const current = el.value || '';
    if (!current || !hasSensitive(current)) continue;
    const container = el.closest(removableSelector) || el;
    markForRemoval.add(container);
  }

  for (const el of markForRemoval) {
    if (!el || !el.isConnected) continue;
    el.remove();
  }
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  for (const shot of shots) {
    await page.goto(base + shot.route, { waitUntil: 'networkidle' });

    if (shot.prep === 'openCreateQueueDialog') {
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="Create queue"]');
        if (btn) btn.click();
      });
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        const input = document.querySelector('input[placeholder="my-queue"]');
        if (input) {
          input.value = 'demo-queue';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(150);
    }

    await page.evaluate(sanitize);
    await page.screenshot({ path: path.join(outDir, shot.name), fullPage: false, type: 'png' });
    console.log(`captured ${shot.name}`);
  }

  await context.close();
  await browser.close();
})();
