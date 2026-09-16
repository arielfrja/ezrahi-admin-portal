import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase.service';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Observable } from 'rxjs';
import { Organization, RegisterOrgRequest } from '../models/organization.model';

export interface UpdateOrgInfo {
  name?: string;
  status?: 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'SUSPENDED';
  validUntil?: Date;
  /** null = unlimited. */
  maxEvents?: number | null;
}

export interface AdminUserInfo {
  uid: string;
  email: string;
  displayName: string;
}

export interface AddOrgAdminResult {
  success: boolean;
  uid: string;
  email: string;
  created: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class OrganizationService {

  constructor(private fb: FirebaseService) {}

  // Real-time stream of all organizations (plain modular SDK via onSnapshot).
  getOrganizations(): Observable<Organization[]> {
    return new Observable<Organization[]>((subscriber) => {
      const orgsRef = collection(this.fb.firestore, 'organizations');
      const unsubscribe = onSnapshot(
        orgsRef,
        (snap) => {
          const orgs = snap.docs.map(
            (d) => ({ ...(d.data() as Organization), orgId: d.id })
          );
          subscriber.next(orgs);
        },
        (err) => subscriber.error(err)
      );
      return unsubscribe;
    });
  }

  // Register via Cloud Function (creates Auth Admin user + Firestore doc)
  async registerOrganization(payload: RegisterOrgRequest): Promise<unknown> {
    const callFunction = httpsCallable(this.fb.functions, 'registerOrganization');
    const result = await callFunction(payload);
    return result.data;
  }

  // Update License / Status (Suspend / Reactivate)
  async updateLicenseStatus(
    orgId: string,
    status: 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'SUSPENDED'
  ): Promise<void> {
    const orgRef = doc(this.fb.firestore, 'organizations', orgId);
    await updateDoc(orgRef, {
      'license.status': status
    });
  }

  // Update License Dates or Quotas
  async updateLicenseDetails(orgId: string, validUntil: Date, maxEvents: number): Promise<void> {
    const orgRef = doc(this.fb.firestore, 'organizations', orgId);
    await updateDoc(orgRef, {
      'license.validUntil': Timestamp.fromDate(validUntil),
      'license.maxActiveEvents': maxEvents
    });
  }

  // Edit organization info + license (doc ID and orgAdmins are immutable here).
  // maxEvents 0 is normalized to null (unlimited) so direct writes match the function.
  async updateOrganization(orgId: string, info: UpdateOrgInfo): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (info.name !== undefined) patch['name'] = info.name;
    if (info.status !== undefined) patch['license.status'] = info.status;
    if (info.validUntil !== undefined) {
      patch['license.validUntil'] = Timestamp.fromDate(info.validUntil);
    }
    if (info.maxEvents !== undefined) {
      patch['license.maxActiveEvents'] = info.maxEvents === 0 ? null : info.maxEvents;
    }
    if (Object.keys(patch).length === 0) return;
    const orgRef = doc(this.fb.firestore, 'organizations', orgId);
    await updateDoc(orgRef, patch);
  }

  // Permanent Delete
  async deleteOrganization(orgId: string): Promise<void> {
    const orgRef = doc(this.fb.firestore, 'organizations', orgId);
    await deleteDoc(orgRef);
  }

  // List Firebase Auth users (super-admin only, via Cloud Function)
  async listUsers(): Promise<AdminUserInfo[]> {
    const callFunction = httpsCallable(this.fb.functions, 'listUsers');
    const result = await callFunction({});
    return (result.data as { users: AdminUserInfo[] }).users ?? [];
  }

  // Add existing user or invite new one as org admin (via Cloud Function)
  async addOrgAdmin(orgId: string, email: string): Promise<AddOrgAdminResult> {
    const callFunction = httpsCallable(this.fb.functions, 'addOrgAdmin');
    const result = await callFunction({ orgId, email });
    return result.data as AddOrgAdminResult;
  }

  // Remove a UID from org admins (via Cloud Function)
  async removeOrgAdmin(orgId: string, uid: string): Promise<void> {
    const callFunction = httpsCallable(this.fb.functions, 'removeOrgAdmin');
    await callFunction({ orgId, uid });
  }
}
