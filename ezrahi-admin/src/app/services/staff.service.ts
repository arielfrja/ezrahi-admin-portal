import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase.service';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { PermanentStaff, StaffForm } from '../models/staff.model';

/** Task 5.1 — CRUD for organizations/{orgId}/permanent_staff. */
@Injectable({ providedIn: 'root' })
export class StaffService {
  constructor(private fb: FirebaseService) {}

  watchStaff(orgId: string): Observable<PermanentStaff[]> {
    return new Observable<PermanentStaff[]>((sub) => {
      const ref = collection(this.fb.firestore, 'organizations', orgId, 'permanent_staff');
      const q = query(ref, orderBy('name'));
      const unsub = onSnapshot(
        q,
        (snap) => {
          sub.next(snap.docs.map((d) => ({ ...(d.data() as Omit<PermanentStaff, 'staffId'>), staffId: d.id })));
        },
        (err) => sub.error(err),
      );
      return unsub;
    });
  }

  async addStaff(orgId: string, form: StaffForm): Promise<string> {
    const ref = collection(this.fb.firestore, 'organizations', orgId, 'permanent_staff');
    const created = await addDoc(ref, { ...form, createdAt: serverTimestamp() });
    return created.id;
  }

  async updateStaff(orgId: string, staffId: string, patch: Partial<StaffForm>): Promise<void> {
    const ref = doc(this.fb.firestore, 'organizations', orgId, 'permanent_staff', staffId);
    await updateDoc(ref, { ...patch });
  }

  async setActive(orgId: string, staffId: string, active: boolean): Promise<void> {
    const ref = doc(this.fb.firestore, 'organizations', orgId, 'permanent_staff', staffId);
    await updateDoc(ref, { active });
  }
}
