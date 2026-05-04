import { expect, test, type APIRequestContext } from '@playwright/test';

test.skip(process.env.RUN_FLOCI_E2E !== '1', 'Set RUN_FLOCI_E2E=1 to run Floci-backed create workflow tests.');

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const accountId = process.env.NEXT_PUBLIC_FLOCI_SQS_ACCOUNT_ID || '000000000000';

type CreatedResources = {
  buckets: string[];
  queues: string[];
  topics: string[];
  tables: string[];
  eventBuses: string[];
  eventRules: Array<{ name: string; bus: string }>;
  stateMachines: string[];
  ssmParameters: string[];
  secrets: string[];
  logGroups: string[];
};

const createdByTestId = new Map<string, CreatedResources>();

function createTracker(): CreatedResources {
  return {
    buckets: [],
    queues: [],
    topics: [],
    tables: [],
    eventBuses: [],
    eventRules: [],
    stateMachines: [],
    ssmParameters: [],
    secrets: [],
    logGroups: [],
  };
}

function extractAll(text: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}>(.*?)</${tag}>`, 'g');
  const out: string[] = [];
  let match = pattern.exec(text);
  while (match) {
    out.push(match[1]);
    match = pattern.exec(text);
  }
  return out;
}

async function sqsAction(request: APIRequestContext, action: string, params: Record<string, string> = {}): Promise<string> {
  const body = new URLSearchParams({ Action: action, Version: '2012-11-05', ...params }).toString();
  const response = await request.post('/floci', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/xml,text/xml,*/*' },
    data: body,
  });
  return response.text();
}

async function snsAction(request: APIRequestContext, action: string, params: Record<string, string> = {}): Promise<string> {
  const body = new URLSearchParams({ Action: action, Version: '2010-03-31', ...params }).toString();
  const response = await request.post('/floci', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/xml,text/xml,*/*' },
    data: body,
  });
  return response.text();
}

async function awsJsonAction(request: APIRequestContext, target: string, payload: Record<string, unknown>, jsonVersion: '1.0' | '1.1' = '1.1'): Promise<void> {
  await request.post('/floci', {
    headers: {
      'Content-Type': `application/x-amz-json-${jsonVersion}`,
      'X-Amz-Target': target,
    },
    data: JSON.stringify(payload),
  });
}

async function cleanupTrackedResources(request: APIRequestContext, tracker: CreatedResources): Promise<void> {
  for (const group of tracker.logGroups) {
    await awsJsonAction(request, 'Logs_20140328.DeleteLogGroup', { logGroupName: group }).catch(() => undefined);
  }
  for (const secretId of tracker.secrets) {
    await awsJsonAction(request, 'secretsmanager.DeleteSecret', { SecretId: secretId, ForceDeleteWithoutRecovery: true }).catch(() => undefined);
  }
  for (const name of tracker.ssmParameters) {
    await awsJsonAction(request, 'AmazonSSM.DeleteParameter', { Name: name }).catch(() => undefined);
  }
  for (const arn of tracker.stateMachines) {
    await awsJsonAction(request, 'AWSStepFunctions.DeleteStateMachine', { stateMachineArn: arn }, '1.0').catch(() => undefined);
  }
  for (const rule of tracker.eventRules) {
    await awsJsonAction(request, 'AWSEvents.RemoveTargets', { Rule: rule.name, EventBusName: rule.bus, Ids: ['target-1'] }).catch(() => undefined);
    await awsJsonAction(request, 'AWSEvents.DeleteRule', { Name: rule.name, EventBusName: rule.bus, Force: true }).catch(() => undefined);
  }
  for (const bus of tracker.eventBuses) {
    await awsJsonAction(request, 'AWSEvents.DeleteEventBus', { Name: bus }).catch(() => undefined);
  }
  for (const table of tracker.tables) {
    await request.post('/floci', {
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'X-Amz-Target': 'DynamoDB_20120810.DeleteTable',
      },
      data: JSON.stringify({ TableName: table }),
    }).catch(() => undefined);
  }
  for (const topicArn of tracker.topics) {
    await snsAction(request, 'DeleteTopic', { TopicArn: topicArn }).catch(() => undefined);
  }
  for (const queue of tracker.queues) {
    const queueUrl = `http://localhost:4566/${accountId}/${queue}`;
    await sqsAction(request, 'DeleteQueue', { QueueUrl: queueUrl }).catch(() => undefined);
  }
  for (const bucket of tracker.buckets) {
    await request.delete(`/floci/${bucket}`).catch(() => undefined);
  }
}

async function sweepStaleTestResources(request: APIRequestContext): Promise<void> {
  const tracked = createTracker();

  const listQueues = await sqsAction(request, 'ListQueues');
  for (const queueUrl of extractAll(listQueues, 'QueueUrl')) {
    const name = queueUrl.split('/').pop() || '';
    if (name.startsWith('pw-queue-')) tracked.queues.push(name);
  }

  const listTopics = await snsAction(request, 'ListTopics');
  for (const arn of extractAll(listTopics, 'TopicArn')) {
    const name = arn.split(':').pop() || '';
    if (name.startsWith('pw-topic-')) tracked.topics.push(arn);
  }

  const listTablesResp = await request.post('/floci', {
    headers: { 'Content-Type': 'application/x-amz-json-1.0', 'X-Amz-Target': 'DynamoDB_20120810.ListTables' },
    data: JSON.stringify({}),
  });
  const listTablesJson = await listTablesResp.json();
  for (const name of (listTablesJson.TableNames || []) as string[]) {
    if (name.startsWith('pw-table-')) tracked.tables.push(name);
  }

  const listBusesResp = await request.post('/floci', {
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSEvents.ListEventBuses' },
    data: JSON.stringify({}),
  });
  const listBusesJson = await listBusesResp.json();
  for (const bus of (listBusesJson.EventBuses || []) as Array<{ Name?: string }>) {
    if (bus.Name?.startsWith('pw-bus-')) tracked.eventBuses.push(bus.Name);
  }

  const listSmsResp = await request.post('/floci', {
    headers: { 'Content-Type': 'application/x-amz-json-1.0', 'X-Amz-Target': 'AWSStepFunctions.ListStateMachines' },
    data: JSON.stringify({}),
  });
  const listSmsJson = await listSmsResp.json();
  for (const sm of (listSmsJson.stateMachines || []) as Array<{ name?: string; stateMachineArn?: string }>) {
    if (sm.name?.startsWith('pw-sm-') && sm.stateMachineArn) tracked.stateMachines.push(sm.stateMachineArn);
  }

  const listParamsResp = await request.post('/floci', {
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AmazonSSM.DescribeParameters' },
    data: JSON.stringify({}),
  });
  const listParamsJson = await listParamsResp.json();
  for (const p of (listParamsJson.Parameters || []) as Array<{ Name?: string }>) {
    if (p.Name?.startsWith('/pw/')) tracked.ssmParameters.push(p.Name);
  }

  const listSecretsResp = await request.post('/floci', {
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'secretsmanager.ListSecrets' },
    data: JSON.stringify({}),
  });
  const listSecretsJson = await listSecretsResp.json();
  for (const s of (listSecretsJson.SecretList || []) as Array<{ Name?: string; ARN?: string }>) {
    if (s.Name?.startsWith('pw-secret-') && s.ARN) tracked.secrets.push(s.ARN);
  }

  const listGroupsResp = await request.post('/floci', {
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'Logs_20140328.DescribeLogGroups' },
    data: JSON.stringify({}),
  });
  const listGroupsJson = await listGroupsResp.json();
  for (const g of (listGroupsJson.logGroups || []) as Array<{ logGroupName?: string }>) {
    if (g.logGroupName?.startsWith('/aws/pw/')) tracked.logGroups.push(g.logGroupName);
  }

  const listBucketsResp = await request.get('/floci', { headers: { Accept: 'application/xml,text/xml,*/*' } });
  const listBucketsXml = await listBucketsResp.text();
  for (const name of extractAll(listBucketsXml, 'Name')) {
    if (name.startsWith('pw-bucket-')) tracked.buckets.push(name);
  }

  await cleanupTrackedResources(request, tracked);
}

async function createFromDialog(
  page: Parameters<typeof test>[0]['page'],
  openButton: string,
  name: string,
  confirmLabel: string,
  inputPlaceholder: string
): Promise<void> {
  await page.getByRole('button', { name: openButton }).click();
  const nameInput = page.getByPlaceholder(inputPlaceholder);
  await expect(nameInput).toBeVisible();
  await nameInput.fill(name);
  await page.getByRole('button', { name: confirmLabel }).last().click();
}

async function expectListContainsName(page: Parameters<typeof test>[0]['page'], name: string): Promise<void> {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(page.getByRole('button', { name: new RegExp(escaped) }).first()).toBeVisible();
}

test.describe('Create workflows', () => {
  test.beforeAll(async ({ request }) => {
    await sweepStaleTestResources(request);
  });

  test.afterEach(async ({ request }, testInfo) => {
    const tracker = createdByTestId.get(testInfo.testId);
    if (!tracker) return;
    await cleanupTrackedResources(request, tracker);
    createdByTestId.delete(testInfo.testId);
  });

  test('S3 create bucket', async ({ page }) => {
    const created = createTracker();
    createdByTestId.set(test.info().testId, created);
    const bucket = uniqueName('pw-bucket');
    created.buckets.push(bucket);
    await page.goto('/s3');
    await createFromDialog(page, 'Create Bucket', bucket, 'Create Bucket', 'my-bucket');
    await expectListContainsName(page, bucket);
  });

  test('SQS create queue', async ({ page }) => {
    const created = createTracker();
    createdByTestId.set(test.info().testId, created);
    const queue = uniqueName('pw-queue');
    created.queues.push(queue);
    await page.goto('/sqs');
    await createFromDialog(page, 'Create Queue', queue, 'Create Queue', 'my-queue');
    await expectListContainsName(page, queue);
  });

  test('SNS create + publish', async ({ page }) => {
    const created = createTracker();
    createdByTestId.set(test.info().testId, created);
    const topic = uniqueName('pw-topic');
    await page.goto('/sns');
    await createFromDialog(page, 'Create Topic', topic, 'Create Topic', 'my-topic');
    await expectListContainsName(page, topic);
    created.topics.push(`arn:aws:sns:ca-central-1:${accountId}:${topic}`);

    await page.getByPlaceholder('Message payload').fill('playwright test message');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText(/Published message/i)).toBeVisible();
  });

  test('DynamoDB create table + scan', async ({ page }) => {
    const created = createTracker();
    createdByTestId.set(test.info().testId, created);
    const table = uniqueName('pw-table');
    created.tables.push(table);
    await page.goto('/dynamodb');
    await page.getByRole('button', { name: 'Create Table' }).click();
    await page.getByPlaceholder('my-table').fill(table);
    await page.getByRole('button', { name: 'Create Table' }).last().click();
    await expectListContainsName(page, table);

    await page.getByRole('button', { name: 'Scan' }).click();
    await expect(page.getByText(/Scanned .* item\(s\)/i)).toBeVisible();
  });

  test('EventBridge create bus + schedule rule + send event', async ({ page }) => {
    const created = createTracker();
    createdByTestId.set(test.info().testId, created);
    const bus = uniqueName('pw-bus');
    const rule = uniqueName('pw-rule');
    created.eventBuses.push(bus);
    created.eventRules.push({ name: rule, bus });
    await page.goto('/eventbridge');

    await createFromDialog(page, 'Create Bus', bus, 'Create Bus', 'custom-bus');
    const busInput = page.getByPlaceholder('Event bus name');
    await expect(busInput).toHaveValue(bus);
    await expect(page.getByRole('button', { name: 'Create Rule' })).toBeEnabled();

    await page.getByRole('button', { name: 'Create Rule' }).click();
    await page.getByPlaceholder('my-rule').fill(rule);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.getByPlaceholder('rate(5 minutes)').fill('rate(15 minutes)');
    await page.getByRole('button', { name: 'Create Rule' }).last().click();
    await expectListContainsName(page, rule);

    await page.getByRole('button', { name: 'Send Event' }).click();
    await expect(page.getByText(/Sent .* event\(s\)/i)).toBeVisible();
  });

  test('Step Functions create + start execution', async ({ page }) => {
    const created = createTracker();
    createdByTestId.set(test.info().testId, created);
    const machine = uniqueName('pw-sm');
    await page.goto('/step-functions');
    await createFromDialog(page, 'Create State Machine', machine, 'Create State Machine', 'my-state-machine');
    await expectListContainsName(page, machine);
    created.stateMachines.push(`arn:aws:states:ca-central-1:${accountId}:stateMachine:${machine}`);

    await page.getByRole('button', { name: 'Start Execution' }).click();
    await expect(page.getByText(/Execution started/i)).toBeVisible();
  });

  test('SSM create + update', async ({ page }) => {
    const created = createTracker();
    createdByTestId.set(test.info().testId, created);
    const name = `/pw/${uniqueName('param')}`;
    created.ssmParameters.push(name);
    await page.goto('/ssm');

    const editor = page.locator('section').filter({ hasText: 'Create or Update' }).first();
    await editor.getByPlaceholder('Parameter name (e.g. /app/config)').fill(name);
    await editor.getByRole('textbox').last().fill('{"enabled": true}');
    await editor.getByRole('button', { name: 'Save Parameter' }).click();
    await expectListContainsName(page, name);

    await editor.getByRole('button', { name: 'Save Parameter' }).click();
    await expectListContainsName(page, name);
  });

  test('Secrets create + put value', async ({ page }) => {
    const created = createTracker();
    createdByTestId.set(test.info().testId, created);
    const name = uniqueName('pw-secret');
    await page.goto('/secrets-manager');
    const secretValuePanel = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Secret Value' }) }).first();
    await secretValuePanel.getByRole('textbox').first().fill('initial secret value');

    await page.getByRole('button', { name: 'Create Secret' }).click();
    await page.getByPlaceholder('my/secret').fill(name);
    await page.getByRole('button', { name: 'Create Secret' }).last().click();
    await expectListContainsName(page, name);
    created.secrets.push(`arn:aws:secretsmanager:ca-central-1:${accountId}:secret:${name}`);

    await page.getByRole('button', { name: 'Put Secret Value' }).click();
    await expect(page.getByText(/Stored new secret version/i)).toBeVisible();
  });

  test('CloudWatch create group + run filter', async ({ page }) => {
    const created = createTracker();
    createdByTestId.set(test.info().testId, created);
    const group = `/aws/pw/${uniqueName('logs')}`;
    created.logGroups.push(group);
    await page.goto('/cloudwatch');
    await createFromDialog(page, 'Create Log Group', group, 'Create Log Group', '/aws/lambda/my-function');
    await expectListContainsName(page, group);

    await page.getByRole('button', { name: 'Expand' }).click();
    await page.getByRole('button', { name: 'Run Filter' }).click();
    await expect(page.getByText(/Loaded .* event\(s\)/i)).toBeVisible();
  });
});
