import { VIEWS } from "./config.js";

export function getStoredTheme(storageKey) {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

export function resolveInitialTheme(storageKey) {
  const stored = getStoredTheme(storageKey);
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(els, theme, storageKey) {
  document.documentElement.setAttribute("data-theme", theme);
  if (els.themeToggleBtn) {
    els.themeToggleBtn.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }

  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // noop
  }
}

export function loadUiState(storageKey) {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function applyLoadedUiState(state, saved) {
  if (!saved || typeof saved !== "object") return;

  if (saved.view === VIEWS.sqs || saved.view === VIEWS.s3) state.view = saved.view;
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

export function persistUiState(state, storageKey) {
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

    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // noop
  }
}
