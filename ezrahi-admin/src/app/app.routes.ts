import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { OrgListComponent } from './components/org-list/org-list.component';
import { DashboardLayoutComponent } from './components/dashboard-layout/dashboard-layout.component';
import { RoleRedirectComponent } from './components/role-redirect/role-redirect.component';
import { StaffListComponent } from './components/staff-list/staff-list.component';
import { ActivityListComponent } from './components/activity-list/activity-list.component';
import { ActivityCreateComponent } from './components/activity-create/activity-create.component';
import { InvitesGeneratorComponent } from './components/invites-generator/invites-generator.component';
import { CommandCenterComponent } from './components/command-center/command-center.component';
import { superAdminGuard, orgAdminGuard } from './guards/super-admin.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'super-admin',
    component: DashboardLayoutComponent,
    canActivate: [superAdminGuard],
    children: [
      { path: 'organizations', component: OrgListComponent },
      { path: '', redirectTo: 'organizations', pathMatch: 'full' },
    ],
  },
  {
    path: 'org',
    component: DashboardLayoutComponent,
    canActivate: [orgAdminGuard],
    children: [
      { path: 'staff', component: StaffListComponent },
      { path: 'activities', component: ActivityListComponent },
      { path: 'activities/create', component: ActivityCreateComponent },
      { path: 'activities/:id/invites', component: InvitesGeneratorComponent },
      { path: '', redirectTo: 'activities', pathMatch: 'full' },
    ],
  },
  {
    path: 'command/:eventId',
    component: CommandCenterComponent,
    canActivate: [orgAdminGuard],
  },
  // Legacy portal path (pre-Milestone 3): keep working, redirect into shell.
  { path: 'organizations', redirectTo: 'super-admin/organizations' },
  { path: '', component: RoleRedirectComponent, pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];
