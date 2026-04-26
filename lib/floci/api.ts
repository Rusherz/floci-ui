import type { ApiConfig, FileEntry, Listing, Queue, SqsMessage } from '@/lib/floci/types';
import { encodeS3KeyForPath, joinUrl, parseMaybeJson, parseXml, textContent, toIsoFromEpochMs } from '@/lib/floci/utils';

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

  return {
    getXml,
    sqsAction,
    deleteObject,
    objectUrl,
    loadQueues,
    loadMessagesForQueue,
    deleteMessage,
    loadBuckets,
    loadObjectsForBucketPrefix,
    listAllKeysForPrefix,
  };
}
