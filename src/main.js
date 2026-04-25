const API_CONFIG = {
  baseUrl: window.FLOCI_API_BASE_URL || `${window.location.origin}/floci`,
  sqsAccountId: window.FLOCI_SQS_ACCOUNT_ID || "000000000000",
  sqsVersion: "2012-11-05",
  sqsPollMs: Number(window.FLOCI_SQS_POLL_MS || 5000),
};
const THEME_STORAGE_KEY = "floci_theme";
const UI_STATE_STORAGE_KEY = "floci_ui_state";

const state = {
  view: "sqs",
  selectedQueue: 0,
  selectedMessage: 0,
  selectedBucket: 0,
  search: "",
  loading: false,
  sqs: {
    queues: [],
    messagesByQueue: {},
  },
  s3: {
    buckets: [],
    prefixByBucket: {},
    entriesByLocation: {},
    selectedObject: null,
  },
  polling: {
    enabled: true,
    running: false,
    intervalMs: 5000,
    nextPollAt: Date.now(),
  },
};

const els = {
  title: document.getElementById("view-title"),
  navButtons: document.querySelectorAll(".nav-btn"),
  search: document.getElementById("search-input"),
  refreshBtn: document.getElementById("refresh-btn"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  statusBanner: document.getElementById("status-banner"),
  sqsView: document.getElementById("sqs-view"),
  s3View: document.getElementById("s3-view"),
  queueList: document.getElementById("queue-list"),
  messageList: document.getElementById("message-list"),
  messageDetail: document.getElementById("message-detail"),
  deleteMessageBtn: document.getElementById("delete-message-btn"),
  pollToggleBtn: document.getElementById("poll-toggle-btn"),
  pollProgressFill: document.getElementById("poll-progress-fill"),
  bucketList: document.getElementById("bucket-list"),
  objectList: document.getElementById("object-list"),
  objectPath: document.getElementById("object-path"),
  objectUpBtn: document.getElementById("object-up-btn"),
  objectDetail: document.getElementById("object-detail"),
  confirmModal: document.getElementById("confirm-modal"),
  confirmModalTitle: document.getElementById("confirm-modal-title"),
  confirmModalMessage: document.getElementById("confirm-modal-message"),
  confirmModalCancel: document.getElementById("confirm-modal-cancel"),
  confirmModalConfirm: document.getElementById("confirm-modal-confirm"),
};

state.polling.intervalMs = API_CONFIG.sqsPollMs > 0 ? API_CONFIG.sqsPollMs : 5000;
state.polling.nextPollAt = Date.now() + state.polling.intervalMs;
let confirmResolve = null;

function getStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function resolveInitialTheme() {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (els.themeToggleBtn) {
    els.themeToggleBtn.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // noop
  }
}

function loadUiState() {
  try {
    const raw = window.sessionStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applyLoadedUiState(saved) {
  if (!saved || typeof saved !== "object") return;

  if (saved.view === "sqs" || saved.view === "s3") state.view = saved.view;
  if (typeof saved.search === "string") state.search = saved.search;
  if (Number.isInteger(saved.selectedQueue) && saved.selectedQueue >= 0) state.selectedQueue = saved.selectedQueue;
  if (Number.isInteger(saved.selectedMessage) && saved.selectedMessage >= 0) state.selectedMessage = saved.selectedMessage;
  if (Number.isInteger(saved.selectedBucket) && saved.selectedBucket >= 0) state.selectedBucket = saved.selectedBucket;
  if (saved.s3PrefixByBucket && typeof saved.s3PrefixByBucket === "object") {
    state.s3.prefixByBucket = saved.s3PrefixByBucket;
  }
  if (saved.s3SelectedObject && typeof saved.s3SelectedObject === "object") {
    state.s3.selectedObject = saved.s3SelectedObject;
  }
  if (typeof saved.pollingEnabled === "boolean") {
    state.polling.enabled = saved.pollingEnabled;
  }
}

function persistUiState() {
  try {
    const payload = {
      view: state.view,
      search: state.search,
      selectedQueue: state.selectedQueue,
      selectedMessage: state.selectedMessage,
      selectedBucket: state.selectedBucket,
      s3PrefixByBucket: state.s3.prefixByBucket,
      s3SelectedObject: state.s3.selectedObject,
      pollingEnabled: state.polling.enabled,
    };
    window.sessionStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // noop
  }
}

function closeConfirmModal(value) {
  if (!els.confirmModal) return;
  els.confirmModal.classList.add("hidden");
  els.confirmModal.setAttribute("aria-hidden", "true");
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(value);
  }
}

function confirmDialog(message, title = "Confirm") {
  if (!els.confirmModal || !els.confirmModalTitle || !els.confirmModalMessage) {
    return Promise.resolve(window.confirm(message));
  }

  els.confirmModalTitle.textContent = title;
  els.confirmModalMessage.textContent = message;
  els.confirmModal.classList.remove("hidden");
  els.confirmModal.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    confirmResolve = resolve;
    if (els.confirmModalCancel) els.confirmModalCancel.focus();
  });
}

function joinUrl(base, path = "") {
  const cleanBase = base.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${path ? cleanPath : ""}`;
}

function encodeS3KeyForPath(key) {
  return key
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function parseXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Failed to parse XML response");
  }
  return doc;
}

function textContent(element, selector) {
  const node = element.querySelector(selector);
  return node ? node.textContent : "";
}

function toIsoFromEpochMs(value) {
  const ms = Number(value);
  if (Number.isNaN(ms) || !ms) return "";
  return new Date(ms).toISOString();
}

function parseMaybeJson(input) {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function locationKey(bucketName, prefix) {
  return `${bucketName}|${prefix}`;
}

function currentPrefixForBucket(bucketName) {
  return state.s3.prefixByBucket[bucketName] || "";
}

function setCurrentPrefix(bucketName, prefix) {
  state.s3.prefixByBucket[bucketName] = prefix;
}

function parentPrefix(prefix) {
  if (!prefix) return "";
  const parts = prefix.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return `${parts.slice(0, -1).join("/")}/`;
}

function objectUrl(bucketName, key) {
  const encodedKey = encodeS3KeyForPath(key);
  return `${joinUrl(API_CONFIG.baseUrl)}/${bucketName}/${encodedKey}`;
}

async function apiGetXml(path) {
  const response = await fetch(joinUrl(API_CONFIG.baseUrl, path), {
    method: "GET",
    headers: {
      Accept: "application/xml,text/xml,*/*",
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${path || "/"} failed (${response.status}): ${body.slice(0, 180)}`);
  }

  return parseXml(body);
}

async function sqsAction(action, params = {}) {
  const body = new URLSearchParams({
    Action: action,
    Version: API_CONFIG.sqsVersion,
    ...params,
  });

  const response = await fetch(joinUrl(API_CONFIG.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/xml,text/xml,*/*",
    },
    body: body.toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SQS ${action} failed (${response.status}): ${text.slice(0, 180)}`);
  }

  return parseXml(text);
}

function queueUrlToName(queueUrl) {
  return queueUrl.split("/").filter(Boolean).pop() || queueUrl;
}

function extractQueueUrl(queueName) {
  return `${joinUrl(API_CONFIG.baseUrl)}/${API_CONFIG.sqsAccountId}/${queueName}`;
}

function findQueueByName(queueName) {
  return state.sqs.queues.find((queue) => queue.name === queueName) || null;
}

async function loadQueues() {
  const doc = await sqsAction("ListQueues");
  const urls = Array.from(doc.querySelectorAll("QueueUrl")).map((n) => n.textContent || "");

  state.sqs.queues = urls.map((queueUrl) => ({
    name: queueUrlToName(queueUrl),
    queueUrl,
  }));

  state.sqs.messagesByQueue = {};
}

async function loadMessagesForQueue(queueName, options = {}) {
  if (!queueName) return;
  if (state.sqs.messagesByQueue[queueName] && !options.force) return;

  const queue = findQueueByName(queueName);
  const queueUrl = queue?.queueUrl || extractQueueUrl(queueName);
  const doc = await sqsAction("ReceiveMessage", {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: "10",
    VisibilityTimeout: "0",
    WaitTimeSeconds: "0",
    "AttributeName.1": "All",
    "MessageAttributeName.1": "All",
  });

  const messages = Array.from(doc.querySelectorAll("ReceiveMessageResult > Message")).map((messageNode) => {
    const messageId = textContent(messageNode, "MessageId") || "unknown-message";
    const body = textContent(messageNode, "Body");
    const sentTimestamp = Array.from(messageNode.querySelectorAll("Attribute")).find((attr) => {
      return textContent(attr, "Name") === "SentTimestamp";
    });

    const attrs = Array.from(messageNode.querySelectorAll("Attribute")).reduce((acc, attr) => {
      const key = textContent(attr, "Name");
      const value = textContent(attr, "Value");
      if (key) acc[key] = value;
      return acc;
    }, {});

    return {
      id: messageId,
      sentAt: toIsoFromEpochMs(sentTimestamp ? textContent(sentTimestamp, "Value") : ""),
      body: parseMaybeJson(body),
      raw: {
        messageId,
        receiptHandle: textContent(messageNode, "ReceiptHandle"),
        attributes: attrs,
        md5OfBody: textContent(messageNode, "MD5OfBody"),
      },
    };
  });

  state.sqs.messagesByQueue[queueName] = messages;
}

async function deleteMessage(queueName, receiptHandle) {
  const queue = findQueueByName(queueName);
  const queueUrl = queue?.queueUrl || extractQueueUrl(queueName);

  const response = await sqsAction("DeleteMessage", {
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  });

  return response;
}

async function loadBuckets() {
  const doc = await apiGetXml("");
  const buckets = Array.from(doc.querySelectorAll("Buckets > Bucket")).map((bucketNode) => ({
    name: textContent(bucketNode, "Name"),
    region: "ca-central-1",
    creationDate: textContent(bucketNode, "CreationDate"),
  }));

  state.s3.buckets = buckets;
  state.s3.entriesByLocation = {};
  state.s3.selectedObject = null;

  for (const bucket of buckets) {
    if (state.s3.prefixByBucket[bucket.name] === undefined) {
      state.s3.prefixByBucket[bucket.name] = "";
    }
  }
}

async function loadObjectsForBucketPrefix(bucketName, prefix) {
  if (!bucketName) return;
  const cacheKey = locationKey(bucketName, prefix);
  if (state.s3.entriesByLocation[cacheKey]) return;

  const query = new URLSearchParams({
    "list-type": "2",
    delimiter: "/",
    "max-keys": "200",
  });
  if (prefix) query.set("prefix", prefix);

  const doc = await apiGetXml(`/${bucketName}?${query.toString()}`);

  const folders = Array.from(doc.querySelectorAll("ListBucketResult > CommonPrefixes > Prefix")).map((node) => {
    const fullPrefix = node.textContent || "";
    const relativeName = fullPrefix.replace(prefix, "").replace(/\/$/, "");
    return {
      type: "folder",
      name: relativeName || fullPrefix,
      prefix: fullPrefix,
    };
  });

  const files = Array.from(doc.querySelectorAll("ListBucketResult > Contents"))
    .map((objectNode) => {
      const key = textContent(objectNode, "Key");
      if (!key || key === prefix) return null;
      const relativeName = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
      if (relativeName.includes("/")) return null;

      return {
        type: "file",
        key,
        name: relativeName || key,
        size: textContent(objectNode, "Size"),
        lastModified: textContent(objectNode, "LastModified"),
        etag: textContent(objectNode, "ETag"),
      };
    })
    .filter(Boolean);

  state.s3.entriesByLocation[cacheKey] = { folders, files };
}

async function deleteObject(bucketName, key) {
  const response = await fetch(objectUrl(bucketName, key), {
    method: "DELETE",
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Delete failed (${response.status}): ${body.slice(0, 180)}`);
  }
}

async function listAllKeysForPrefix(bucketName, prefix) {
  const keys = [];
  let continuationToken = "";

  while (true) {
    const query = new URLSearchParams({
      "list-type": "2",
      "max-keys": "1000",
      prefix,
    });
    if (continuationToken) query.set("continuation-token", continuationToken);

    const doc = await apiGetXml(`/${bucketName}?${query.toString()}`);
    const pageKeys = Array.from(doc.querySelectorAll("ListBucketResult > Contents > Key"))
      .map((node) => node.textContent || "")
      .filter(Boolean);
    keys.push(...pageKeys);

    const isTruncated = (textContent(doc, "ListBucketResult > IsTruncated") || "").toLowerCase() === "true";
    if (!isTruncated) break;

    continuationToken = textContent(doc, "ListBucketResult > NextContinuationToken");
    if (!continuationToken) break;
  }

  return keys;
}

async function deleteFolderPrefix(bucketName, prefix) {
  const keys = await listAllKeysForPrefix(bucketName, prefix);
  for (const key of keys) {
    await deleteObject(bucketName, key);
  }
  return keys.length;
}

function clearBucketCache(bucketName) {
  const bucketPrefix = `${bucketName}|`;
  for (const key of Object.keys(state.s3.entriesByLocation)) {
    if (key.startsWith(bucketPrefix)) {
      delete state.s3.entriesByLocation[key];
    }
  }
}

function setStatus(message, type = "info") {
  if (!message) {
    els.statusBanner.className = "status-banner hidden";
    els.statusBanner.textContent = "";
    return;
  }

  els.statusBanner.className = `status-banner ${type}`;
  els.statusBanner.textContent = message;
}

function setLoading(value) {
  state.loading = value;
  els.refreshBtn.disabled = value;
}

function scheduleNextPoll() {
  state.polling.nextPollAt = Date.now() + state.polling.intervalMs;
}

function setPollingEnabled(enabled) {
  state.polling.enabled = enabled;
  if (enabled) scheduleNextPoll();
  renderPollingUi();
}

function renderPollingUi() {
  if (els.pollToggleBtn) {
    els.pollToggleBtn.textContent = state.polling.enabled ? "Pause" : "Resume";
  }
  updatePollingProgress();
}

function updatePollingProgress() {
  if (!els.pollProgressFill) return;
  if (!state.polling.enabled || state.view !== "sqs") {
    els.pollProgressFill.style.width = "0%";
    return;
  }

  const remaining = Math.max(0, state.polling.nextPollAt - Date.now());
  const pct = ((state.polling.intervalMs - remaining) / state.polling.intervalMs) * 100;
  const clamped = Math.max(0, Math.min(100, pct));
  els.pollProgressFill.style.width = `${clamped}%`;
}

async function pollSelectedQueue() {
  if (state.view !== "sqs" || state.loading || state.polling.running) return;
  const queue = getFilteredQueues()[state.selectedQueue];
  if (!queue) return;

  state.polling.running = true;
  try {
    await loadMessagesForQueue(queue.name, { force: true });
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    state.polling.running = false;
    scheduleNextPoll();
    renderPollingUi();
  }
}

function render() {
  const isSqs = state.view === "sqs";
  els.title.textContent = isSqs ? "SQS Explorer" : "S3 Explorer";
  els.sqsView.classList.toggle("hidden", !isSqs);
  els.s3View.classList.toggle("hidden", isSqs);

  els.navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === state.view);
  });

  if (isSqs) {
    renderQueues();
    renderMessages();
    renderMessageDetail();
  } else {
    renderBuckets();
    renderObjects();
    renderObjectDetail();
  }

  renderPollingUi();
  persistUiState();
}

function textMatch(value) {
  return String(value).toLowerCase().includes(state.search.toLowerCase());
}

function getFilteredQueues() {
  return state.sqs.queues.filter((q) => textMatch(q.name));
}

function getFilteredBuckets() {
  return state.s3.buckets;
}

function getSelectedBucket() {
  const buckets = getFilteredBuckets();
  if (!buckets.length) return null;
  state.selectedBucket = Math.min(state.selectedBucket, buckets.length - 1);
  return buckets[state.selectedBucket];
}

function renderQueues() {
  const queues = getFilteredQueues();
  if (!queues.length) {
    els.queueList.innerHTML = '<li class="list-empty">No queues found.</li>';
    els.messageList.innerHTML = '<li class="list-empty">No messages available.</li>';
    els.messageDetail.textContent = "Select a message.";
    return;
  }

  state.selectedQueue = Math.min(state.selectedQueue, queues.length - 1);
  els.queueList.innerHTML = queues
    .map((queue, index) => {
      const isActive = index === state.selectedQueue ? "active" : "";
      return `<li class=\"list-item ${isActive}\" data-queue-index=\"${index}\">${queue.name}</li>`;
    })
    .join("");
}

function renderMessages() {
  const queues = getFilteredQueues();
  const queue = queues[state.selectedQueue];
  const messages = queue ? state.sqs.messagesByQueue[queue.name] || [] : [];

  if (!queue || !messages.length) {
    els.messageList.innerHTML = '<li class="list-empty">No messages available.</li>';
    return;
  }

  state.selectedMessage = Math.min(state.selectedMessage, messages.length - 1);
  els.messageList.innerHTML = messages
    .map((msg, index) => {
      const isActive = index === state.selectedMessage ? "active" : "";
      const ts = msg.sentAt ? `<br /><small>${msg.sentAt}</small>` : "";
      return `<li class=\"list-item ${isActive}\" data-message-index=\"${index}\">${msg.id}${ts}</li>`;
    })
    .join("");
}

function renderMessageDetail() {
  const queues = getFilteredQueues();
  const queue = queues[state.selectedQueue];
  const messages = queue ? state.sqs.messagesByQueue[queue.name] || [] : [];
  const message = messages[state.selectedMessage];

  if (els.deleteMessageBtn) {
    const canDelete = Boolean(message?.raw?.receiptHandle && queue?.name);
    els.deleteMessageBtn.disabled = !canDelete;
  }

  if (!message) {
    els.messageDetail.textContent = "Select a message.";
    return;
  }

  els.messageDetail.textContent = JSON.stringify(
    {
      queue: queue.name,
      queueUrl: queue.queueUrl || extractQueueUrl(queue.name),
      message,
    },
    null,
    2
  );
}

function renderBuckets() {
  const buckets = getFilteredBuckets();
  if (!buckets.length) {
    els.bucketList.innerHTML = '<li class="list-empty">No buckets found.</li>';
    els.objectList.innerHTML = '<li class="list-empty">No objects available.</li>';
    els.objectDetail.textContent = "Select an object.";
    if (els.objectPath) els.objectPath.textContent = "";
    if (els.objectUpBtn) els.objectUpBtn.disabled = true;
    return;
  }

  state.selectedBucket = Math.min(state.selectedBucket, buckets.length - 1);
  els.bucketList.innerHTML = buckets
    .map((bucket, index) => {
      const isActive = index === state.selectedBucket ? "active" : "";
      const region = bucket.region ? `<br /><small>${bucket.region}</small>` : "";
      return `<li class=\"list-item ${isActive}\" data-bucket-index=\"${index}\">${bucket.name}${region}</li>`;
    })
    .join("");
}

function renderObjectPath(prefix) {
  if (!els.objectPath) return;

  if (!prefix) {
    els.objectPath.innerHTML = '<button class="path-link" type="button" data-path-prefix="">root</button>';
    return;
  }

  const parts = prefix.split("/").filter(Boolean);
  const chunks = ['<button class="path-link" type="button" data-path-prefix="">root</button>'];

  let running = "";
  for (const part of parts) {
    running += `${part}/`;
    chunks.push(" /");
    chunks.push(`<button class=\"path-link\" type=\"button\" data-path-prefix=\"${running}\">${part}</button>`);
  }

  els.objectPath.innerHTML = chunks.join(" ");
}

function renderObjects() {
  const bucket = getSelectedBucket();
  if (!bucket) {
    els.objectList.innerHTML = '<li class="list-empty">No objects available.</li>';
    return;
  }

  const prefix = currentPrefixForBucket(bucket.name);
  const listing = state.s3.entriesByLocation[locationKey(bucket.name, prefix)] || { folders: [], files: [] };

  renderObjectPath(prefix);
  if (els.objectUpBtn) {
    els.objectUpBtn.disabled = !prefix;
    els.objectUpBtn.dataset.parentPrefix = parentPrefix(prefix);
  }

  const searchTerm = state.search.trim().toLowerCase();
  const filteredFolders = !searchTerm
    ? listing.folders
    : listing.folders.filter((folder) => {
        return folder.name.toLowerCase().includes(searchTerm) || folder.prefix.toLowerCase().includes(searchTerm);
      });
  const filteredFiles = !searchTerm
    ? listing.files
    : listing.files.filter((file) => {
        return file.name.toLowerCase().includes(searchTerm) || file.key.toLowerCase().includes(searchTerm);
      });

  if (!filteredFolders.length && !filteredFiles.length) {
    els.objectList.innerHTML = searchTerm
      ? '<li class="list-empty">No objects or folders match search.</li>'
      : '<li class="list-empty">No objects or folders in this path.</li>';
    return;
  }

  const folderRows = filteredFolders.map(
    (folder) =>
      `<li class=\"list-item folder\" data-folder-prefix=\"${folder.prefix}\"><div class=\"s3-row\"><span class=\"s3-row-main\">📁 ${folder.name}</span><span class=\"s3-row-actions\"><button class=\"path-btn danger row-action-btn\" type=\"button\" data-delete-folder-prefix=\"${folder.prefix}\">Delete</button></span></div></li>`
  );

  const fileRows = filteredFiles.map((file, index) => {
    const isActive =
      state.s3.selectedObject &&
      state.s3.selectedObject.bucket === bucket.name &&
      state.s3.selectedObject.key === file.key
        ? "active"
        : "";

    return `<li class=\"list-item ${isActive}\" data-file-index=\"${index}\" data-file-key=\"${file.key}\"><div class=\"s3-row\"><span class=\"s3-row-main\">📄 ${file.name}</span><span class=\"s3-row-actions\"><button class=\"path-btn row-action-btn\" type=\"button\" data-open-file-key=\"${file.key}\">Open</button><button class=\"path-btn danger row-action-btn\" type=\"button\" data-delete-file-key=\"${file.key}\">Delete</button></span></div></li>`;
  });

  els.objectList.innerHTML = [...folderRows, ...fileRows].join("");
}

function renderObjectDetail() {
  const selected = state.s3.selectedObject;
  const hasObject = Boolean(selected && selected.key);

  if (!hasObject) {
    els.objectDetail.textContent = "Select an object.";
    return;
  }

  els.objectDetail.textContent = JSON.stringify(
    {
      bucket: selected.bucket,
      object: {
        key: selected.key,
        size: selected.size,
        lastModified: selected.lastModified,
        etag: selected.etag,
      },
      objectUrl: objectUrl(selected.bucket, selected.key),
    },
    null,
    2
  );
}

async function refreshCurrentView() {
  try {
    setLoading(true);
    setStatus(state.view === "sqs" ? "Loading SQS data..." : "Loading S3 data...", "info");

    if (state.view === "sqs") {
      await loadQueues();
      const queues = getFilteredQueues();
      if (queues.length) {
        state.selectedQueue = Math.min(state.selectedQueue, queues.length - 1);
        const queue = queues[state.selectedQueue];
        await loadMessagesForQueue(queue.name, { force: true });
        const messages = state.sqs.messagesByQueue[queue.name] || [];
        state.selectedMessage = messages.length ? Math.min(state.selectedMessage, messages.length - 1) : 0;
      } else {
        state.selectedQueue = 0;
        state.selectedMessage = 0;
      }
      scheduleNextPoll();
      setStatus(`Loaded ${state.sqs.queues.length} queue(s).`, "info");
    } else {
      await loadBuckets();
      const buckets = getFilteredBuckets();
      if (buckets.length) {
        state.selectedBucket = Math.min(state.selectedBucket, buckets.length - 1);
      } else {
        state.selectedBucket = 0;
      }
      const bucket = buckets[state.selectedBucket];
      if (bucket) {
        const prefix = currentPrefixForBucket(bucket.name);
        await loadObjectsForBucketPrefix(bucket.name, prefix);
      }
      setStatus(`Loaded ${state.s3.buckets.length} bucket(s).`, "info");
    }
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
    render();
  }
}

async function ensureMessagesLoadedForSelection() {
  const queue = getFilteredQueues()[state.selectedQueue];
  if (!queue) return;

  try {
    setLoading(true);
    await loadMessagesForQueue(queue.name);
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function ensureObjectsLoadedForSelection() {
  const bucket = getSelectedBucket();
  if (!bucket) return;

  const prefix = currentPrefixForBucket(bucket.name);

  try {
    setLoading(true);
    await loadObjectsForBucketPrefix(bucket.name, prefix);
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function navigateToPrefix(prefix) {
  const bucket = getSelectedBucket();
  if (!bucket) return;

  try {
    setLoading(true);
    setCurrentPrefix(bucket.name, prefix);
    state.s3.selectedObject = null;
    await loadObjectsForBucketPrefix(bucket.name, prefix);
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  els.navButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (state.view === btn.dataset.view) return;

      state.view = btn.dataset.view;
      state.search = "";
      els.search.value = "";
      render();
      await refreshCurrentView();
    });
  });

  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    if (state.view === "sqs") {
      state.selectedQueue = 0;
      state.selectedMessage = 0;
    } else {
      state.s3.selectedObject = null;
    }
    render();
  });

  if (els.pollToggleBtn) {
    els.pollToggleBtn.addEventListener("click", () => {
      setPollingEnabled(!state.polling.enabled);
    });
  }

  if (els.themeToggleBtn) {
    els.themeToggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  if (els.deleteMessageBtn) {
    els.deleteMessageBtn.addEventListener("click", async () => {
      const queue = getFilteredQueues()[state.selectedQueue];
      const messages = queue ? state.sqs.messagesByQueue[queue.name] || [] : [];
      const message = messages[state.selectedMessage];
      const initialReceiptHandle = message?.raw?.receiptHandle;
      const messageId = message?.id;

      if (!queue || !message || !initialReceiptHandle || !messageId) return;

      const confirmed = await confirmDialog(`Delete message ${message.id} from ${queue.name}?`, "Delete Message");
      if (!confirmed) return;

      try {
        setLoading(true);
        // Receipt handles are ephemeral and can change on every ReceiveMessage call,
        // so refresh immediately before deleting and prefer the freshest handle.
        await loadMessagesForQueue(queue.name, { force: true });
        const latestMessages = state.sqs.messagesByQueue[queue.name] || [];
        const latestMatch = latestMessages.find((msg) => msg.id === messageId);
        const freshReceiptHandle = latestMatch?.raw?.receiptHandle || initialReceiptHandle;

        await deleteMessage(queue.name, freshReceiptHandle);
        await loadMessagesForQueue(queue.name, { force: true });
        state.selectedMessage = 0;
        setStatus(`Deleted message ${message.id}`, "info");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setLoading(false);
        render();
      }
    });
  }

  els.refreshBtn.addEventListener("click", async () => {
    if (state.view === "sqs") {
      state.sqs.messagesByQueue = {};
    } else {
      state.s3.entriesByLocation = {};
      state.s3.selectedObject = null;
    }
    await refreshCurrentView();
  });

  if (els.objectUpBtn) {
    els.objectUpBtn.addEventListener("click", async () => {
      const nextPrefix = els.objectUpBtn.dataset.parentPrefix || "";
      await navigateToPrefix(nextPrefix);
    });
  }

  if (els.confirmModal) {
    els.confirmModal.addEventListener("click", (event) => {
      if (event.target === els.confirmModal) {
        closeConfirmModal(false);
      }
    });
  }

  if (els.confirmModalCancel) {
    els.confirmModalCancel.addEventListener("click", () => closeConfirmModal(false));
  }

  if (els.confirmModalConfirm) {
    els.confirmModalConfirm.addEventListener("click", () => closeConfirmModal(true));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.confirmModal && !els.confirmModal.classList.contains("hidden")) {
      closeConfirmModal(false);
    }
  });

  document.body.addEventListener("click", async (event) => {
    const queueEl = event.target.closest("[data-queue-index]");
    const messageEl = event.target.closest("[data-message-index]");
    const bucketEl = event.target.closest("[data-bucket-index]");
    const openFileEl = event.target.closest("[data-open-file-key]");
    const deleteFolderEl = event.target.closest("[data-delete-folder-prefix]");
    const deleteFileEl = event.target.closest("[data-delete-file-key]");
    const folderEl = event.target.closest("[data-folder-prefix]");
    const fileEl = event.target.closest("[data-file-index]");
    const pathEl = event.target.closest("[data-path-prefix]");

    if (queueEl) {
      state.selectedQueue = Number(queueEl.dataset.queueIndex);
      state.selectedMessage = 0;
      render();
      await ensureMessagesLoadedForSelection();
      return;
    }

    if (messageEl) {
      state.selectedMessage = Number(messageEl.dataset.messageIndex);
      render();
      return;
    }

    if (bucketEl) {
      state.selectedBucket = Number(bucketEl.dataset.bucketIndex);
      state.s3.selectedObject = null;
      const bucket = getSelectedBucket();
      if (bucket) {
        if (state.s3.prefixByBucket[bucket.name] === undefined) {
          setCurrentPrefix(bucket.name, "");
        }
      }
      render();
      await ensureObjectsLoadedForSelection();
      return;
    }

    if (deleteFolderEl && state.view === "s3") {
      const bucket = getSelectedBucket();
      if (!bucket) return;

      const folderPrefix = deleteFolderEl.dataset.deleteFolderPrefix || "";
      if (!folderPrefix) return;

      const confirmed = await confirmDialog(`Delete all keys under ${folderPrefix}?`, "Delete Folder");
      if (!confirmed) return;

      try {
        setLoading(true);
        const deletedCount = await deleteFolderPrefix(bucket.name, folderPrefix);
        clearBucketCache(bucket.name);
        state.s3.selectedObject = null;
        await loadObjectsForBucketPrefix(bucket.name, currentPrefixForBucket(bucket.name));
        setStatus(`Deleted ${deletedCount} key(s) in ${folderPrefix}`, "info");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setLoading(false);
        render();
      }
      return;
    }

    if (deleteFileEl && state.view === "s3") {
      const bucket = getSelectedBucket();
      if (!bucket) return;
      const key = deleteFileEl.dataset.deleteFileKey || "";
      if (!key) return;

      const confirmed = await confirmDialog(`Delete ${key} from ${bucket.name}?`, "Delete Object");
      if (!confirmed) return;

      try {
        setLoading(true);
        await deleteObject(bucket.name, key);
        clearBucketCache(bucket.name);
        if (state.s3.selectedObject?.key === key) state.s3.selectedObject = null;
        const prefix = currentPrefixForBucket(bucket.name);
        await loadObjectsForBucketPrefix(bucket.name, prefix);
        setStatus(`Deleted ${key}`, "info");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setLoading(false);
        render();
      }
      return;
    }

    if (openFileEl && state.view === "s3") {
      const bucket = getSelectedBucket();
      if (!bucket) return;
      const key = openFileEl.dataset.openFileKey || "";
      if (!key) return;
      window.open(objectUrl(bucket.name, key), "_blank", "noopener");
      return;
    }

    if (pathEl && state.view === "s3") {
      await navigateToPrefix(pathEl.dataset.pathPrefix || "");
      return;
    }

    if (folderEl && state.view === "s3") {
      await navigateToPrefix(folderEl.dataset.folderPrefix || "");
      return;
    }

    if (fileEl && state.view === "s3") {
      const bucket = getSelectedBucket();
      if (!bucket) return;

      const prefix = currentPrefixForBucket(bucket.name);
      const listing = state.s3.entriesByLocation[locationKey(bucket.name, prefix)] || { files: [] };
      const idx = Number(fileEl.dataset.fileIndex);
      const file = listing.files[idx];
      if (!file) return;

      state.s3.selectedObject = {
        bucket: bucket.name,
        ...file,
      };
      render();
    }
  });
}

function startPollingLoop() {
  window.setInterval(async () => {
    updatePollingProgress();

    if (!state.polling.enabled || state.view !== "sqs") return;
    if (state.polling.running || state.loading) return;
    if (Date.now() < state.polling.nextPollAt) return;

    await pollSelectedQueue();
  }, 200);
}

applyLoadedUiState(loadUiState());
if (els.search) {
  els.search.value = state.search;
}

bindEvents();
applyTheme(resolveInitialTheme());
startPollingLoop();
render();
refreshCurrentView();
