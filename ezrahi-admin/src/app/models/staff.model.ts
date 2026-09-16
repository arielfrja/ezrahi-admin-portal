/** Task 5.1 — Permanent staff (organizations/{orgId}/permanent_staff). */

export type StaffRole = 'manager' | 'medic' | 'security' | 'guide' | 'tail' | string;

export interface PermanentStaff {
  staffId: string;
  name: string;
  phone: string;
  email: string;
  defaultRole: StaffRole;
  active: boolean;
  createdAt?: unknown;
}

export interface StaffForm {
  name: string;
  phone: string;
  email: string;
  defaultRole: StaffRole;
  active: boolean;
}

export const STAFF_ROLE_LABELS: Record<string, string> = {
  manager: 'מנהל / רכז',
  medic: 'חובש',
  security: 'קב״ט / מאבטח',
  guide: 'מדריך',
  tail: 'מאסף',
};

export const STAFF_ROLE_OPTIONS = ['manager', 'medic', 'security', 'guide', 'tail'];
