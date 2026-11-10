/** Hebrew labels for enums the HQ and crew pages render (never raw enums in UI). */

export const INCIDENT_CATEGORY_LABELS: Record<string, string> = {
  MEDICAL: 'רפואי',
  SECURITY: 'ביטחוני',
  DELAY: 'עיכוב',
  HAZARD: 'מפגע',
};

export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  REPORTED: 'דווח',
  IN_PROGRESS: 'בטיפול',
  RESOLVED: 'טופל',
};

/** Participant presence labels (HQ roster + crew manager). */
export const PRESENCE_LABELS: Record<string, string> = {
  ACTIVE: 'משדר',
  OFFLINE: 'לא משדר',
  REMOVED: 'הוסר',
};

/** Legacy pilot roles (pre base-8 events, e.g. test-event-ariel). */
export const PILOT_ROLE_LABELS: Record<string, string> = {
  MEMBER: 'חבר צוות',
  LEAD_GUIDE: 'מדריך ראשי',
  MANAGER: 'מנהל',
  SWEEP_GUIDE: 'מאסף',
  MEDIC: 'חובש',
};

/** Colors for legacy pilot roles (used where markers follow role color). */
export const PILOT_ROLE_COLORS: Record<string, string> = {
  MEMBER: '#16a34a',
  LEAD_GUIDE: '#0d9488',
  MANAGER: '#7c3aed',
  SWEEP_GUIDE: '#64748b',
  MEDIC: '#ef4444',
};

export function categoryLabel(id: string): string {
  return INCIDENT_CATEGORY_LABELS[id] ?? (id || '—');
}

export function incidentStatusLabel(id: string): string {
  return INCIDENT_STATUS_LABELS[id] ?? (id || '—');
}

export function presenceLabel(id: string): string {
  return PRESENCE_LABELS[id] ?? (id || '—');
}

/** Never render a raw uid as a person's name. */
export function personName(name: string | undefined, phone: string | undefined): string {
  const n = (name ?? '').trim();
  if (n && !/^[\w-]{6,}$/.test(n)) return n; // uid-like strings are not names
  const ph = (phone ?? '').trim();
  return ph || n || 'משתתף';
}
