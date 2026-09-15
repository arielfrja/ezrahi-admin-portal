export interface OrganizationLicense {
  status: 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'SUSPENDED';
  validUntil: unknown; // Firebase Timestamp or Date
  maxActiveEvents: number;
}

export interface Organization {
  /** Firestore document ID (manual slug or auto-ID). Single source of truth —
      not duplicated as a field inside the document. */
  orgId: string;
  name: string;
  createdAt: unknown;
  orgAdmins: string[];
  license: OrganizationLicense;
  defaults?: {
    roles: string[];
    reportTypes: string[];
  };
}

export interface RegisterOrgRequest {
  /** Optional manual slug. Omitted/empty => backend generates an auto-ID. */
  orgId?: string;
  name: string;
  adminEmail: string;
  adminPassword?: string;
  licenseStatus: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  validUntilDate: string; // ISO string
  maxActiveEvents: number;
}
