import { joinUrl, parseMaybeJson, textContent, toIsoFromEpochMs } from "./utils.js";

export function createSqsService({ state, api, config }) {
  function queueUrlToName(queueUrl) {
    return queueUrl.split("/").filter(Boolean).pop() || queueUrl;
  }

  function extractQueueUrl(queueName) {
    return `${joinUrl(config.baseUrl)}/${config.sqsAccountId}/${queueName}`;
  }

  function findQueueByName(queueName) {
    return state.sqs.queues.find((queue) => queue.name === queueName) || null;
  }

  function getFilteredQueues(searchTerm) {
    const query = String(searchTerm || "").toLowerCase();
    if (!query) return state.sqs.queues;
    return state.sqs.queues.filter((queue) => queue.name.toLowerCase().includes(query));
  }

  async function loadQueues() {
    const doc = await api.sqsAction("ListQueues");
    const urls = Array.from(doc.querySelectorAll("QueueUrl")).map((node) => node.textContent || "");

    state.sqs.queues = urls.map((queueUrl) => ({
      name: queueUrlToName(queueUrl),
      queueUrl,
    }));
    state.sqs.messagesByQueue = {};
  }

  function parseSqsMessage(messageNode) {
    const messageId = textContent(messageNode, "MessageId") || "unknown-message";
    const body = textContent(messageNode, "Body");

    const attributes = Array.from(messageNode.querySelectorAll("Attribute")).reduce((acc, attributeNode) => {
      const key = textContent(attributeNode, "Name");
      const value = textContent(attributeNode, "Value");
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {});

    return {
      id: messageId,
      sentAt: toIsoFromEpochMs(attributes.SentTimestamp || ""),
      body: parseMaybeJson(body),
      raw: {
        messageId,
        receiptHandle: textContent(messageNode, "ReceiptHandle"),
        attributes,
        md5OfBody: textContent(messageNode, "MD5OfBody"),
      },
    };
  }

  async function loadMessagesForQueue(queueName, options = {}) {
    if (!queueName) return;
    if (state.sqs.messagesByQueue[queueName] && !options.force) return;

    const queue = findQueueByName(queueName);
    const queueUrl = queue?.queueUrl || extractQueueUrl(queueName);
    const doc = await api.sqsAction("ReceiveMessage", {
      QueueUrl: queueUrl,
      MaxNumberOfMessages: "10",
      VisibilityTimeout: "0",
      WaitTimeSeconds: "0",
      "AttributeName.1": "All",
      "MessageAttributeName.1": "All",
    });

    state.sqs.messagesByQueue[queueName] = Array.from(doc.querySelectorAll("ReceiveMessageResult > Message")).map(
      parseSqsMessage
    );
  }

  async function deleteMessage(queueName, receiptHandle) {
    const queue = findQueueByName(queueName);
    const queueUrl = queue?.queueUrl || extractQueueUrl(queueName);

    await api.sqsAction("DeleteMessage", {
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });
  }

  function clearMessagesCache() {
    state.sqs.messagesByQueue = {};
  }

  return {
    extractQueueUrl,
    findQueueByName,
    getFilteredQueues,
    loadQueues,
    loadMessagesForQueue,
    deleteMessage,
    clearMessagesCache,
  };
}
