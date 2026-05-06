export type ServiceStatusType = 'info' | 'error' | null;

export type ServiceStatus = {
  type: ServiceStatusType;
  message: string;
};

export const EMPTY_SERVICE_STATUS: ServiceStatus = {
  type: null,
  message: '',
};
