import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { RoleInvite, CreateInviteRequest } from '../models/invite.model';

/** Task 5.3 — hierarchical role invites (doc id == 6-digit code). */
@Injectable({ providedIn: 'root' })
export class InviteService {
  constructor(private fb: FirebaseService, private auth: AuthService) {}

  watchInvites(eventId: string): Observable<RoleInvite[]> {
    return new Observable<RoleInvite[]>((sub) => {
      const ref = collection(this.fb.firestore, 'events', eventId, 'invites');
      const unsub = onSnapshot(
        ref,
        (snap) => {
          sub.next(snap.docs.map((d) => ({ ...(d.data() as Omit<RoleInvite, 'code'>), code: d.id })));
        },
        (err) => sub.error(err),
      );
      return unsub;
    });
  }

  private randomCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Creates an invite with a random 6-digit code. When the creator is
   * managerial (event manager or a managerial participant), the new invite
   * automatically carries parentManagerUid = creator uid (auto superior).
   */
  async createInvite(eventId: string, req: CreateInviteRequest): Promise<string> {
    const me = this.auth.currentUser()?.uid ?? '';
    // Determine whether the creator is managerial: event manager always is;
    // otherwise check own participant doc.
    let parentManagerUid: string | null = null;
    const eventSnap = await getDoc(doc(this.fb.firestore, 'events', eventId));
    const managerId = (eventSnap.data()?.['managerId'] as string | undefined) ?? '';
    if (me && me === managerId) {
      parentManagerUid = me;
    } else if (me) {
      const partSnap = await getDoc(doc(this.fb.firestore, 'events', eventId, 'participants', me));
      const role = String(partSnap.data()?.['role'] ?? '');
      const managerialRoles = ['event_manager', 'manager', 'route_coordinator', 'security', 'clinic_head'];
      if (managerialRoles.includes(role)) parentManagerUid = me;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.randomCode();
      const ref = doc(this.fb.firestore, 'events', eventId, 'invites', code);
      const existing = await getDoc(ref);
      if (existing.exists()) continue;
      await setDoc(ref, {
        targetRole: req.targetRole,
        isManagerial: req.isManagerial,
        canInvite: req.canInvite,
        createdBy: me,
        parentManagerUid,
        maxUses: req.maxUses ?? null,
        uses: 0,
        active: true,
        createdAt: serverTimestamp(),
      });
      return code;
    }
    throw new Error('לא ניתן להפיק קוד ייחודי, נסה שוב.');
  }

  async setInviteActive(eventId: string, code: string, active: boolean): Promise<void> {
    const ref = doc(this.fb.firestore, 'events', eventId, 'invites', code);
    await updateDoc(ref, { active });
  }
}
