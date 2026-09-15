import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { OrgListComponent } from './components/org-list/org-list.component';
import { superAdminGuard } from './guards/super-admin.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'organizations',
    component: OrgListComponent,
    canActivate: [superAdminGuard]
  },
  { path: '', redirectTo: 'organizations', pathMatch: 'full' },
  { path: '**', redirectTo: 'organizations' }
];
