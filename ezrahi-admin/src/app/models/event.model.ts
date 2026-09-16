/** Tasks 5.2 / 6.x — Field event (Firestore collection `events`). */

export type EventStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface EventRoute {
  gpxPath?: string;
  center?: { lat: number; lng: number };
  radiusM?: number;
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
