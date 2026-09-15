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
  maxEvents?: number;
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

  // Edit organization info + license (doc ID and orgAdmins are immutable here)
  async updateOrganization(orgId: string, info: UpdateOrgInfo): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (info.name !== undefined) patch['name'] = info.name;
    if (info.status !== undefined) patch['license.status'] = info.status;
    if (info.validUntil !== undefined) {
      patch['license.validUntil'] = Timestamp.fromDate(info.validUntil);
    }
    if (info.maxEvents !== undefined) patch['license.maxActiveEvents'] = info.maxEvents;
    if (Object.keys(patch).length === 0) return;
    const orgRef = doc(this.fb.firestore, 'organizations', orgId);
    await updateDoc(orgRef, patch);
  }

  // Permanent Delete
  async deleteOrganization(orgId: string): Promise<void> {
    const orgRef = doc(this.fb.firestore, 'organizations', orgId);
    await deleteDoc(orgRef);
  }
}
