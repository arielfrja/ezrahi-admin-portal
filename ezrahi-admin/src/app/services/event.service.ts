import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase.service';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { Observable } from 'rxjs';
import { FieldEvent, CreateEventRequest } from '../models/event.model';

/** Tasks 5.2 / 6.3 — org events (collection `events`) + GPX upload + kill-switch. */
@Injectable({ providedIn: 'root' })
export class EventService {
  constructor(private fb: FirebaseService) {}

  watchOrgEvents(orgId: string): Observable<FieldEvent[]> {
    return new Observable<FieldEvent[]>((sub) => {
      const ref = collection(this.fb.firestore, 'events');
      const q = query(ref, where('orgId', '==', orgId), orderBy('startTime', 'desc'));
      const unsub = onSnapshot(
        q,
        (snap) => {
          sub.next(snap.docs.map((d) => ({ ...(d.data() as Omit<FieldEvent, 'eventId'>), eventId: d.id })));
        },
        (err) => sub.error(err),
      );
      return unsub;
    });
  }

  watchEvent(eventId: string, cb: (e: FieldEvent | null) => void): () => void {
    const ref = doc(this.fb.firestore, 'events', eventId);
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb({ ...(snap.data() as Omit<FieldEvent, 'eventId'>), eventId: snap.id });
    });
  }

  /** Server-enforced creation (license ACTIVE + quota checked in Function). */
  async createEvent(payload: CreateEventRequest): Promise<string> {
    const fn = httpsCallable(this.fb.functions, 'createEvent');
    const res = await fn({ ...payload });
    return (res.data as { eventId: string }).eventId;
  }

  /** Upload a GPX track; returns the storage path for createEvent.gpxPath. */
  async uploadGpx(orgId: string, file: File): Promise<string> {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `routes/${orgId}/${Date.now()}_${safe}`;
    const storageRef = ref(this.fb.storage, path);
    await uploadBytes(storageRef, file, { contentType: 'application/gpx+xml' });
    return path;
  }

  async updateEvent(eventId: string, patch: Record<string, unknown>): Promise<void> {
    const ref = doc(this.fb.firestore, 'events', eventId);
    await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  }

  /** Master kill-switch (Task 6.3): double-confirm in UI, then Function. */
  async terminateEvent(eventId: string): Promise<{ participantsUpdated: number }> {
    const fn = httpsCallable(this.fb.functions, 'terminateActivity');
    const res = await fn({ eventId, collection: 'events' });
    return res.data as { participantsUpdated: number };
  }
}
