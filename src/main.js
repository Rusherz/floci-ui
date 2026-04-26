import { API_CONFIG, STORAGE_KEYS, VIEWS, createInitialState } from "./config.js";
import { getElements } from "./dom.js";
import { applyLoadedUiState, applyTheme, loadUiState, persistUiState, resolveInitialTheme } from "./storage.js";
import { createApiClient } from "./api.js";
import { createSqsService } from "./sqs.js";
import { createS3Service } from "./s3.js";
import { locationKey, parentPrefix } from "./utils.js";

const state = createInitialState();
const els = getElements();
const api = createApiClient(API_CONFIG);
const sqs = createSqsService({ state, api, config: API_CONFIG });
const s3 = createS3Service({ state, api });

let confirmResolve = null;

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
    if (els.confirmModalCancel) {
      els.confirmModalCancel.focus();
    }
  });
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
  if (els.refreshBtn) {
    els.refreshBtn.disabled = value;
  }
}

function clearS3SearchState({ incrementRequestId = false } = {}) {
  state.s3.searchResults = null;
  state.s3.searchLoading = false;
  if (incrementRequestId) {
    state.s3.searchRequestId += 1;
  }
}

function scheduleNextPoll() {
  state.polling.nextPollAt = Date.now() + state.polling.intervalMs;
}

function setPollingEnabled(enabled) {
  state.polling.enabled = enabled;
  if (enabled) {
    scheduleNextPoll();
  }
  renderPollingUi();
}

function updatePollingProgress() {
  if (!els.pollProgressFill) return;

  if (!state.polling.enabled || state.view !== VIEWS.sqs) {
    els.pollProgressFill.style.width = "0%";
    return;
  }

  const remaining = Math.max(0, state.polling.nextPollAt - Date.now());
  const pct = ((state.polling.intervalMs - remaining) / state.polling.intervalMs) * 100;
  const clamped = Math.max(0, Math.min(100, pct));
  els.pollProgressFill.style.width = `${clamped}%`;
}

function renderPollingUi() {
  if (els.pollToggleBtn) {
    els.pollToggleBtn.textContent = state.polling.enabled ? "Pause" : "Resume";
  }
  updatePollingProgress();
}

function getFilteredQueues() {
  return sqs.getFilteredQueues(state.search);
}

function getSelectedBucket() {
  return s3.getSelectedBucket();
}

function renderQueues() {
  const queues = getFilteredQueues();
  if (!queues.length) {
    els.queueList.innerHTML = '<li class="list-empty">No queues found.</li>';
    els.messageList.innerHTML = '<li class="list-empty">No messages available.</li>';
    els.messageDetail.textContent = "Select a message.";
    return;
  }

  state.selectedQueue = Math.max(0, Math.min(state.selectedQueue, queues.length - 1));
  els.queueList.innerHTML = queues
    .map((queue, index) => {
      const isActive = index === state.selectedQueue ? "active" : "";
      return `<li class="list-item ${isActive}" data-queue-index="${index}">${queue.name}</li>`;
    })
    .join("");
}

function renderMessages() {
  const queue = getFilteredQueues()[state.selectedQueue];
  const messages = queue ? state.sqs.messagesByQueue[queue.name] || [] : [];

  if (!queue || !messages.length) {
    els.messageList.innerHTML = '<li class="list-empty">No messages available.</li>';
    return;
  }

  state.selectedMessage = Math.max(0, Math.min(state.selectedMessage, messages.length - 1));
  els.messageList.innerHTML = messages
    .map((message, index) => {
      const isActive = index === state.selectedMessage ? "active" : "";
      const sentAt = message.sentAt ? `<br /><small>${message.sentAt}</small>` : "";
      return `<li class="list-item ${isActive}" data-message-index="${index}">${message.id}${sentAt}</li>`;
    })
    .join("");
}

function renderMessageDetail() {
  const queue = getFilteredQueues()[state.selectedQueue];
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
      queueUrl: queue.queueUrl || sqs.extractQueueUrl(queue.name),
      message,
    },
    null,
    2
  );
}

function renderBuckets() {
  const buckets = s3.getFilteredBuckets();
  if (!buckets.length) {
    els.bucketList.innerHTML = '<li class="list-empty">No buckets found.</li>';
    els.objectList.innerHTML = '<li class="list-empty">No objects available.</li>';
    els.objectDetail.textContent = "Select an object.";
    if (els.objectPath) {
      els.objectPath.textContent = "";
    }
    if (els.objectUpBtn) {
      els.objectUpBtn.disabled = true;
    }
    return;
  }

  state.selectedBucket = Math.max(0, Math.min(state.selectedBucket, buckets.length - 1));
  els.bucketList.innerHTML = buckets
    .map((bucket, index) => {
      const isActive = index === state.selectedBucket ? "active" : "";
      const region = bucket.region ? `<br /><small>${bucket.region}</small>` : "";
      return `<li class="list-item ${isActive}" data-bucket-index="${index}">${bucket.name}${region}</li>`;
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

  let runningPrefix = "";
  for (const part of parts) {
    runningPrefix += `${part}/`;
    chunks.push(" /");
    chunks.push(`<button class="path-link" type="button" data-path-prefix="${runningPrefix}">${part}</button>`);
  }

  els.objectPath.innerHTML = chunks.join(" ");
}

function renderObjects() {
  const bucket = getSelectedBucket();
  if (!bucket) {
    els.objectList.innerHTML = '<li class="list-empty">No objects available.</li>';
    return;
  }

  const prefix = s3.currentPrefixForBucket(bucket.name);
  const listing = state.s3.entriesByLocation[locationKey(bucket.name, prefix)] || { folders: [], files: [] };

  renderObjectPath(prefix);
  if (els.objectUpBtn) {
    els.objectUpBtn.disabled = !prefix;
    els.objectUpBtn.dataset.parentPrefix = parentPrefix(prefix);
  }

  const searchTerm = state.search.trim();
  const normalizedPathQuery = searchTerm.replace(/^\/+/, "");
  const isPathSearch = normalizedPathQuery.includes("/");

  let filteredFolders = listing.folders;
  let filteredFiles = listing.files;

  if (searchTerm) {
    if (isPathSearch) {
      if (
        state.s3.searchResults &&
        state.s3.searchResults.bucket === bucket.name &&
        state.s3.searchResults.query === normalizedPathQuery
      ) {
        filteredFolders = state.s3.searchResults.folders;
        filteredFiles = state.s3.searchResults.files;
      } else if (state.s3.searchLoading) {
        els.objectList.innerHTML = '<li class="list-empty">Searching…</li>';
        return;
      } else {
        void runS3SearchForCurrentBucket();
        els.objectList.innerHTML = '<li class="list-empty">Searching…</li>';
        return;
      }
    } else {
      const query = searchTerm.toLowerCase();
      filteredFolders = listing.folders.filter((folder) => folder.name.toLowerCase().startsWith(query));
      filteredFiles = listing.files.filter((file) => file.name.toLowerCase().startsWith(query));
    }
  }

  state.s3.renderedFilesByKey = {};
  for (const file of filteredFiles) {
    state.s3.renderedFilesByKey[file.key] = file;
  }

  if (!filteredFolders.length && !filteredFiles.length) {
    els.objectList.innerHTML = searchTerm
      ? '<li class="list-empty">No objects or folders match search.</li>'
      : '<li class="list-empty">No objects or folders in this path.</li>';
    return;
  }

  const folderRows = filteredFolders.map(
    (folder) =>
      `<li class="list-item folder" data-folder-prefix="${folder.prefix}"><div class="s3-row"><span class="s3-row-main">📁 ${folder.name}</span><span class="s3-row-actions"><button class="path-btn danger row-action-btn" type="button" data-delete-folder-prefix="${folder.prefix}">Delete</button></span></div></li>`
  );

  const fileRows = filteredFiles.map((file, index) => {
    const isActive =
      state.s3.selectedObject &&
      state.s3.selectedObject.bucket === bucket.name &&
      state.s3.selectedObject.key === file.key
        ? "active"
        : "";

    return `<li class="list-item ${isActive}" data-file-index="${index}" data-file-key="${file.key}"><div class="s3-row"><span class="s3-row-main">📄 ${file.name}</span><span class="s3-row-actions"><button class="path-btn row-action-btn" type="button" data-open-file-key="${file.key}">Open</button><button class="path-btn danger row-action-btn" type="button" data-delete-file-key="${file.key}">Delete</button></span></div></li>`;
  });

  els.objectList.innerHTML = [...folderRows, ...fileRows].join("");
}

function renderObjectDetail() {
  const selectedObject = state.s3.selectedObject;
  const hasObject = Boolean(selectedObject && selectedObject.key);

  if (!hasObject) {
    els.objectDetail.textContent = "Select an object.";
    return;
  }

  els.objectDetail.textContent = JSON.stringify(
    {
      bucket: selectedObject.bucket,
      object: {
        key: selectedObject.key,
        size: selectedObject.size,
        lastModified: selectedObject.lastModified,
        etag: selectedObject.etag,
      },
      objectUrl: api.objectUrl(selectedObject.bucket, selectedObject.key),
    },
    null,
    2
  );
}

function render() {
  const isSqsView = state.view === VIEWS.sqs;

  els.title.textContent = isSqsView ? "SQS Explorer" : "S3 Explorer";
  els.sqsView.classList.toggle("hidden", !isSqsView);
  els.s3View.classList.toggle("hidden", isSqsView);

  els.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });

  if (isSqsView) {
    renderQueues();
    renderMessages();
    renderMessageDetail();
  } else {
    renderBuckets();
    renderObjects();
    renderObjectDetail();
  }

  renderPollingUi();
  persistUiState(state, STORAGE_KEYS.uiState);
}

async function runS3SearchForCurrentBucket() {
  const queryRaw = state.search.trim();
  if (!queryRaw || state.view !== VIEWS.s3) {
    clearS3SearchState();
    return;
  }

  const bucket = getSelectedBucket();
  if (!bucket) {
    clearS3SearchState();
    return;
  }

  const query = queryRaw.replace(/^\/+/, "");
  if (!query.includes("/")) {
    clearS3SearchState();
    return;
  }

  const requestId = ++state.s3.searchRequestId;
  state.s3.searchLoading = true;
  render();

  try {
    let folders = [];
    let files = [];

    if (query.endsWith("/")) {
      await s3.loadObjectsForBucketPrefix(bucket.name, query);
      const listing = s3.getListing(bucket.name, query);
      folders = listing.folders;
      files = listing.files;
    } else {
      const slashIndex = query.lastIndexOf("/");
      const parent = slashIndex >= 0 ? query.slice(0, slashIndex + 1) : "";
      const leaf = slashIndex >= 0 ? query.slice(slashIndex + 1) : query;
      const leafLower = leaf.toLowerCase();

      await s3.loadObjectsForBucketPrefix(bucket.name, parent);
      const listing = s3.getListing(bucket.name, parent);

      folders = listing.folders.filter((folder) => folder.name.toLowerCase().startsWith(leafLower));
      files = listing.files.filter((file) => file.name.toLowerCase().startsWith(leafLower));
    }

    if (requestId !== state.s3.searchRequestId) {
      return;
    }

    state.s3.searchResults = {
      bucket: bucket.name,
      query,
      folders,
      files,
    };
  } catch (error) {
    if (requestId !== state.s3.searchRequestId) {
      return;
    }
    setStatus(error.message, "error");
  } finally {
    if (requestId === state.s3.searchRequestId) {
      state.s3.searchLoading = false;
      render();
    }
  }
}

async function refreshCurrentView() {
  try {
    setLoading(true);
    setStatus(state.view === VIEWS.sqs ? "Loading SQS data..." : "Loading S3 data...", "info");

    if (state.view === VIEWS.sqs) {
      await sqs.loadQueues();
      const queues = getFilteredQueues();

      if (queues.length) {
        state.selectedQueue = Math.max(0, Math.min(state.selectedQueue, queues.length - 1));
        const selectedQueue = queues[state.selectedQueue];
        await sqs.loadMessagesForQueue(selectedQueue.name, { force: true });

        const messages = state.sqs.messagesByQueue[selectedQueue.name] || [];
        state.selectedMessage = messages.length ? Math.max(0, Math.min(state.selectedMessage, messages.length - 1)) : 0;
      } else {
        state.selectedQueue = 0;
        state.selectedMessage = 0;
      }

      scheduleNextPoll();
      setStatus(`Loaded ${state.sqs.queues.length} queue(s).`, "info");
      return;
    }

    await s3.loadBuckets();
    const buckets = s3.getFilteredBuckets();
    state.selectedBucket = buckets.length ? Math.max(0, Math.min(state.selectedBucket, buckets.length - 1)) : 0;

    const bucket = buckets[state.selectedBucket];
    if (bucket) {
      const prefix = s3.currentPrefixForBucket(bucket.name);
      await s3.loadObjectsForBucketPrefix(bucket.name, prefix);
    }

    setStatus(`Loaded ${state.s3.buckets.length} bucket(s).`, "info");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
    render();
  }
}

async function ensureMessagesLoadedForSelection() {
  const selectedQueue = getFilteredQueues()[state.selectedQueue];
  if (!selectedQueue) return;

  try {
    setLoading(true);
    await sqs.loadMessagesForQueue(selectedQueue.name);
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

  const prefix = s3.currentPrefixForBucket(bucket.name);

  try {
    setLoading(true);
    await s3.loadObjectsForBucketPrefix(bucket.name, prefix);
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
    s3.setCurrentPrefix(bucket.name, prefix);
    state.s3.selectedObject = null;
    await s3.loadObjectsForBucketPrefix(bucket.name, prefix);
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function pollSelectedQueue() {
  if (state.view !== VIEWS.sqs || state.loading || state.polling.running) return;

  const queue = getFilteredQueues()[state.selectedQueue];
  if (!queue) return;

  state.polling.running = true;
  try {
    await sqs.loadMessagesForQueue(queue.name, { force: true });
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    state.polling.running = false;
    scheduleNextPoll();
    renderPollingUi();
  }
}

async function handleDeleteMessage() {
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

    // Receipt handles are ephemeral and can change on every ReceiveMessage call.
    await sqs.loadMessagesForQueue(queue.name, { force: true });

    const latestMessages = state.sqs.messagesByQueue[queue.name] || [];
    const latestMatch = latestMessages.find((candidate) => candidate.id === messageId);
    const freshReceiptHandle = latestMatch?.raw?.receiptHandle || initialReceiptHandle;

    await sqs.deleteMessage(queue.name, freshReceiptHandle);
    await sqs.loadMessagesForQueue(queue.name, { force: true });

    state.selectedMessage = 0;
    setStatus(`Deleted message ${message.id}`, "info");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
    render();
  }
}

async function handleDeleteFolder(folderPrefix) {
  const bucket = getSelectedBucket();
  if (!bucket || !folderPrefix) return;

  const confirmed = await confirmDialog(`Delete all keys under ${folderPrefix}?`, "Delete Folder");
  if (!confirmed) return;

  try {
    setLoading(true);
    const deletedCount = await s3.deleteFolderPrefix(bucket.name, folderPrefix);
    s3.clearBucketCache(bucket.name);
    state.s3.selectedObject = null;
    await s3.loadObjectsForBucketPrefix(bucket.name, s3.currentPrefixForBucket(bucket.name));
    setStatus(`Deleted ${deletedCount} key(s) in ${folderPrefix}`, "info");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
    render();
  }
}

async function handleDeleteFile(key) {
  const bucket = getSelectedBucket();
  if (!bucket || !key) return;

  const confirmed = await confirmDialog(`Delete ${key} from ${bucket.name}?`, "Delete Object");
  if (!confirmed) return;

  try {
    setLoading(true);
    await api.deleteObject(bucket.name, key);
    s3.clearBucketCache(bucket.name);

    if (state.s3.selectedObject?.key === key) {
      state.s3.selectedObject = null;
    }

    const prefix = s3.currentPrefixForBucket(bucket.name);
    await s3.loadObjectsForBucketPrefix(bucket.name, prefix);
    setStatus(`Deleted ${key}`, "info");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
    render();
  }
}

async function handleNavChange(nextView) {
  if (state.view === nextView) return;

  state.view = nextView;
  state.search = "";
  if (els.search) {
    els.search.value = "";
  }

  render();
  await refreshCurrentView();
}

async function handleSearchChange(value) {
  state.search = value;

  if (state.view === VIEWS.sqs) {
    state.selectedQueue = 0;
    state.selectedMessage = 0;
  } else {
    state.s3.selectedObject = null;
    clearS3SearchState({ incrementRequestId: true });
  }

  render();

  if (state.view === VIEWS.s3 && state.search.trim().includes("/")) {
    await runS3SearchForCurrentBucket();
  }
}

async function handleRefresh() {
  if (state.view === VIEWS.sqs) {
    sqs.clearMessagesCache();
  } else {
    state.s3.entriesByLocation = {};
    state.s3.selectedObject = null;
    clearS3SearchState({ incrementRequestId: true });
  }

  await refreshCurrentView();
}

function handleSelectQueue(index) {
  state.selectedQueue = Number(index);
  state.selectedMessage = 0;
  render();
  return ensureMessagesLoadedForSelection();
}

function handleSelectMessage(index) {
  state.selectedMessage = Number(index);
  render();
}

async function handleSelectBucket(index) {
  state.selectedBucket = Number(index);
  state.s3.selectedObject = null;
  clearS3SearchState({ incrementRequestId: true });

  const bucket = getSelectedBucket();
  if (bucket && state.s3.prefixByBucket[bucket.name] === undefined) {
    s3.setCurrentPrefix(bucket.name, "");
  }

  render();
  await ensureObjectsLoadedForSelection();

  if (state.search.trim().includes("/")) {
    await runS3SearchForCurrentBucket();
  }
}

function handleSelectFile(key) {
  const bucket = getSelectedBucket();
  if (!bucket || !key) return;

  const file = state.s3.renderedFilesByKey[key];
  if (!file) return;

  state.s3.selectedObject = {
    bucket: bucket.name,
    ...file,
  };

  render();
}

function bindEvents() {
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      void handleNavChange(button.dataset.view);
    });
  });

  if (els.search) {
    els.search.addEventListener("input", (event) => {
      void handleSearchChange(event.target.value);
    });
  }

  if (els.pollToggleBtn) {
    els.pollToggleBtn.addEventListener("click", () => {
      setPollingEnabled(!state.polling.enabled);
    });
  }

  if (els.themeToggleBtn) {
    els.themeToggleBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      applyTheme(els, currentTheme === "dark" ? "light" : "dark", STORAGE_KEYS.theme);
    });
  }

  if (els.deleteMessageBtn) {
    els.deleteMessageBtn.addEventListener("click", () => {
      void handleDeleteMessage();
    });
  }

  if (els.refreshBtn) {
    els.refreshBtn.addEventListener("click", () => {
      void handleRefresh();
    });
  }

  if (els.objectUpBtn) {
    els.objectUpBtn.addEventListener("click", () => {
      const nextPrefix = els.objectUpBtn.dataset.parentPrefix || "";
      void navigateToPrefix(nextPrefix);
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
    els.confirmModalCancel.addEventListener("click", () => {
      closeConfirmModal(false);
    });
  }

  if (els.confirmModalConfirm) {
    els.confirmModalConfirm.addEventListener("click", () => {
      closeConfirmModal(true);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.confirmModal && !els.confirmModal.classList.contains("hidden")) {
      closeConfirmModal(false);
    }
  });

  document.body.addEventListener("click", async (event) => {
    const queueEl = event.target.closest("[data-queue-index]");
    if (queueEl) {
      await handleSelectQueue(queueEl.dataset.queueIndex);
      return;
    }

    const messageEl = event.target.closest("[data-message-index]");
    if (messageEl) {
      handleSelectMessage(messageEl.dataset.messageIndex);
      return;
    }

    const bucketEl = event.target.closest("[data-bucket-index]");
    if (bucketEl) {
      await handleSelectBucket(bucketEl.dataset.bucketIndex);
      return;
    }

    const deleteFolderEl = event.target.closest("[data-delete-folder-prefix]");
    if (deleteFolderEl && state.view === VIEWS.s3) {
      await handleDeleteFolder(deleteFolderEl.dataset.deleteFolderPrefix || "");
      return;
    }

    const deleteFileEl = event.target.closest("[data-delete-file-key]");
    if (deleteFileEl && state.view === VIEWS.s3) {
      await handleDeleteFile(deleteFileEl.dataset.deleteFileKey || "");
      return;
    }

    const openFileEl = event.target.closest("[data-open-file-key]");
    if (openFileEl && state.view === VIEWS.s3) {
      const bucket = getSelectedBucket();
      if (!bucket) return;

      const key = openFileEl.dataset.openFileKey || "";
      if (!key) return;

      window.open(api.objectUrl(bucket.name, key), "_blank", "noopener");
      return;
    }

    const pathEl = event.target.closest("[data-path-prefix]");
    if (pathEl && state.view === VIEWS.s3) {
      await navigateToPrefix(pathEl.dataset.pathPrefix || "");
      return;
    }

    const folderEl = event.target.closest("[data-folder-prefix]");
    if (folderEl && state.view === VIEWS.s3) {
      await navigateToPrefix(folderEl.dataset.folderPrefix || "");
      return;
    }

    const fileEl = event.target.closest("[data-file-index]");
    if (fileEl && state.view === VIEWS.s3) {
      const key = fileEl.dataset.fileKey || "";
      handleSelectFile(key);
    }
  });
}

function startPollingLoop() {
  window.setInterval(async () => {
    updatePollingProgress();

    if (!state.polling.enabled || state.view !== VIEWS.sqs) return;
    if (state.polling.running || state.loading) return;
    if (Date.now() < state.polling.nextPollAt) return;

    await pollSelectedQueue();
  }, 200);
}

applyLoadedUiState(state, loadUiState(STORAGE_KEYS.uiState));
if (els.search) {
  els.search.value = state.search;
}

bindEvents();
applyTheme(els, resolveInitialTheme(STORAGE_KEYS.theme), STORAGE_KEYS.theme);
startPollingLoop();
render();
refreshCurrentView();
