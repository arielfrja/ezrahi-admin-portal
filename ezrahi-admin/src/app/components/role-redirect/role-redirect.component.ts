import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/** Root landing: sends super-admins to /super-admin, org-admins to /org. */
@Component({
  selector: 'app-role-redirect',
  standalone: true,
  template: `<p style="padding:24px">טוען…</p>`,
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
