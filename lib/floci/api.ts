import type {
  ApiConfig,
  DynamoTableDescription,
  DynamoTableSummary,
  FileEntry,
  LambdaFunctionSummary,
  Listing,
  SecretDetails,
  SecretSummary,
  Queue,
  StepFunctionExecutionSummary,
  StepFunctionStateMachineSummary,
  SsmParameterSummary,
  SnsSubscription,
  SnsTopic,
  SqsMessage,
  CloudWatchLogEvent,
  CloudWatchLogGroupSummary,
  CloudWatchLogStreamSummary,
  EventBusSummary,
  EventRuleSummary,
  EventTargetSummary,
} from '@/lib/floci/types';
import { encodeS3KeyForPath, joinUrl, parseMaybeJson, parseXml, textContent, toIsoFromEpochMs } from '@/lib/floci/utils';

function parseJsonBody(body: string): Record<string, unknown> {
  if (!body.trim()) return {};

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to parse JSON response');
  }
}

function decodeDynamoAttribute(value: Record<string, unknown>): unknown {
  if ('S' in value) return String(value.S || '');
  if ('N' in value) return Number(value.N || 0);
  if ('BOOL' in value) return Boolean(value.BOOL);
  if ('NULL' in value) return null;
  if ('L' in value && Array.isArray(value.L)) return value.L.map((item) => decodeDynamoAttribute((item || {}) as Record<string, unknown>));
  if ('M' in value && value.M && typeof value.M === 'object') {
    return Object.fromEntries(
      Object.entries(value.M as Record<string, unknown>).map(([key, nested]) => [key, decodeDynamoAttribute((nested || {}) as Record<string, unknown>)])
    );
  }

  return value;
}

function decodeDynamoItem(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, decodeDynamoAttribute((value || {}) as Record<string, unknown>)]));
}

export function createApiClient(config: ApiConfig) {
  function objectUrl(bucketName: string, key: string): string {
    const encodedKey = encodeS3KeyForPath(key);
    return `${joinUrl(config.baseUrl)}/${bucketName}/${encodedKey}`;
  }

  async function getXml(path: string): Promise<Document> {
    const response = await fetch(joinUrl(config.baseUrl, path), {
      method: 'GET',
      headers: {
        Accept: 'application/xml,text/xml,*/*',
      },
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`GET ${path || '/'} failed (${response.status}): ${body.slice(0, 180)}`);
    }

    return parseXml(body);
  }

  async function sqsAction(action: string, params: Record<string, string> = {}): Promise<Document> {
    const body = new URLSearchParams({
      Action: action,
      Version: config.sqsVersion,
      ...params,
    });

    const response = await fetch(joinUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/xml,text/xml,*/*',
      },
      body: body.toString(),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`SQS ${action} failed (${response.status}): ${text.slice(0, 180)}`);
    }

    return parseXml(text);
  }

  async function snsAction(action: string, params: Record<string, string> = {}): Promise<Document> {
    const body = new URLSearchParams({
      Action: action,
      Version: '2010-03-31',
      ...params,
    });

    const response = await fetch(joinUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/xml,text/xml,*/*',
      },
      body: body.toString(),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`SNS ${action} failed (${response.status}): ${text.slice(0, 180)}`);
    }

    return parseXml(text);
  }

  async function dynamoAction<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(joinUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'X-Amz-Target': `DynamoDB_20120810.${action}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    const parsed = parseJsonBody(text);

    if (!response.ok) {
      throw new Error(`DynamoDB ${action} failed (${response.status}): ${text.slice(0, 180)}`);
    }

    if (typeof parsed.__type === 'string' || typeof parsed.message === 'string') {
      throw new Error(`DynamoDB ${action} error: ${String(parsed.message || parsed.__type)}`);
    }

    return parsed as T;
  }

  async function awsJsonAction<T>(target: string, payload: Record<string, unknown>, jsonVersion: '1.0' | '1.1' = '1.1'): Promise<T> {
    const response = await fetch(joinUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': `application/x-amz-json-${jsonVersion}`,
        'X-Amz-Target': target,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    const parsed = parseJsonBody(text);

    if (!response.ok) {
      throw new Error(`${target} failed (${response.status}): ${text.slice(0, 180)}`);
    }

    if (typeof parsed.__type === 'string' || typeof parsed.message === 'string') {
      throw new Error(`${target} error: ${String(parsed.message || parsed.__type)}`);
    }

    return parsed as T;
  }

  async function listLambdaFunctions(): Promise<LambdaFunctionSummary[]> {
    const response = await fetch(joinUrl(config.baseUrl, '/2015-03-31/functions/'), {
      method: 'GET',
      headers: {
        Accept: 'application/json,*/*',
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Lambda ListFunctions failed (${response.status}): ${text.slice(0, 180)}`);
    }

    const payload = parseJsonBody(text);
    const functions = Array.isArray(payload.Functions) ? payload.Functions : [];

    return functions.map((entry) => {
      const fn = (entry || {}) as Record<string, unknown>;
      return {
        name: String(fn.FunctionName || ''),
        runtime: String(fn.Runtime || 'n/a'),
        handler: String(fn.Handler || 'n/a'),
        lastModified: String(fn.LastModified || ''),
        arn: String(fn.FunctionArn || ''),
      } satisfies LambdaFunctionSummary;
    });
  }

  async function getLambdaFunctionCodeZip(functionName: string): Promise<Uint8Array> {
    const response = await fetch(joinUrl(config.baseUrl, `/2015-03-31/functions/${encodeURIComponent(functionName)}`), {
      method: 'GET',
      headers: {
        Accept: 'application/json,*/*',
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Lambda GetFunction failed (${response.status}): ${text.slice(0, 180)}`);
    }

    const payload = parseJsonBody(text);
    const locationRaw = String((payload.Code as Record<string, unknown> | undefined)?.Location || '');
    if (!locationRaw) {
      throw new Error('Lambda GetFunction returned no code location.');
    }

    let downloadUrl = locationRaw;
    try {
      const locationUrl = new URL(locationRaw);
      const baseUrl = new URL(config.baseUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      if (locationUrl.host === 'floci:4566' || locationUrl.host === 'localhost:4566') {
        downloadUrl = joinUrl(baseUrl.toString(), `${locationUrl.pathname}${locationUrl.search}`);
      }
    } catch {
      // Use raw location when URL parsing fails.
    }

    const codeResponse = await fetch(downloadUrl, { method: 'GET' });
    if (!codeResponse.ok) {
      const body = await codeResponse.text();
      throw new Error(`Lambda code download failed (${codeResponse.status}): ${body.slice(0, 180)}`);
    }

    return new Uint8Array(await codeResponse.arrayBuffer());
  }

  async function getLambdaFunctionSourceFiles(functionName: string): Promise<{ path: string; text: string }[]> {
    const response = await fetch(`/api/lambda-source/${encodeURIComponent(functionName)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json,*/*',
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Lambda source fetch failed (${response.status}): ${text.slice(0, 180)}`);
    }
    const payload = parseJsonBody(text);
    const entriesRaw = Array.isArray(payload.entries) ? payload.entries : [];
    return entriesRaw
      .map((entry) => ({
        path: String((entry as Record<string, unknown>).path || ''),
        text: String((entry as Record<string, unknown>).text || ''),
      }))
      .filter((entry) => entry.path);
  }

  async function invokeLambda(functionName: string, payload: string): Promise<{ statusCode: number; functionError: string; logs: string; result: unknown; requestId: string }> {
    const response = await fetch(joinUrl(config.baseUrl, `/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json,*/*',
        'X-Amz-Log-Type': 'Tail',
      },
      body: payload,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Lambda invoke failed (${response.status}): ${text.slice(0, 180)}`);
    }

    const rawLogs = response.headers.get('x-amz-log-result') || '';
    let decodedLogs = '';

    if (rawLogs) {
      try {
        decodedLogs = atob(rawLogs);
      } catch {
        decodedLogs = '';
      }
    }

    return {
      statusCode: response.status,
      functionError: response.headers.get('x-amz-function-error') || '',
      logs: decodedLogs,
      result: parseMaybeJson(text),
      requestId: response.headers.get('x-amzn-requestid') || response.headers.get('x-amz-request-id') || '',
    };
  }

  async function deleteObject(bucketName: string, key: string): Promise<void> {
    const response = await fetch(objectUrl(bucketName, key), {
      method: 'DELETE',
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Delete failed (${response.status}): ${body.slice(0, 180)}`);
    }
  }

  async function loadQueues(): Promise<Queue[]> {
    const doc = await sqsAction('ListQueues');
    const urls = Array.from(doc.querySelectorAll('QueueUrl')).map((node) => node.textContent || '');

    return urls.map((queueUrl) => ({
      name: queueUrl.split('/').filter(Boolean).pop() || queueUrl,
      queueUrl,
    }));
  }

  async function createSqsQueue(queueName: string, attributes: Record<string, string> = {}): Promise<void> {
    const params: Record<string, string> = { QueueName: queueName };
    const entries = Object.entries(attributes).filter(([, value]) => value !== '');
    entries.forEach(([key, value], index) => {
      const i = index + 1;
      params[`Attribute.${i}.Name`] = key;
      params[`Attribute.${i}.Value`] = value;
    });
    await sqsAction('CreateQueue', params);
  }

  async function loadMessagesForQueue(queueUrl: string): Promise<SqsMessage[]> {
    const doc = await sqsAction('ReceiveMessage', {
      QueueUrl: queueUrl,
      MaxNumberOfMessages: '10',
      VisibilityTimeout: '0',
      WaitTimeSeconds: '0',
      'AttributeName.1': 'All',
      'MessageAttributeName.1': 'All',
    });

    return Array.from(doc.querySelectorAll('ReceiveMessageResult > Message')).map((messageNode) => {
      const messageId = textContent(messageNode, 'MessageId') || 'unknown-message';
      const body = textContent(messageNode, 'Body');
      const attributes = Array.from(messageNode.querySelectorAll('Attribute')).reduce<Record<string, string>>((acc, attributeNode) => {
        const key = textContent(attributeNode, 'Name');
        const value = textContent(attributeNode, 'Value');
        if (key) {
          acc[key] = value;
        }
        return acc;
      }, {});

      return {
        id: messageId,
        sentAt: toIsoFromEpochMs(attributes.SentTimestamp || ''),
        body: parseMaybeJson(body),
        raw: {
          messageId,
          receiptHandle: textContent(messageNode, 'ReceiptHandle'),
          attributes,
          md5OfBody: textContent(messageNode, 'MD5OfBody'),
        },
      };
    });
  }

  async function deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await sqsAction('DeleteMessage', {
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });
  }

  async function loadBuckets(): Promise<{ name: string; region: string; creationDate: string }[]> {
    const doc = await getXml('');
    return Array.from(doc.querySelectorAll('Buckets > Bucket')).map((bucketNode) => ({
      name: textContent(bucketNode, 'Name'),
      region: 'ca-central-1',
      creationDate: textContent(bucketNode, 'CreationDate'),
    }));
  }

  async function createS3Bucket(
    bucketName: string,
    options: { region?: string; acl?: string; objectLockEnabled?: boolean } = {}
  ): Promise<void> {
    const region = options.region || 'ca-central-1';
    const body =
      region && region !== 'us-east-1'
        ? `<?xml version=\"1.0\" encoding=\"UTF-8\"?><CreateBucketConfiguration xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><LocationConstraint>${region}</LocationConstraint></CreateBucketConfiguration>`
        : undefined;

    const headers: HeadersInit = {
      'Content-Type': 'application/xml',
    };
    if (options.acl) {
      headers['x-amz-acl'] = options.acl;
    }
    if (options.objectLockEnabled) {
      headers['x-amz-bucket-object-lock-enabled'] = 'true';
    }

    const response = await fetch(joinUrl(config.baseUrl, `/${bucketName}`), {
      method: 'PUT',
      headers,
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Create bucket failed (${response.status}): ${text.slice(0, 180)}`);
    }
  }

  async function loadObjectsForBucketPrefix(bucketName: string, prefix: string): Promise<Listing> {
    const query = new URLSearchParams({
      'list-type': '2',
      delimiter: '/',
      'max-keys': '200',
    });

    if (prefix) {
      query.set('prefix', prefix);
    }

    const doc = await getXml(`/${bucketName}?${query.toString()}`);

    const folders = Array.from(doc.querySelectorAll('ListBucketResult > CommonPrefixes > Prefix')).map((node) => {
      const fullPrefix = node.textContent || '';
      const relativeName = fullPrefix.replace(prefix, '').replace(/\/$/, '');
      return {
        type: 'folder' as const,
        name: relativeName || fullPrefix,
        prefix: fullPrefix,
      };
    });

    const files = Array.from(doc.querySelectorAll('ListBucketResult > Contents'))
      .map((objectNode) => {
        const key = textContent(objectNode, 'Key');
        if (!key || key === prefix) return null;

        const relativeName = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
        if (relativeName.includes('/')) return null;

        return {
          type: 'file' as const,
          key,
          name: relativeName || key,
          size: textContent(objectNode, 'Size'),
          lastModified: textContent(objectNode, 'LastModified'),
          etag: textContent(objectNode, 'ETag'),
        } satisfies FileEntry;
      })
      .filter((entry): entry is FileEntry => entry !== null);

    return { folders, files };
  }

  async function listAllKeysForPrefix(bucketName: string, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken = '';

    while (true) {
      const query = new URLSearchParams({
        'list-type': '2',
        'max-keys': '1000',
        prefix,
      });

      if (continuationToken) {
        query.set('continuation-token', continuationToken);
      }

      const doc = await getXml(`/${bucketName}?${query.toString()}`);
      const pageKeys = Array.from(doc.querySelectorAll('ListBucketResult > Contents > Key'))
        .map((node) => node.textContent || '')
        .filter(Boolean);

      keys.push(...pageKeys);

      const isTruncated = (textContent(doc, 'ListBucketResult > IsTruncated') || '').toLowerCase() === 'true';
      if (!isTruncated) {
        break;
      }

      continuationToken = textContent(doc, 'ListBucketResult > NextContinuationToken');
      if (!continuationToken) {
        break;
      }
    }

    return keys;
  }

  async function loadSnsTopics(): Promise<SnsTopic[]> {
    const doc = await snsAction('ListTopics');
    return Array.from(doc.querySelectorAll('ListTopicsResult > Topics > member > TopicArn')).map((node) => {
      const arn = node.textContent || '';
      return {
        arn,
        name: arn.split(':').pop() || arn,
      };
    });
  }

  async function loadSnsSubscriptionsByTopic(topicArn: string): Promise<SnsSubscription[]> {
    const doc = await snsAction('ListSubscriptionsByTopic', { TopicArn: topicArn });
    return Array.from(doc.querySelectorAll('ListSubscriptionsByTopicResult > Subscriptions > member')).map((node) => ({
      subscriptionArn: textContent(node, 'SubscriptionArn'),
      topicArn: textContent(node, 'TopicArn'),
      protocol: textContent(node, 'Protocol'),
      endpoint: textContent(node, 'Endpoint'),
    }));
  }

  async function publishSnsMessage(topicArn: string, message: string, subject: string): Promise<string> {
    const params: Record<string, string> = {
      TopicArn: topicArn,
      Message: message,
    };

    if (subject.trim()) {
      params.Subject = subject.trim();
    }

    const doc = await snsAction('Publish', params);
    return textContent(doc, 'PublishResult > MessageId');
  }

  async function createSnsTopic(name: string): Promise<string> {
    const doc = await snsAction('CreateTopic', { Name: name });
    return textContent(doc, 'CreateTopicResult > TopicArn');
  }

  async function loadDynamoTables(): Promise<DynamoTableSummary[]> {
    const tables: DynamoTableSummary[] = [];
    let lastEvaluated = '';

    while (true) {
      const response = await dynamoAction<{ LastEvaluatedTableName?: string; TableNames?: string[] }>('ListTables',
        lastEvaluated ? { ExclusiveStartTableName: lastEvaluated } : {});

      const names = Array.isArray(response.TableNames) ? response.TableNames : [];
      for (const name of names) {
        tables.push({ name });
      }

      lastEvaluated = response.LastEvaluatedTableName || '';
      if (!lastEvaluated) {
        break;
      }
    }

    return tables;
  }

  async function describeDynamoTable(tableName: string): Promise<DynamoTableDescription> {
    const response = await dynamoAction<{ Table?: Record<string, unknown> }>('DescribeTable', { TableName: tableName });
    const table = (response.Table || {}) as Record<string, unknown>;
    const keySchemaRaw = Array.isArray(table.KeySchema) ? table.KeySchema : [];

    return {
      name: String(table.TableName || tableName),
      itemCount: Number(table.ItemCount || 0),
      tableStatus: String(table.TableStatus || 'UNKNOWN'),
      keySchema: keySchemaRaw.map((entry) => {
        const raw = (entry || {}) as Record<string, unknown>;
        return {
          name: String(raw.AttributeName || ''),
          type: String(raw.KeyType || ''),
        };
      }),
    };
  }

  async function scanDynamoTable(tableName: string, limit = 25): Promise<Record<string, unknown>[]> {
    const response = await dynamoAction<{ Items?: Record<string, unknown>[] }>('Scan', {
      TableName: tableName,
      Limit: limit,
    });

    const items = Array.isArray(response.Items) ? response.Items : [];
    return items.map((item) => decodeDynamoItem(item));
  }

  async function queryDynamoTableByPartitionKey(
    tableName: string,
    keyName: string,
    keyType: 'S' | 'N',
    keyValue: string,
    limit = 25
  ): Promise<Record<string, unknown>[]> {
    const typedValue = keyType === 'N' ? { N: keyValue } : { S: keyValue };

    const response = await dynamoAction<{ Items?: Record<string, unknown>[] }>('Query', {
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: {
        '#pk': keyName,
      },
      ExpressionAttributeValues: {
        ':pk': typedValue,
      },
      Limit: limit,
    });

    const items = Array.isArray(response.Items) ? response.Items : [];
    return items.map((item) => decodeDynamoItem(item));
  }

  async function createDynamoTable(tableName: string, partitionKeyName: string, sortKeyName = ''): Promise<string> {
    const attributeDefinitions: Record<string, string>[] = [{ AttributeName: partitionKeyName, AttributeType: 'S' }];
    const keySchema: Record<string, string>[] = [{ AttributeName: partitionKeyName, KeyType: 'HASH' }];
    if (sortKeyName.trim()) {
      attributeDefinitions.push({ AttributeName: sortKeyName.trim(), AttributeType: 'S' });
      keySchema.push({ AttributeName: sortKeyName.trim(), KeyType: 'RANGE' });
    }

    const response = await dynamoAction<{ TableDescription?: Record<string, unknown> }>('CreateTable', {
      TableName: tableName,
      AttributeDefinitions: attributeDefinitions,
      KeySchema: keySchema,
      BillingMode: 'PAY_PER_REQUEST',
    });
    return String(response.TableDescription?.TableArn || '');
  }

  async function listEventBuses(): Promise<EventBusSummary[]> {
    const response = await awsJsonAction<{ EventBuses?: Record<string, unknown>[] }>('AWSEvents.ListEventBuses', {});
    const items = Array.isArray(response.EventBuses) ? response.EventBuses : [];
    return items.map((item) => ({
      name: String(item.Name || ''),
      arn: String(item.Arn || ''),
    }));
  }

  async function listEventRules(eventBusName: string): Promise<EventRuleSummary[]> {
    const response = await awsJsonAction<{ Rules?: Record<string, unknown>[] }>('AWSEvents.ListRules', eventBusName ? { EventBusName: eventBusName } : {});
    const items = Array.isArray(response.Rules) ? response.Rules : [];
    return items.map((item) => ({
      name: String(item.Name || ''),
      arn: String(item.Arn || ''),
      eventBusName: String(item.EventBusName || ''),
      state: String(item.State || 'UNKNOWN'),
    }));
  }

  async function listEventTargetsByRule(ruleName: string, eventBusName: string): Promise<EventTargetSummary[]> {
    const response = await awsJsonAction<{ Targets?: Record<string, unknown>[] }>('AWSEvents.ListTargetsByRule', {
      Rule: ruleName,
      EventBusName: eventBusName,
    });
    const items = Array.isArray(response.Targets) ? response.Targets : [];
    return items.map((item) => ({
      id: String(item.Id || ''),
      arn: String(item.Arn || ''),
    }));
  }

  async function putEventBridgeEvent(source: string, detailType: string, detail: string, eventBusName: string): Promise<string[]> {
    const response = await awsJsonAction<{ Entries?: Record<string, unknown>[] }>('AWSEvents.PutEvents', {
      Entries: [
        {
          Source: source,
          DetailType: detailType,
          Detail: detail,
          EventBusName: eventBusName,
        },
      ],
    });
    const entries = Array.isArray(response.Entries) ? response.Entries : [];
    return entries.map((entry) => String(entry.EventId || ''));
  }

  async function createEventBus(name: string): Promise<string> {
    const response = await awsJsonAction<{ EventBusArn?: string }>('AWSEvents.CreateEventBus', { Name: name });
    return String(response.EventBusArn || '');
  }

  async function createEventRule(name: string, eventBusName: string, eventPattern: string): Promise<string> {
    const response = await awsJsonAction<{ RuleArn?: string }>('AWSEvents.PutRule', {
      Name: name,
      EventBusName: eventBusName,
      EventPattern: eventPattern,
      State: 'ENABLED',
    });
    return String(response.RuleArn || '');
  }

  async function listStepFunctionsStateMachines(): Promise<StepFunctionStateMachineSummary[]> {
    const response = await awsJsonAction<{ stateMachines?: Record<string, unknown>[] }>('AWSStepFunctions.ListStateMachines', {}, '1.0');
    const items = Array.isArray(response.stateMachines) ? response.stateMachines : [];
    return items.map((item) => ({
      name: String(item.name || ''),
      arn: String(item.stateMachineArn || ''),
      type: String(item.type || ''),
      creationDate: String(item.creationDate || ''),
    }));
  }

  async function listStepFunctionsExecutions(stateMachineArn: string): Promise<StepFunctionExecutionSummary[]> {
    const response = await awsJsonAction<{ executions?: Record<string, unknown>[] }>('AWSStepFunctions.ListExecutions', { stateMachineArn }, '1.0');
    const items = Array.isArray(response.executions) ? response.executions : [];
    return items.map((item) => ({
      name: String(item.name || ''),
      arn: String(item.executionArn || ''),
      status: String(item.status || ''),
      startDate: String(item.startDate || ''),
      stopDate: String(item.stopDate || ''),
    }));
  }

  async function startStepFunctionsExecution(stateMachineArn: string, input: string): Promise<string> {
    const response = await awsJsonAction<{ executionArn?: string }>('AWSStepFunctions.StartExecution', {
      stateMachineArn,
      input,
    }, '1.0');
    return String(response.executionArn || '');
  }

  async function createStepFunctionsStateMachine(name: string, roleArn: string, definition: string, type: 'STANDARD' | 'EXPRESS' = 'STANDARD'): Promise<string> {
    const response = await awsJsonAction<{ stateMachineArn?: string }>(
      'AWSStepFunctions.CreateStateMachine',
      { name, roleArn, definition, type },
      '1.0'
    );
    return String(response.stateMachineArn || '');
  }

  async function listSsmParameters(): Promise<SsmParameterSummary[]> {
    const response = await awsJsonAction<{ Parameters?: Record<string, unknown>[] }>('AmazonSSM.DescribeParameters', {});
    const items = Array.isArray(response.Parameters) ? response.Parameters : [];
    return items.map((item) => ({
      name: String(item.Name || ''),
      type: String(item.Type || ''),
      lastModifiedDate: String(item.LastModifiedDate || ''),
      version: Number(item.Version || 0),
    }));
  }

  async function getSsmParameter(name: string): Promise<string> {
    const response = await awsJsonAction<{ Parameter?: Record<string, unknown> }>('AmazonSSM.GetParameter', { Name: name, WithDecryption: true });
    return String(response.Parameter?.Value || '');
  }

  async function putSsmParameter(name: string, value: string, type: 'String' | 'SecureString' = 'String'): Promise<number> {
    const response = await awsJsonAction<{ Version?: number }>('AmazonSSM.PutParameter', {
      Name: name,
      Value: value,
      Type: type,
      Overwrite: true,
    });
    return Number(response.Version || 0);
  }

  async function listSecrets(): Promise<SecretSummary[]> {
    const response = await awsJsonAction<{ SecretList?: Record<string, unknown>[] }>('secretsmanager.ListSecrets', {});
    const items = Array.isArray(response.SecretList) ? response.SecretList : [];
    return items.map((item) => ({
      name: String(item.Name || ''),
      arn: String(item.ARN || ''),
      description: String(item.Description || ''),
      lastChangedDate: String(item.LastChangedDate || ''),
    }));
  }

  async function describeSecret(secretId: string): Promise<SecretDetails> {
    const response = await awsJsonAction<Record<string, unknown>>('secretsmanager.DescribeSecret', { SecretId: secretId });
    const versionIdsToStagesRaw =
      response.VersionIdsToStages && typeof response.VersionIdsToStages === 'object'
        ? (response.VersionIdsToStages as Record<string, unknown>)
        : {};
    const versionIdsToStages = Object.fromEntries(
      Object.entries(versionIdsToStagesRaw).map(([version, stages]) => [version, Array.isArray(stages) ? stages.map((stage) => String(stage)) : []])
    );
    return {
      arn: String(response.ARN || ''),
      name: String(response.Name || ''),
      description: String(response.Description || ''),
      versionIdsToStages,
    };
  }

  async function getSecretValue(secretId: string): Promise<string> {
    const response = await awsJsonAction<Record<string, unknown>>('secretsmanager.GetSecretValue', { SecretId: secretId });
    return String(response.SecretString || '');
  }

  async function putSecretValue(secretId: string, value: string): Promise<string> {
    const response = await awsJsonAction<Record<string, unknown>>('secretsmanager.PutSecretValue', { SecretId: secretId, SecretString: value });
    return String(response.VersionId || '');
  }

  async function createSecret(name: string, secretString: string, description = ''): Promise<string> {
    const response = await awsJsonAction<Record<string, unknown>>('secretsmanager.CreateSecret', {
      Name: name,
      SecretString: secretString,
      Description: description,
    });
    return String(response.ARN || '');
  }

  async function listLogGroups(): Promise<CloudWatchLogGroupSummary[]> {
    const response = await awsJsonAction<{ logGroups?: Record<string, unknown>[] }>('Logs_20140328.DescribeLogGroups', {});
    const items = Array.isArray(response.logGroups) ? response.logGroups : [];
    return items.map((item) => ({
      logGroupName: String(item.logGroupName || ''),
      storedBytes: Number(item.storedBytes || 0),
      retentionInDays: Number(item.retentionInDays || 0),
    }));
  }

  async function listLogStreams(logGroupName: string): Promise<CloudWatchLogStreamSummary[]> {
    const response = await awsJsonAction<{ logStreams?: Record<string, unknown>[] }>('Logs_20140328.DescribeLogStreams', {
      logGroupName,
      orderBy: 'LastEventTime',
      descending: true,
    });
    const items = Array.isArray(response.logStreams) ? response.logStreams : [];
    return items.map((item) => ({
      logStreamName: String(item.logStreamName || ''),
      lastEventTimestamp: Number(item.lastEventTimestamp || 0),
    }));
  }

  async function filterLogEvents(logGroupName: string, filterPattern: string): Promise<CloudWatchLogEvent[]> {
    const trimmedPattern = filterPattern.trim();
    const pageLimit = 100;
    const maxPages = 10;
    const collected: Record<string, unknown>[] = [];
    let nextToken = '';

    for (let page = 0; page < maxPages; page += 1) {
      const response = await awsJsonAction<{ events?: Record<string, unknown>[]; nextToken?: string }>('Logs_20140328.FilterLogEvents', {
        logGroupName,
        ...(trimmedPattern ? { filterPattern: trimmedPattern } : {}),
        limit: pageLimit,
        ...(nextToken ? { nextToken } : {}),
      });
      const items = Array.isArray(response.events) ? response.events : [];
      collected.push(...items);

      const token = typeof response.nextToken === 'string' ? response.nextToken : '';
      if (!token || token === nextToken) break;
      nextToken = token;
    }

    const newest = collected
      .map((item) => ({
        timestamp: Number(item.timestamp || 0),
        message: String(item.message || ''),
        ingestionTime: Number(item.ingestionTime || 0),
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 200);

    return newest;
  }

  async function createLogGroup(logGroupName: string): Promise<void> {
    await awsJsonAction('Logs_20140328.CreateLogGroup', { logGroupName });
  }

  async function createLambdaFunction(name: string, role: string, zipBase64: string, runtime = 'nodejs18.x', handler = 'index.handler'): Promise<string> {
    const response = await fetch(joinUrl(config.baseUrl, '/2015-03-31/functions/'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FunctionName: name,
        Runtime: runtime,
        Role: role,
        Handler: handler,
        Code: {
          ZipFile: zipBase64,
        },
        Publish: true,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Lambda CreateFunction failed (${response.status}): ${text.slice(0, 180)}`);
    }
    const payload = parseJsonBody(text);
    return String(payload.FunctionArn || '');
  }

  async function updateLambdaFunctionCode(name: string, zipBase64: string): Promise<void> {
    const response = await fetch(joinUrl(config.baseUrl, `/2015-03-31/functions/${encodeURIComponent(name)}/code`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ZipFile: zipBase64,
        Publish: true,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Lambda UpdateFunctionCode failed (${response.status}): ${text.slice(0, 180)}`);
    }
  }

  return {
    getXml,
    sqsAction,
    deleteObject,
    objectUrl,
    loadQueues,
    createSqsQueue,
    loadMessagesForQueue,
    deleteMessage,
    loadBuckets,
    createS3Bucket,
    loadObjectsForBucketPrefix,
    listAllKeysForPrefix,
    loadSnsTopics,
    loadSnsSubscriptionsByTopic,
    publishSnsMessage,
    createSnsTopic,
    loadDynamoTables,
    describeDynamoTable,
    scanDynamoTable,
    queryDynamoTableByPartitionKey,
    createDynamoTable,
    listLambdaFunctions,
    getLambdaFunctionCodeZip,
    getLambdaFunctionSourceFiles,
    invokeLambda,
    createLambdaFunction,
    updateLambdaFunctionCode,
    listEventBuses,
    listEventRules,
    listEventTargetsByRule,
    putEventBridgeEvent,
    createEventBus,
    createEventRule,
    listStepFunctionsStateMachines,
    listStepFunctionsExecutions,
    startStepFunctionsExecution,
    createStepFunctionsStateMachine,
    listSsmParameters,
    getSsmParameter,
    putSsmParameter,
    listSecrets,
    describeSecret,
    getSecretValue,
    putSecretValue,
    createSecret,
    listLogGroups,
    listLogStreams,
    filterLogEvents,
    createLogGroup,
  };
}
