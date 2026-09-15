import { Injectable, signal } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  currentUser = signal<User | null>(null);
  isSuperAdmin = signal<boolean>(false);
  isLoading = signal<boolean>(true);

  constructor(private fb: FirebaseService, private router: Router) {
    onAuthStateChanged(this.fb.auth, async (user) => {
      this.currentUser.set(user);
      if (user) {
        // Verify Super-Admin document
        try {
          const adminRef = doc(this.fb.firestore, 'system_admins', user.uid);
          const adminSnap = await getDoc(adminRef);
          this.isSuperAdmin.set(adminSnap.exists());
        } catch {
          this.isSuperAdmin.set(false);
        }
      } else {
        this.isSuperAdmin.set(false);
      }
      this.isLoading.set(false);
    });
  }

  async login(email: string, pass: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await signInWithEmailAndPassword(this.fb.auth, email, pass);
      const adminRef = doc(this.fb.firestore, 'system_admins', res.user.uid);
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await signOut(this.fb.auth);
        throw new Error('Access denied: You are not registered as a Super-Admin.');
      }
      // Sync signals immediately: the onAuthStateChanged callback resolves
      // asynchronously (it awaits getDoc), so without this the route guard
      // can run before the signals reflect the signed-in super-admin and
      // bounce back to /login despite a successful login.
      this.currentUser.set(res.user);
      this.isSuperAdmin.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  async logout(): Promise<void> {
    await signOut(this.fb.auth);
    this.router.navigate(['/login']);
  }
}
