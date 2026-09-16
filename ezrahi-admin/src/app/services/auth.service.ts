import { Injectable, signal } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { Router } from '@angular/router';

export type PortalRole = 'super-admin' | 'org-admin' | null;

/**
 * Task 3.1 — Dual-Role Auth Router state.
 * Resolves on every auth change:
 *   1. UID in `system_admins` -> super-admin -> /super-admin
 *   2. UID in some organizations[].orgAdmins -> org-admin (currentOrgId) -> /org
 *   3. Neither -> signed out, PORTAL_UNAUTHORIZED (Hebrew banner in Login).
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  currentUser = signal<User | null>(null);
  isSuperAdmin = signal<boolean>(false);
  isOrgAdmin = signal<boolean>(false);
  userRole = signal<PortalRole>(null);
  /** Active org for Tier-1 sessions (persisted to localStorage). */
  currentOrgId = signal<string | null>(localStorage.getItem('ezrahi.currentOrgId'));
  orgIds = signal<string[]>([]);
  isLoading = signal<boolean>(true);

  constructor(private fb: FirebaseService, private router: Router) {
    onAuthStateChanged(this.fb.auth, async (user) => {
      this.currentUser.set(user);
      if (user) {
        await this.resolveRole(user.uid);
      } else {
        this.isSuperAdmin.set(false);
        this.isOrgAdmin.set(false);
        this.userRole.set(null);
        this.orgIds.set([]);
      }
      this.isLoading.set(false);
    });
  }

  private async resolveRole(uid: string): Promise<void> {
    // 1. Super-admin?
    try {
      const adminRef = doc(this.fb.firestore, 'system_admins', uid);
      const adminSnap = await getDoc(adminRef);
      if (adminSnap.exists()) {
        this.isSuperAdmin.set(true);
        this.isOrgAdmin.set(false);
        this.userRole.set('super-admin');
        return;
      }
    } catch {
      // fall through to org check
    }
    this.isSuperAdmin.set(false);

    // 2. Org admin? (array-contains query; rules allow orgAdmins to read
    //    their own org docs, super-admins to read all)
    try {
      const orgsRef = collection(this.fb.firestore, 'organizations');
      const q = query(orgsRef, where('orgAdmins', 'array-contains', uid), limit(10));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const ids = snap.docs.map((d) => d.id);
        this.orgIds.set(ids);
        this.isOrgAdmin.set(true);
        this.userRole.set('org-admin');
        const saved = localStorage.getItem('ezrahi.currentOrgId');
        const current = saved && ids.includes(saved) ? saved : ids[0];
        this.currentOrgId.set(current);
        localStorage.setItem('ezrahi.currentOrgId', current);
        return;
      }
    } catch {
      // permission-denied here means "not authorized" — handled below
    }
    this.isOrgAdmin.set(false);
    this.orgIds.set([]);
    this.userRole.set(null);
  }

  switchOrg(orgId: string): void {
    if (!this.orgIds().includes(orgId) && !this.isSuperAdmin()) return;
    this.currentOrgId.set(orgId);
    localStorage.setItem('ezrahi.currentOrgId', orgId);
  }

  async login(email: string, pass: string): Promise<PortalRole> {
    this.isLoading.set(true);
    try {
      const res = await signInWithEmailAndPassword(this.fb.auth, email, pass);
      await this.resolveRole(res.user.uid);
      const role = this.userRole();
      if (role === null) {
        await signOut(this.fb.auth);
        this.currentUser.set(null);
        throw new Error('PORTAL_UNAUTHORIZED: משתמש זה אינו מורשה גישה לפורטל הניהול');
      }
      // Sync signals immediately (onAuthStateChanged resolves async).
      this.currentUser.set(res.user);
      return role;
    } finally {
      this.isLoading.set(false);
    }
  }

  async logout(): Promise<void> {
    await signOut(this.fb.auth);
    this.currentOrgId.set(null);
    localStorage.removeItem('ezrahi.currentOrgId');
    this.router.navigate(['/login']);
  }
}
