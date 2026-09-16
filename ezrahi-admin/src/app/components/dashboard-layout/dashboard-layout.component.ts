import { Component, signal, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../services/auth.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

/**
 * Task 3.2 — Dashboard Layout (RTL, responsive).
 * Sidebar + topbar: username, role badge, connectivity dot, logout.
 * Super-admins see org management; org-admins see staff/events/command.
 */
@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  template: `
    <div class="shell" dir="rtl">
      <mat-toolbar color="primary" class="topbar">
        <button mat-icon-button (click)="sidenavOpen.set(!sidenavOpen())" aria-label="תפריט">
          <mat-icon>menu</mat-icon>
        </button>
        <span class="brand">ניהול Ezrahi</span>
        <span class="role-badge" [ngClass]="roleClass()">{{ roleLabel() }}</span>
        <span class="spacer"></span>
        <span class="net" [matTooltip]="online() ? 'מקוון' : 'מנותק — שינויים יסונכרנו בחזרת הרשת'">
          <span class="dot" [class.on]="online()" [class.off]="!online()"></span>
          {{ online() ? 'מקוון' : 'אופליין' }}
        </span>
        <span class="user" [matTooltip]="email()">{{ email() }}</span>
        <button mat-icon-button (click)="logout()" matTooltip="התנתקות" aria-label="התנתקות">
          <mat-icon>logout</mat-icon>
        </button>
      </mat-toolbar>

      <mat-sidenav-container class="body">
        <mat-sidenav
          mode="side"
          position="start"
          [opened]="sidenavOpen()"
          class="sidenav"
        >
          <mat-nav-list>
            @for (item of navItems(); track item.path) {
              <a
                mat-list-item
                [routerLink]="item.path"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: false }"
              >
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          </mat-nav-list>
          @if (showOrgSwitcher()) {
            <div class="org-switch">
              <div class="org-label">ארגון פעיל</div>
              <div class="org-id"><code>{{ currentOrgId() }}</code></div>
            </div>
          }
        </mat-sidenav>
        <mat-sidenav-content class="content">
          <router-outlet />
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `,
  styles: [`
    .shell { height: 100vh; display: flex; flex-direction: column; }
    .topbar { flex: 0 0 auto; }
    .brand { font-weight: 600; margin-inline-start: 8px; }
    .spacer { flex: 1 1 auto; }
    .role-badge {
      font-size: 12px; font-weight: 600; border-radius: 999px;
      padding: 2px 10px; margin-inline-start: 12px;
      background: rgba(255,255,255,.2); color: #fff;
    }
    .role-badge.super { background: #f59e0b; color: #1f2937; }
    .role-badge.org { background: #22c55e; color: #052e16; }
    .net { display: flex; align-items: center; gap: 6px; font-size: 13px; margin-inline-end: 12px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot.on { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
    .dot.off { background: #f87171; box-shadow: 0 0 6px #f87171; }
    .user { font-size: 13px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .body { flex: 1 1 auto; }
    .sidenav { width: 240px; }
    .content { padding: 20px; background: #f8fafc; min-height: 100%; }
    .active { background: rgba(63,81,181,.12) !important; font-weight: 600; }
    .org-switch { padding: 12px 16px; border-top: 1px solid #e2e8f0; margin-top: 8px; }
    .org-label { font-size: 12px; color: #64748b; }
    .org-id code { font-size: 13px; }
    @media (max-width: 768px) {
      .user { display: none; }
      .content { padding: 12px; }
    }
  `],
})
export class DashboardLayoutComponent implements OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);

  sidenavOpen = signal(true);
  online = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);

  private onOnline = () => this.online.set(true);
  private onOffline = () => this.online.set(false);

  constructor() {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    if (window.innerWidth < 900) this.sidenavOpen.set(false);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }

  email(): string {
    return this.auth.currentUser()?.email ?? '';
  }

  roleLabel(): string {
    return this.auth.isSuperAdmin() ? 'סופר-אדמין' : 'מנהל ארגון';
  }

  roleClass(): string {
    return this.auth.isSuperAdmin() ? 'super' : 'org';
  }

  currentOrgId(): string {
    return this.auth.currentOrgId() ?? '';
  }

  showOrgSwitcher(): boolean {
    return !this.auth.isSuperAdmin() && this.auth.orgIds().length > 0;
  }

  navItems(): NavItem[] {
    if (this.auth.isSuperAdmin()) {
      return [
        { path: '/super-admin/organizations', label: 'ארגונים', icon: 'business' },
        { path: '/org', label: 'ניהול ארגוני (תצוגת מנהל)', icon: 'groups' },
      ];
    }
    return [
      { path: '/org/staff', label: 'כוח אדם קבוע', icon: 'groups' },
      { path: '/org/activities', label: 'אירועים', icon: 'event' },
      { path: '/org/activities/create', label: 'הקמת אירוע', icon: 'add_circle' },
    ];
  }

  logout(): void {
    void this.auth.logout();
  }
}
