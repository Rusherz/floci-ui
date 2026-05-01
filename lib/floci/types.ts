export const VIEWS = {
  sqs: 'sqs',
  s3: 's3',
} as const;

export type View = (typeof VIEWS)[keyof typeof VIEWS];

export type Queue = {
  name: string;
  queueUrl: string;
};

export type SnsTopic = {
  arn: string;
  name: string;
};

export type SnsSubscription = {
  subscriptionArn: string;
  topicArn: string;
  protocol: string;
  endpoint: string;
};

export type DynamoTableSummary = {
  name: string;
};

export type DynamoKeyDefinition = {
  name: string;
  type: string;
};

export type DynamoTableDescription = {
  name: string;
  itemCount: number;
  tableStatus: string;
  keySchema: DynamoKeyDefinition[];
};

export type LambdaFunctionSummary = {
  name: string;
  runtime: string;
  handler: string;
  lastModified: string;
  arn: string;
};

export type EventBusSummary = {
  name: string;
  arn: string;
};

export type EventRuleSummary = {
  name: string;
  arn: string;
  eventBusName: string;
  state: string;
};

export type EventTargetSummary = {
  id: string;
  arn: string;
};

export type StepFunctionStateMachineSummary = {
  name: string;
  arn: string;
  type: string;
  creationDate: string;
};

export type StepFunctionExecutionSummary = {
  name: string;
  arn: string;
  status: string;
  startDate: string;
  stopDate: string;
};

export type SsmParameterSummary = {
  name: string;
  type: string;
  lastModifiedDate: string;
  version: number;
};

export type SecretSummary = {
  name: string;
  arn: string;
  description: string;
  lastChangedDate: string;
};

export type SecretDetails = {
  arn: string;
  name: string;
  description: string;
  versionIdsToStages: Record<string, string[]>;
};

export type CloudWatchLogGroupSummary = {
  logGroupName: string;
  storedBytes: number;
  retentionInDays: number;
};

export type CloudWatchLogStreamSummary = {
  logStreamName: string;
  lastEventTimestamp: number;
};

export type CloudWatchLogEvent = {
  timestamp: number;
  message: string;
  ingestionTime: number;
  eventId: string;
  logStreamName: string;
};

export type SqsMessage = {
  id: string;
  sentAt: string;
  body: unknown;
  raw: {
    messageId: string;
    receiptHandle: string;
    attributes: Record<string, string>;
    md5OfBody: string;
  };
};

export type Bucket = {
  name: string;
  region: string;
  creationDate: string;
};

export type FolderEntry = {
  type: 'folder';
  name: string;
  prefix: string;
};

export type FileEntry = {
  type: 'file';
  key: string;
  name: string;
  size: string;
  lastModified: string;
  etag: string;
};

export type Listing = {
  folders: FolderEntry[];
  files: FileEntry[];
};

export type SelectedObject = {
  bucket: string;
  key: string;
  name: string;
  size: string;
  lastModified: string;
  etag: string;
};

export type SearchResults = {
  bucket: string;
  query: string;
  folders: FolderEntry[];
  files: FileEntry[];
};

export type AppState = {
  view: View;
  selectedQueue: number;
  selectedMessage: number;
  selectedBucket: number;
  search: string;
  loading: boolean;
  sqs: {
    queues: Queue[];
    messagesByQueue: Record<string, SqsMessage[]>;
  };
  s3: {
    buckets: Bucket[];
    prefixByBucket: Record<string, string>;
    entriesByLocation: Record<string, Listing>;
    selectedObject: SelectedObject | null;
    allKeysByBucket: Record<string, string[]>;
    searchResults: SearchResults | null;
    searchLoading: boolean;
    searchRequestId: number;
    renderedFilesByKey: Record<string, FileEntry>;
  };
  polling: {
    enabled: boolean;
    running: boolean;
    intervalMs: number;
    nextPollAt: number;
  };
};

export type ApiConfig = {
  baseUrl: string;
  sqsAccountId: string;
  sqsVersion: string;
  sqsPollMs: number;
};

export const STORAGE_KEYS = {
  theme: 'floci_theme',
  uiState: 'floci_ui_state',
} as const;

export function createInitialState(apiConfig: ApiConfig): AppState {
  const fallbackPoll = 5000;
  const pollIntervalMs = apiConfig.sqsPollMs > 0 ? apiConfig.sqsPollMs : fallbackPoll;

  return {
    view: VIEWS.sqs,
    selectedQueue: 0,
    selectedMessage: 0,
    selectedBucket: 0,
    search: '',
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
