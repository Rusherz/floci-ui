const DEFAULT_SQS_POLL_MS = 5000;

export const VIEWS = {
  sqs: "sqs",
  s3: "s3",
};

export const STORAGE_KEYS = {
  theme: "floci_theme",
  uiState: "floci_ui_state",
};

export const API_CONFIG = {
  baseUrl: window.FLOCI_API_BASE_URL || `${window.location.origin}/floci`,
  sqsAccountId: window.FLOCI_SQS_ACCOUNT_ID || "000000000000",
  sqsVersion: "2012-11-05",
  sqsPollMs: Number(window.FLOCI_SQS_POLL_MS || DEFAULT_SQS_POLL_MS),
};

export function createInitialState() {
  const pollIntervalMs = API_CONFIG.sqsPollMs > 0 ? API_CONFIG.sqsPollMs : DEFAULT_SQS_POLL_MS;

  return {
    view: VIEWS.sqs,
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
      allKeysByBucket: {},
      searchResults: null,
      searchLoading: false,
      searchRequestId: 0,
      renderedFilesByKey: {},
    },
    polling: {
      enabled: true,
      running: false,
      intervalMs: pollIntervalMs,
      nextPollAt: Date.now() + pollIntervalMs,
    },
  };
}
