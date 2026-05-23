export interface UserProps {
  user_id: string;
  name: string;
  photo_exist: boolean;
}

export interface DeviceProps {
  id: string;
  name: string;
}

export interface EventProps {
  name: string;
  code: string;
  description?: string;
}

export interface ScanProps {
  user: UserProps;
  device: DeviceProps;
  datetime: string;
  remarks?: string | null | undefined;
  livedName: string | null | undefined;
  userImage?: string;
  disabled?: string
  expiryDate?: string
  tnaKey?: string
  eventTypeId?: string;
}

export type CustomField = {
  custom_field: {
    name: string;
  };
  [key: string]: unknown; // Allow additional properties with unknown type
};

export interface TurnstileGridProps {
  scanDetails: ScanProps[];
  setScanDetail: (scanDetail: ScanProps) => void;
  turnstileCount: number;
  sessionId?: string;
}

export const BORDER_CLASSES = {
  ERROR: 'border-4 border-red-500',
  WARNING: 'border-4 border-yellow-500',
  SUCCESS: 'border-4 border-green-500',
  DEFAULT: ''
} as const;

export type BorderColorClass = typeof BORDER_CLASSES[keyof typeof BORDER_CLASSES];

export interface ScanDetailStatus {
  expiryDate?: string;
  disabled?: string;
  remarks?: string | null; // Updated to allow null
  userImage?: string;
  user: {
    name: string;
    user_id: string;
  };
  device: {
    id: string;
  };
  livedName?: string | null | undefined; 
  eventTypeId?: string;
  event?: string;
}

export interface ReportData {
  datetime: string;
  type: string;
  user_id: string;
  name: string;
  remarks: string;
  status: string;
  activity: string;
  device: string;
}

export interface ReportsList {
  items: ReportData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GateStats {
  onPremise: number;
  entry: number;
  exit: number;
  gateAccessStats: {
    allowed: number;
    allowedWithRemarks: number;
    notAllowed: number;
  };
  lastUpdated: Date;
}