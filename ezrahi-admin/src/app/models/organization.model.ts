export interface OrganizationLicense {
  status: 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'SUSPENDED';
  validUntil: unknown; // Firebase Timestamp or Date
  maxActiveEvents: number;
}

export interface Organization {
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
  orgId: string;
  name: string;
  adminEmail: string;
  adminPassword?: string;
  licenseStatus: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  validUntilDate: string; // ISO string
  maxActiveEvents: number;
}
