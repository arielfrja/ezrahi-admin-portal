import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase.service';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

export type IncidentSeverity = 'HIGH' | 'NORMAL';
export type IncidentStatus = 'REPORTED' | 'IN_PROGRESS' | 'RESOLVED';

export interface LiveParticipant {
  uid: string;
  name: string;
  role: string;
  phone: string;
  status: string;
  lastSeen?: unknown;
  battery?: number | null;
}

export interface LiveLocation {
  uid: string;
  lat: number;
  lng: number;
  accuracy?: number;
  motion?: string;
  updatedAt?: unknown;
}

export interface FieldIncident {
  incidentId: string;
  category: string;
  severity: IncidentSeverity;
  title: string;
  desc: string;
  lat: number;
  lng: number;
  status: IncidentStatus;
  reporterId: string;
  createdAt?: unknown;
}

/** Tasks 6.1/6.2 — live HQ streams under events/{id}/{participants,locations,incidents}. */
@Injectable({ providedIn: 'root' })
export class LiveService {
  constructor(private fb: FirebaseService) {}

  watchParticipants(eventId: string): Observable<LiveParticipant[]> {
    return new Observable<LiveParticipant[]>((sub) => {
      const ref = collection(this.fb.firestore, 'events', eventId, 'participants');
      const unsub = onSnapshot(
        ref,
        (snap) => {
          sub.next(
            snap.docs.map((d) => {
              const data = d.data() as Record<string, unknown>;
              return {
                uid: d.id,
                name: String(data['name'] ?? d.id.slice(0, 8)),
                role: String(data['role'] ?? 'guide'),
                phone: String(data['phone'] ?? ''),
                status: String(data['status'] ?? 'ACTIVE'),
                lastSeen: data['lastSeen'] ?? data['updatedAt'],
                battery: typeof data['battery'] === 'number' ? (data['battery'] as number) : null,
              };
            }),
          );
        },
        (err) => sub.error(err),
      );
      return unsub;
    });
  }

  watchLocations(eventId: string): Observable<LiveLocation[]> {
    return new Observable<LiveLocation[]>((sub) => {
      const ref = collection(this.fb.firestore, 'events', eventId, 'locations');
      const unsub = onSnapshot(
        ref,
        (snap) => {
          const out: LiveLocation[] = [];
          for (const d of snap.docs) {
            const data = d.data() as Record<string, unknown>;
            const lat = Number(data['lat'] ?? data['latitude']);
            const lng = Number(data['lng'] ?? data['lon'] ?? data['longitude']);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            out.push({
              uid: d.id,
              lat,
              lng,
              accuracy: typeof data['accuracy'] === 'number' ? (data['accuracy'] as number) : undefined,
              motion: typeof data['motion'] === 'string' ? (data['motion'] as string) : undefined,
              updatedAt: data['updatedAt'],
            });
          }
          sub.next(out);
        },
        (err) => sub.error(err),
      );
      return unsub;
    });
  }

  watchIncidents(eventId: string): Observable<FieldIncident[]> {
    return new Observable<FieldIncident[]>((sub) => {
      const ref = collection(this.fb.firestore, 'events', eventId, 'incidents');
      const q = query(ref, orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const out: FieldIncident[] = [];
          for (const d of snap.docs) {
            const data = d.data() as Record<string, unknown>;
            if ((data['status'] as string) === 'RESOLVED') continue; // resolved leaves the map
            out.push({
              incidentId: d.id,
              category: String(data['category'] ?? ''),
              severity: (data['severity'] as IncidentSeverity) === 'HIGH' ? 'HIGH' : 'NORMAL',
              title: String(data['title'] ?? ''),
              desc: String(data['desc'] ?? data['description'] ?? ''),
              lat: Number(data['lat']),
              lng: Number(data['lng']),
              status: (data['status'] as IncidentStatus) ?? 'REPORTED',
              reporterId: String(data['reporterId'] ?? ''),
              createdAt: data['createdAt'],
            });
          }
          // Urgency sort: HIGH flashing on top, then newest.
          out.sort((a, b) => {
            if (a.severity !== b.severity) return a.severity === 'HIGH' ? -1 : 1;
            return 0; // Firestore already newest-first
          });
          sub.next(out);
        },
        (err) => sub.error(err),
      );
      return unsub;
    });
  }

  async setIncidentStatus(eventId: string, incidentId: string, status: IncidentStatus): Promise<void> {
    const ref = doc(this.fb.firestore, 'events', eventId, 'incidents', incidentId);
    await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  }
}
