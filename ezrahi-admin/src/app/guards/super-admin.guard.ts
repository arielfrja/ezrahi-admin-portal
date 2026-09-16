import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Poll interval / timeout for auth state to settle (slow networks, cold start).
const POLL_MS = 50;
const TIMEOUT_MS = 5000;

async function waitForAuth(authService: AuthService): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (authService.isLoading()) {
    if (Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

export const superAdminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await waitForAuth(authService);

  if (authService.currentUser() && authService.isSuperAdmin()) {
    return true;
  }
  // Org admins with a valid session get sent to their home instead of login.
  if (authService.currentUser() && authService.isOrgAdmin()) {
    router.navigate(['/org']);
    return false;
  }

  router.navigate(['/login']);
  return false;
};

/** Tier-1 org admins AND super-admins (super may inspect any org). */
export const orgAdminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await waitForAuth(authService);

  if (authService.currentUser() && (authService.isOrgAdmin() || authService.isSuperAdmin())) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

/** Any authenticated portal user (super or org). */
export const portalAuthGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await waitForAuth(authService);

  if (authService.currentUser() && authService.userRole() !== null) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
