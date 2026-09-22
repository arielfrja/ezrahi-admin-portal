import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../services/auth.service';

/** Root landing: sends super-admins to /super-admin, org-admins to /org. */
@Component({
  selector: 'app-role-redirect',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  template: `<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:48px;color:#64748b"><mat-spinner diameter="32"></mat-spinner> טוען…</div>`,
})
export class RoleRedirectComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  ngOnInit(): void {
    const deadline = Date.now() + 5000;
    const tick = () => {
      if (this.auth.isLoading() && Date.now() < deadline) {
        setTimeout(tick, 50);
        return;
      }
      if (this.auth.isSuperAdmin()) {
        void this.router.navigate(['/super-admin/organizations']);
      } else if (this.auth.isOrgAdmin()) {
        void this.router.navigate(['/org']);
      } else {
        void this.router.navigate(['/login']);
      }
    };
    tick();
  }
}
