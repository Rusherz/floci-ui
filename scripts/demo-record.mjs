import { chromium, request } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173';
const ACCOUNT_ID = process.env.NEXT_PUBLIC_FLOCI_SQS_ACCOUNT_ID || '000000000000';
const OUTPUT_DIR = path.resolve(__dirname, '../artifacts/demo');
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');

const DEFAULT_WAIT_MS = Number(process.env.DEMO_WAIT_MS || '1400');
const LONG_WAIT_MS = Number(process.env.DEMO_LONG_WAIT_MS || '2200');

function uniqueName(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function wait(page, ms = DEFAULT_WAIT_MS) {
  await page.waitForTimeout(ms);
  await hideDevOverlays(page);
  await sanitizeVisibleUi(page);
}

async function hideDevOverlays(page) {
  await page.evaluate(() => {
    const styleId = '__demo_hide_dev_overlays__';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* Next.js dev indicator / toast / error overlays */
        nextjs-portal,
        [data-nextjs-toast],
        [data-nextjs-dialog],
        [data-next-badge-root],
        [data-nextjs-dev-tools-button],
        #__next-build-watcher,
        #nextjs__container,
        #nextjs-toast {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  });
}

async function showCaption(page, text) {
  await page.evaluate((captionText) => {
    const id = '__demo_caption_overlay__';
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const node = document.createElement('div');
    node.id = id;
    node.textContent = captionText;
    node.style.position = 'fixed';
    node.style.left = '50%';
    node.style.bottom = '28px';
    node.style.transform = 'translateX(-50%)';
    node.style.maxWidth = '75vw';
    node.style.padding = '10px 16px';
    node.style.borderRadius = '10px';
    node.style.background = 'rgba(15, 23, 42, 0.88)';
    node.style.color = '#f8fafc';
    node.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
    node.style.fontSize = '20px';
    node.style.fontWeight = '600';
    node.style.letterSpacing = '0.01em';
    node.style.zIndex = '2147483647';
    node.style.pointerEvents = 'none';
    document.body.appendChild(node);
  }, text);
}

async function clearCaption(page) {
  await page.evaluate(() => {
    const id = '__demo_caption_overlay__';
    const existing = document.getElementById(id);
    if (existing) existing.remove();
  });
}

async function caption(page, text, ms = 1800) {
  await showCaption(page, text);
  await wait(page, ms);
}

async function actionCaption(page, text, leadMs = 250) {
  await showCaption(page, text);
  await wait(page, leadMs);
}

async function pageIntro(page, route, heading, explanation) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: heading }).first().waitFor({ state: 'visible' });
  await sanitizeVisibleUi(page);
  await caption(page, `${heading}: ${explanation}`, 2200);
  await wait(page, 500);
}

async function createFromDialog(page, openLabel, name, confirmLabel, placeholder, stepCaption) {
  await page.getByRole('button', { name: openLabel }).click();
  await wait(page, 250);
  if (stepCaption) {
    await showCaption(page, stepCaption);
  }
  await wait(page, 700);
  await page.getByPlaceholder(placeholder).fill(name);
  await wait(page, 1100);
  await page.getByRole('button', { name: confirmLabel }).last().click();
  await wait(page, LONG_WAIT_MS + 700);
}

async function expectListContainsName(page, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('button', { name: new RegExp(escaped) }).first().waitFor({ state: 'visible' });
  await wait(page);
}

async function sqsAction(api, action, params = {}) {
  const body = new URLSearchParams({ Action: action, Version: '2012-11-05', ...params }).toString();
  const response = await api.post('/floci', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/xml,text/xml,*/*' },
    data: body,
  });
  return response.text();
}

function extractAll(text, tag) {
  const pattern = new RegExp(`<${tag}>(.*?)</${tag}>`, 'g');
  const out = [];
  let match = pattern.exec(text);
  while (match) {
    out.push(match[1]);
    match = pattern.exec(text);
  }
  return out;
}

async function sanitizeVisibleUi(page) {
  await page.evaluate(() => {
    const hasSensitive = (input) =>
      /\b\d{12}\b/.test(input) ||
      /arn:aws:[^\s<>"']+/.test(input) ||
      /request[-_ ]?id[: ]+[A-Za-z0-9-]+/i.test(input) ||
      /\/(aws|tmp|var|home)\/[A-Za-z0-9._/-]+/.test(input) ||
      /https?:\/\/[^\s<>"']+/i.test(input);

    const removableSelector = [
      '[role=\"row\"]',
      '[role=\"listitem\"]',
      '[role=\"treeitem\"]',
      '[role=\"option\"]',
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

    const markForHide = new Set();

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const raw = node.nodeValue || '';
      if (!raw.trim()) continue;
      if (!hasSensitive(raw)) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const container = parent.closest(removableSelector) || parent;
      markForHide.add(container);
    }

    for (const el of document.querySelectorAll('input, textarea')) {
      const current = el.value || '';
      if (!current || !hasSensitive(current)) continue;
      const container = el.closest(removableSelector) || el;
      markForHide.add(container);
    }

    for (const el of markForHide) {
      if (!el || !el.isConnected) continue;
      el.setAttribute('data-demo-redacted', '1');
      el.style.display = 'none';
    }
  });
}

async function runDemo(page, api) {
  await pageIntro(page, '/', 'Service Overview', 'Unified local AWS-style operations dashboard');
  const queue = uniqueName('demo-queue');
  await pageIntro(page, '/sqs', 'SQS', 'Queue management with message-level operations');
  await createFromDialog(page, 'Create Queue', queue, 'Create Queue', 'my-queue', 'Creating a queue');
  await expectListContainsName(page, queue);
  await actionCaption(page, 'Queue created. Sending and loading a message.');
  const queueUrl = `http://localhost:4566/${ACCOUNT_ID}/${queue}`;
  const sendResult = await sqsAction(api, 'SendMessage', {
    QueueUrl: queueUrl,
    MessageBody: 'playwright demo message',
  });
  const messageId = extractAll(sendResult, 'MessageId')[0] || '';
  await page.getByRole('button', { name: queue }).first().click();
  await page.getByRole('button', { name: /refresh/i }).click();
  if (messageId) {
    await page.getByRole('button', { name: messageId }).first().waitFor({ state: 'visible' });
  }
  await wait(page, LONG_WAIT_MS + 900);

  const bucket = uniqueName('demo-bucket');
  await pageIntro(page, '/s3', 'S3', 'Bucket and object workflows');
  await createFromDialog(page, 'Create Bucket', bucket, 'Create Bucket', 'my-bucket', 'Creating a bucket');
  await expectListContainsName(page, bucket);
  await wait(page, LONG_WAIT_MS);

  const topic = uniqueName('demo-topic');
  await pageIntro(page, '/sns', 'SNS', 'Topic publish workflows');
  await createFromDialog(page, 'Create Topic', topic, 'Create Topic', 'my-topic', 'Creating a topic');
  await actionCaption(page, 'Publishing a message');
  await page.getByPlaceholder('Message payload').fill('playwright demo publish message');
  await page.getByRole('button', { name: 'Publish' }).click();
  await wait(page, LONG_WAIT_MS + 500);

  const table = uniqueName('demo-table');
  await pageIntro(page, '/dynamodb', 'DynamoDB', 'Table creation and item scanning');
  await actionCaption(page, 'Creating table');
  await page.getByRole('button', { name: 'Create Table' }).click();
  await wait(page, 700);
  await page.getByPlaceholder('my-table').fill(table);
  await wait(page, 1000);
  await page.getByRole('button', { name: 'Create Table' }).last().click();
  await wait(page, LONG_WAIT_MS);
  await actionCaption(page, 'Running scan');
  await page.getByRole('button', { name: 'Scan' }).click();
  await wait(page, LONG_WAIT_MS);

  const functionName = uniqueName('demo-fn');
  await pageIntro(page, '/lambda', 'Lambda', 'Function creation, invoke output, and logs');
  await actionCaption(page, 'Creating function');
  await page.getByRole('button', { name: 'Create Function' }).click();
  await wait(page, 700);
  await page.getByPlaceholder('pong').fill(functionName);
  await wait(page, 1000);
  await page.getByRole('button', { name: 'Create Function' }).last().click();
  await expectListContainsName(page, functionName);
  await page.getByRole('button', { name: functionName }).first().click();
  await actionCaption(page, 'Invoking function');
  await page.getByRole('button', { name: 'Invoke' }).click({ force: true });
  await wait(page, LONG_WAIT_MS);

  const bus = uniqueName('demo-bus');
  const rule = uniqueName('demo-rule');
  await pageIntro(page, '/eventbridge', 'EventBridge', 'Event buses, schedule rules, and event injection');
  await actionCaption(page, 'Creating bus');
  await page.getByRole('button', { name: 'Create eventbridge resource' }).click();
  await page.getByRole('button', { name: /^Bus$/ }).click();
  await page.getByPlaceholder('custom-bus').fill(bus);
  await page.getByRole('button', { name: 'Create Bus' }).last().click();
  await wait(page, LONG_WAIT_MS);
  await actionCaption(page, 'Creating schedule rule');
  await page.getByRole('button', { name: 'Create eventbridge resource' }).click();
  await page.getByRole('button', { name: /^Rule$/ }).click();
  await page.getByPlaceholder('my-rule').fill(rule);
  await page.getByRole('button', { name: 'Schedule' }).click();
  await page.getByPlaceholder('rate(5 minutes)').fill('rate(15 minutes)');
  await page.getByRole('button', { name: 'Create Rule' }).last().click();
  await wait(page, LONG_WAIT_MS);
  await actionCaption(page, 'Sending test event');
  await page.getByRole('button', { name: 'Send Event' }).click();
  await wait(page, LONG_WAIT_MS);

  const machine = uniqueName('demo-sm');
  await pageIntro(page, '/step-functions', 'Step Functions', 'State machine create and execution start');
  await createFromDialog(page, 'Create State Machine', machine, 'Create State Machine', 'my-state-machine', 'Creating state machine');
  await actionCaption(page, 'Starting execution');
  await page.getByRole('button', { name: 'Start Execution' }).click();
  await wait(page, LONG_WAIT_MS);

  const paramName = `/demo/${uniqueName('param')}`;
  await pageIntro(page, '/ssm', 'SSM Parameter Store', 'Parameter creation and in-place updates');
  await actionCaption(page, 'Creating parameter');
  await page.getByRole('button', { name: 'Create parameter' }).click();
  await wait(page, 700);
  await page.getByPlaceholder('Parameter name (e.g. /app/config)').fill(paramName);
  await wait(page, 1000);
  await page.getByRole('button', { name: 'Create Parameter' }).last().click();
  await wait(page, LONG_WAIT_MS);
  await actionCaption(page, 'Updating parameter value');
  await page.getByRole('button', { name: `Edit parameter ${paramName}` }).click();
  const updateDialog = page.getByRole('dialog');
  await updateDialog.locator('textarea').first().fill('{"enabled": false}');
  await updateDialog.getByRole('button', { name: 'Update Parameter' }).click();
  await wait(page, LONG_WAIT_MS);

  const secretName = uniqueName('demo-secret');
  await pageIntro(page, '/secrets-manager', 'Secrets Manager', 'Secret creation and value rotation');
  await actionCaption(page, 'Creating secret');
  const secretValuePanel = page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Secret Value' }) })
    .first();
  await secretValuePanel.getByRole('textbox').first().fill('initial demo secret value');
  await page.getByRole('button', { name: 'Create Secret' }).click();
  await page.getByPlaceholder('my/secret').fill(secretName);
  await page.getByRole('button', { name: 'Create Secret' }).last().click();
  await wait(page, LONG_WAIT_MS);
  await actionCaption(page, 'Rotating secret value');
  await page.getByRole('button', { name: 'Put Secret Value' }).click();
  await wait(page, LONG_WAIT_MS);

  const group = `/aws/demo/${uniqueName('logs')}`;
  await pageIntro(page, '/cloudwatch', 'CloudWatch Logs', 'Log group creation, retention edit, and filter query');
  await createFromDialog(page, 'Create log group', group, 'Create Log Group', '/aws/lambda/my-function', 'Creating log group');
  const editRetentionButton = page.getByRole('button', { name: 'Edit retention' });
  if ((await editRetentionButton.count()) > 0) {
    await actionCaption(page, 'Updating retention policy');
    try {
      await editRetentionButton.first().click({ timeout: 5000 });
      const retentionInput = page.getByPlaceholder('e.g. 30 (leave blank for no retention)');
      await retentionInput.fill('7');
      await page.getByRole('button', { name: 'Update Retention' }).click();
      await wait(page, LONG_WAIT_MS);
    } catch {
      await wait(page, DEFAULT_WAIT_MS);
    }
  } else {
    await wait(page, DEFAULT_WAIT_MS);
  }
  const expandButton = page.getByRole('button', { name: 'Expand' });
  if ((await expandButton.count()) > 0) {
    await expandButton.first().click();
    await wait(page, 500);
  }
  const runFilterButton = page.getByRole('button', { name: 'Run Filter' });
  if ((await runFilterButton.count()) > 0) {
    await actionCaption(page, 'Running log filter');
    await runFilterButton.first().click();
    await wait(page, LONG_WAIT_MS);
  } else {
    await wait(page, DEFAULT_WAIT_MS);
  }
  await caption(page, 'Demo complete', 1800);
  await clearCaption(page);
}

(async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const api = await request.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const video = page.video();

  try {
    console.log(`Recording full-app demo at ${BASE_URL} (1920x1080)...`);
    await runDemo(page, api);
    await wait(page, 600);
    console.log('Demo walkthrough finished. Finalizing video file...');
  } finally {
    await page.close();
    await context.close();
    await api.dispose();
    await browser.close();
  }

  if (!video) {
    throw new Error('Playwright did not attach a video recorder to the page.');
  }

  const rawVideoPath = await video.path();
  const targetPath = path.join(OUTPUT_DIR, `floci-demo-raw-${TIMESTAMP}.webm`);
  await fs.copyFile(rawVideoPath, targetPath);

  console.log(`Raw demo video saved: ${targetPath}`);
  console.log('Next step: npm run demo:compress -- "' + targetPath + '"');
})();
