import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrganizationService } from '../../services/organization.service';
import { AuthService } from '../../services/auth.service';
import { Organization } from '../../models/organization.model';

import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';

import { RegisterOrgDialogComponent } from '../register-org-dialog/register-org-dialog.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-org-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatToolbarModule
  ],
  templateUrl: './org-list.component.html',
  styleUrls: ['./org-list.component.scss']
})
export class OrgListComponent implements OnInit {
  displayedColumns: string[] = ['name', 'orgId', 'status', 'validUntil', 'maxEvents', 'actions'];
  organizations = signal<Organization[]>([]);

  constructor(
    private orgService: OrganizationService,
    private auth: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.orgService.getOrganizations().subscribe({
      next: (data) => this.organizations.set(data),
      error: (err: Error) => this.snackBar.open('Error loading organizations: ' + err.message, 'Close', { duration: 4000 })
    });
  }

  openRegisterDialog(): void {
    const dialogRef = this.dialog.open(RegisterOrgDialogComponent, {
      width: '520px'
    });

    dialogRef.afterClosed().subscribe((result: { name: string; orgId: string } | undefined) => {
      if (result) {
        this.snackBar.open(`Organization "${result.name}" created successfully.`, 'OK', { duration: 3000 });
      }
    });
  }

  // Toggle Suspend / Reactivate
  toggleSuspend(org: Organization): void {
    const isSuspended = org.license.status === 'SUSPENDED';
    const newStatus = isSuspended ? 'ACTIVE' : 'SUSPENDED';

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: isSuspended ? 'Reactivate Organization' : 'Suspend Organization',
        message: `Are you sure you want to change the status of ${org.name} to ${newStatus}?`
      }
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        try {
          await this.orgService.updateLicenseStatus(org.orgId, newStatus);
          this.snackBar.open(`Organization is now ${newStatus}`, 'OK', { duration: 2500 });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Update failed.';
          this.snackBar.open(message, 'Close', { duration: 3500 });
        }
      }
    });
  }

  // Delete Permanently
  deleteOrg(org: Organization): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Organization',
        message: `Are you sure you want to permanently delete ${org.name} (${org.orgId})? All data will be removed.`
      }
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        try {
          await this.orgService.deleteOrganization(org.orgId);
          this.snackBar.open('Organization deleted successfully', 'OK', { duration: 2500 });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Delete failed.';
          this.snackBar.open(message, 'Close', { duration: 3500 });
        }
      }
    });
  }

  formatDate(timestamp: unknown): string {
    if (!timestamp) return 'N/A';
    if (typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp &&
        typeof (timestamp as { toDate: unknown }).toDate === 'function') {
      return (timestamp as { toDate: () => Date }).toDate().toLocaleDateString('he-IL');
    }
    return new Date(timestamp as string | number | Date).toLocaleDateString('he-IL');
  }

  logout(): void {
    this.auth.logout();
  }
}
