export interface OrganizationLicense {
  status: 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'SUSPENDED';
  validUntil: unknown; // Firebase Timestamp or Date
  /** Maximum concurrent active events. null = unlimited. */
  maxActiveEvents: number | null;
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
  /** Legacy portal name; spec alias orgName also accepted. */
  name?: string;
  orgName?: string;
  adminEmail: string;
  adminPassword?: string;
  /** Task 2.1 spec fields (stored in permanent_staff + used for setup link). */
  adminFullName?: string;
  adminPhone?: string;
  licenseStatus: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  validUntilDate?: string; // ISO string (legacy)
  licenseDurationMonths?: number; // spec alternative to validUntilDate
  /** null = unlimited. undefined = backend default (5). */
  maxActiveEvents?: number | null;
  /** Spec alias for maxActiveEvents. */
  maxActivities?: number | null;
}

export interface RegisterOrgResult {
  success: boolean;
  orgId: string;
  adminUid: string;
  /** First-login password-setup link for the org admin (share via WhatsApp). */
  setupPasswordLink?: string;
}
