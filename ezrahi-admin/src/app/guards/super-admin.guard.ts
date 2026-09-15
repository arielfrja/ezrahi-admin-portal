import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Poll interval / timeout for auth state to settle (slow networks, cold start).
const POLL_MS = 50;
const TIMEOUT_MS = 5000;

export const superAdminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait until the Firebase auth state (and super-admin check) resolves.
  // login() sets the signals synchronously on success, so this loop normally
  // exits on the first iteration; the bounded wait covers page reloads and
  // slow Firestore reads.
  const deadline = Date.now() + TIMEOUT_MS;
  while (!(authService.currentUser() && authService.isSuperAdmin())) {
    if (!authService.isLoading() && Date.now() > deadline) break;
    if (!authService.isLoading() && !authService.currentUser()) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  if (authService.currentUser() && authService.isSuperAdmin()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
