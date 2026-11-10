/** Tasks 5.2 / 6.x — Field event (Firestore collection `events`). */

export type EventStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface EventRect {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface EventRoute {
  gpxPath?: string;
  center?: { lat: number; lng: number };
  radiusM?: number;
  /** Multiple rectangular areas (preferred over center+radius when present). */
  rects?: EventRect[];
}

/**
 * Per-event role customization (PRD §4.3): the 8 base roles stay fixed, but an
 * event may re-title / re-color them, flip the managerial+invite flags, and
 * narrow which roles each role can see.
 */
export interface EventRoleConfig {
  id: string;
  title: string;
  color: string;
  isManagerial: boolean;
  canInvite: boolean;
  /** Role ids this role may see; empty = see everyone (PRD default). */
  visibleRoles: string[];
}

export interface FieldEvent {
  eventId: string;
  orgId: string;
  name: string;
  managerId: string;
  managerName?: string;
  status: EventStatus;
  startTime: unknown;
  endTime: unknown;
  route?: EventRoute | null;
  /** Event-level overrides of the 8 base roles (absent → org/base defaults). */
  rolesConfig?: EventRoleConfig[];
  createdAt?: unknown;
}

export interface CreateEventRequest {
  orgId: string;
  name: string;
  managerId: string;
  startTime: string; // ISO
  endTime: string; // ISO
  gpxPath?: string;
  center?: { lat: number; lng: number };
  radiusM?: number;
  rects?: EventRect[];
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  PLANNED: 'מתוכנן',
  ACTIVE: 'פעיל',
  COMPLETED: 'הסתיים',
  CANCELLED: 'בוטל',
};

/** 8 central base roles (PRD §4.3, anti-bloat: no end-user custom roles). */
export const BASE_ROLES = [
  { id: 'event_manager', title: 'מנהל אירוע', color: '#7c3aed', isManagerial: true, canInvite: true },
  { id: 'route_coordinator', title: 'רכז מסלול', color: '#2563eb', isManagerial: true, canInvite: true },
  { id: 'security', title: 'קב״ט', color: '#1d4ed8', isManagerial: true, canInvite: true },
  { id: 'clinic_head', title: 'מנהל מרפאה', color: '#dc2626', isManagerial: true, canInvite: true },
  { id: 'medic', title: 'חובש', color: '#ef4444', isManagerial: false, canInvite: false },
  { id: 'guide', title: 'מדריך', color: '#16a34a', isManagerial: false, canInvite: false },
  { id: 'driver', title: 'נהג / לוגיסטיקה', color: '#ca8a04', isManagerial: false, canInvite: false },
  { id: 'tail', title: 'מאסף', color: '#64748b', isManagerial: false, canInvite: false },
];

/** Base role shape without the per-event `visibleRoles` list. */
export type BaseRole = (typeof BASE_ROLES)[number];

/**
 * Effective role list for an event: base roles merged with the event's
 * `rolesConfig` overrides (missing/blank fields fall back to the base value).
 */
export function rolesForEvent(event: FieldEvent | null | undefined): EventRoleConfig[] {
  const overrides = new Map<string, EventRoleConfig>(
    (event?.rolesConfig ?? []).map((r) => [r.id, r]),
  );
  return BASE_ROLES.map((base) => {
    const o = overrides.get(base.id);
    return {
      id: base.id,
      title: o?.title?.trim() || base.title,
      color: o?.color || base.color,
      isManagerial: o?.isManagerial ?? base.isManagerial,
      canInvite: o?.canInvite ?? base.canInvite,
      visibleRoles: o?.visibleRoles ?? [],
    };
  });
}

/** Snapshot of the untouched defaults, for the "restore defaults" action. */
export function defaultRolesConfig(): EventRoleConfig[] {
  return BASE_ROLES.map((r) => ({ ...r, visibleRoles: [] as string[] }));
}
