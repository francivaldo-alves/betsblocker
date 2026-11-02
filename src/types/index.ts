export type ClassificationStatus =
  | 'AUTHORIZED'
  | 'UNAUTHORIZED_CONFIRMED'
  | 'PENDING_REVIEW'
  | 'USER_ADDED'
  | 'EXCEPTION';

export type BlockStatus = 'BLOCK' | 'ALLOW';

export type SourceType = 'OFFICIAL' | 'COMMUNITY' | 'USER_MANUAL';

export type ReliabilityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type ReviewStatus = 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export type SyncStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL';

export type BlockMode = 'STRICT' | 'AUDIT';

export interface BlockedDomain {
  id: number;
  domain: string;
  category: string;
  classification_status: ClassificationStatus;
  block_status: BlockStatus;
  source_id: number;
  evidence: string;
  verified_at: string;
  created_at: string;
  updated_at: string;
}

export interface DomainSource {
  id: number;
  name: string;
  source_type: SourceType;
  source_url: string | null;
  description: string;
  last_checked_at: string | null;
  reliability_level: ReliabilityLevel;
}

export interface DomainReview {
  id: number;
  domain_id: number;
  review_status: ReviewStatus;
  reviewer_note: string;
  reviewed_at: string;
}

export interface DomainException {
  id: number;
  domain: string;
  reason: string;
  created_at: string;
  expires_at: string | null;
}

export interface BlockEvent {
  id: number;
  domain: string;
  blocked_at: string;
  block_reason: string;
  source_id: number | null;
}

export interface SyncHistory {
  id: number;
  version: number;
  synced_at: string;
  total_records: number;
  added_records: number;
  updated_records: number;
  removed_records: number;
  status: SyncStatus;
  error_message: string | null;
}

export interface ProtectionSettings {
  id: 1;
  protection_enabled: number; // 0 ou 1 para compatibilidade SQLite
  notification_enabled: number;
  automatic_sync: number;
  block_ads: number;
  block_licensed: number;
  block_mode: BlockMode;
  commitment_delay_hours: number; // 0 desliga o atraso para reduzir a proteção
  unlock_requested_at: string | null;
}

export interface BlocklistManifest {
  version: number;
  generatedAt: string;
  source: string;
  recordCount: number;
  checksum: string;
  signature?: string;
}

export interface BlocklistEntry {
  domain: string;
  category: string;
  classificationStatus: ClassificationStatus;
  blockStatus: BlockStatus;
  source: string;
  evidence: string;
  verifiedAt: string;
}

export type ProtectionOperationalStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'RUNNING'
  | 'ERROR'
  | 'PERMISSION_REQUIRED';

export interface ProtectionService {
  requestPermission(): Promise<boolean>;
  startProtection(): Promise<void>;
  stopProtection(): Promise<void>;
  getStatus(): Promise<ProtectionOperationalStatus>;
  updateBlocklist(): Promise<void>;
}
