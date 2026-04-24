const API_CONFIG = {
  baseUrl: window.FLOCI_API_BASE_URL || `${window.location.origin}/floci`,
  sqsAccountId: window.FLOCI_SQS_ACCOUNT_ID || "000000000000",
  sqsVersion: "2012-11-05",
  sqsPollMs: Number(window.FLOCI_SQS_POLL_MS || 5000),
};
const THEME_STORAGE_KEY = "floci_theme";

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
  openObjectBtn: document.getElementById("open-object-btn"),
  deleteObjectBtn: document.getElementById("delete-object-btn"),
};

state.polling.intervalMs = API_CONFIG.sqsPollMs > 0 ? API_CONFIG.sqsPollMs : 5000;
state.polling.nextPollAt = Date.now() + state.polling.intervalMs;

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
}

function textMatch(value) {
  return String(value).toLowerCase().includes(state.search.toLowerCase());
}

function getFilteredQueues() {
  return state.sqs.queues.filter((q) => textMatch(q.name));
}

function getFilteredBuckets() {
  return state.s3.buckets.filter((b) => textMatch(b.name));
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

  if (!listing.folders.length && !listing.files.length) {
    els.objectList.innerHTML = '<li class="list-empty">No objects or folders in this path.</li>';
    return;
  }

  const folderRows = listing.folders.map(
    (folder) => `<li class=\"list-item folder\" data-folder-prefix=\"${folder.prefix}\">📁 ${folder.name}</li>`
  );

  const fileRows = listing.files.map((file, index) => {
    const isActive =
      state.s3.selectedObject &&
      state.s3.selectedObject.bucket === bucket.name &&
      state.s3.selectedObject.key === file.key
        ? "active"
        : "";

    return `<li class=\"list-item ${isActive}\" data-file-index=\"${index}\">📄 ${file.name}</li>`;
  });

  els.objectList.innerHTML = [...folderRows, ...fileRows].join("");
}

function renderObjectDetail() {
  const selected = state.s3.selectedObject;
  const hasObject = Boolean(selected && selected.key);

  if (els.openObjectBtn) els.openObjectBtn.disabled = !hasObject;
  if (els.deleteObjectBtn) els.deleteObjectBtn.disabled = !hasObject;

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
      state.selectedQueue = 0;
      state.selectedMessage = 0;
      const queue = getFilteredQueues()[0];
      if (queue) await loadMessagesForQueue(queue.name, { force: true });
      scheduleNextPoll();
      setStatus(`Loaded ${state.sqs.queues.length} queue(s).`, "info");
    } else {
      await loadBuckets();
      state.selectedBucket = 0;
      const bucket = getSelectedBucket();
      if (bucket) {
        setCurrentPrefix(bucket.name, "");
        await loadObjectsForBucketPrefix(bucket.name, "");
      }
      state.s3.selectedObject = null;
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
    state.selectedQueue = 0;
    state.selectedBucket = 0;
    state.selectedMessage = 0;
    state.s3.selectedObject = null;
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
      const receiptHandle = message?.raw?.receiptHandle;

      if (!queue || !message || !receiptHandle) return;

      const confirmed = window.confirm(`Delete message ${message.id} from ${queue.name}?`);
      if (!confirmed) return;

      try {
        setLoading(true);
        await deleteMessage(queue.name, receiptHandle);
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

  if (els.openObjectBtn) {
    els.openObjectBtn.addEventListener("click", () => {
      if (!state.s3.selectedObject) return;
      window.open(objectUrl(state.s3.selectedObject.bucket, state.s3.selectedObject.key), "_blank", "noopener");
    });
  }

  if (els.deleteObjectBtn) {
    els.deleteObjectBtn.addEventListener("click", async () => {
      const selected = state.s3.selectedObject;
      if (!selected) return;

      const confirmed = window.confirm(`Delete ${selected.key} from ${selected.bucket}?`);
      if (!confirmed) return;

      try {
        setLoading(true);
        await deleteObject(selected.bucket, selected.key);

        const prefix = currentPrefixForBucket(selected.bucket);
        delete state.s3.entriesByLocation[locationKey(selected.bucket, prefix)];
        state.s3.selectedObject = null;
        await loadObjectsForBucketPrefix(selected.bucket, prefix);
        setStatus(`Deleted ${selected.key}`, "info");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setLoading(false);
        render();
      }
    });
  }

  document.body.addEventListener("click", async (event) => {
    const queueEl = event.target.closest("[data-queue-index]");
    const messageEl = event.target.closest("[data-message-index]");
    const bucketEl = event.target.closest("[data-bucket-index]");
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

bindEvents();
applyTheme(resolveInitialTheme());
startPollingLoop();
render();
refreshCurrentView();
