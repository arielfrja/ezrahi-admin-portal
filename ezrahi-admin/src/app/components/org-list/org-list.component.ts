import { Component, Inject, LOCALE_ID, OnInit, signal } from '@angular/core';
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
import { EditOrgDialogComponent } from '../edit-org-dialog/edit-org-dialog.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

/** License status codes mapped to Hebrew display labels. Data stays in English. */
export const LICENSE_STATUS_LABELS: Record<Organization['license']['status'], string> = {
  ACTIVE: 'פעיל',
  TRIAL: 'ניסיון',
  SUSPENDED: 'מושהה',
  EXPIRED: 'פג תוקף',
};

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
    private snackBar: MatSnackBar,
    @Inject(LOCALE_ID) private locale: string
  ) {}

  ngOnInit(): void {
    this.orgService.getOrganizations().subscribe({
      next: (data) => this.organizations.set(data),
      error: (err: Error) => this.snackBar.open(
        'שגיאה בטעינת הארגונים: ' + err.message,
        'סגור',
        { duration: 4000 }
      )
    });
  }

  statusLabel(status: Organization['license']['status']): string {
    return LICENSE_STATUS_LABELS[status] ?? status;
  }

  reactivateLabel = 'הפעלה מחדש';
  suspendLabel = 'השהיה';

  eventsQuotaLabel(n: number | null | undefined): string {
    // 0 and null both mean unlimited (stored as null).
    if (n === null || n === 0) return 'ללא הגבלה';
    if (n === undefined) return '';
    if (n === 1) return 'אירוע אחד';
    return `${n} אירועים`;
  }

  openRegisterDialog(): void {
    const dialogRef = this.dialog.open(RegisterOrgDialogComponent, {
      width: '520px'
    });

    dialogRef.afterClosed().subscribe((result: { name: string; orgId: string } | undefined) => {
      if (result) {
        this.snackBar.open('הארגון נוצר בהצלחה.', 'אישור', { duration: 3000 });
      }
    });
  }

  // Edit organization info + license
  openEditDialog(org: Organization): void {
    const dialogRef = this.dialog.open(EditOrgDialogComponent, {
      width: '520px',
      data: { org }
    });

    dialogRef.afterClosed().subscribe((saved: boolean) => {
      if (saved) {
        this.snackBar.open('הארגון עודכן בהצלחה.', 'אישור', { duration: 2500 });
      }
    });
  }

  // Toggle Suspend / Reactivate
  toggleSuspend(org: Organization): void {
    const isSuspended = org.license.status === 'SUSPENDED';
    const newStatus = isSuspended ? 'ACTIVE' : 'SUSPENDED';

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: isSuspended ? 'הפעלה מחדש של הארגון' : 'השהיית הארגון',
        message: isSuspended ? 'להפעיל מחדש את הארגון?' : 'להשהות את הארגון?'
      }
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        try {
          await this.orgService.updateLicenseStatus(org.orgId, newStatus);
          this.snackBar.open('הסטטוס עודכן בהצלחה.', 'אישור', { duration: 2500 });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'הפעולה נכשלה.';
          this.snackBar.open(message, 'סגור', { duration: 3500 });
        }
      }
    });
  }

  // Delete Permanently
  deleteOrg(org: Organization): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'מחיקת הארגון',
        message: 'למחוק את הארגון לצמיתות? לא ניתן לבטל פעולה זו.'
      }
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        try {
          await this.orgService.deleteOrganization(org.orgId);
          this.snackBar.open('הארגון נמחק בהצלחה.', 'אישור', { duration: 2500 });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'הפעולה נכשלה.';
          this.snackBar.open(message, 'סגור', { duration: 3500 });
        }
      }
    });
  }

  formatDate(timestamp: unknown): string {
    if (!timestamp) return 'לא זמין';
    if (typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp &&
        typeof (timestamp as { toDate: unknown }).toDate === 'function') {
      return (timestamp as { toDate: () => Date }).toDate().toLocaleDateString(this.locale);
    }
    return new Date(timestamp as string | number | Date).toLocaleDateString(this.locale);
  }

  logout(): void {
    this.auth.logout();
  }
}
