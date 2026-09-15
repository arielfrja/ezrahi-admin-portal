import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const superAdminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait until the Firebase auth state (and super-admin check) resolves.
  while (authService.isLoading()) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (authService.currentUser() && authService.isSuperAdmin()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
