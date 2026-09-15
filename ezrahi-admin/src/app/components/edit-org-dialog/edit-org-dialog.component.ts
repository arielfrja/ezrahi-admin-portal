import { Component, Inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, map, startWith } from 'rxjs';
import { Organization } from '../../models/organization.model';
import { AdminUserInfo, OrganizationService } from '../../services/organization.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

export interface EditOrgDialogData {
  org: Organization;
}

function toDate(value: unknown): Date {
  if (typeof value === 'object' && value !== null && 'toDate' in value &&
      typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(value as string | number | Date);
}

@Component({
  selector: 'app-edit-org-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './edit-org-dialog.component.html',
  styleUrls: ['./edit-org-dialog.component.scss']
})
export class EditOrgDialogComponent implements OnInit {
  editForm: FormGroup;
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Admins management
  adminUids = signal<string[]>([]);
  allUsers = signal<AdminUserInfo[]>([]);
  usersLoading = signal<boolean>(true);
  userSearch = new FormControl('', { nonNullable: true });
  filteredUsers!: Observable<AdminUserInfo[]>;
  inviteEmail = '';
  adminsBusy = signal<boolean>(false);

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<EditOrgDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EditOrgDialogData,
    private orgService: OrganizationService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    const org = data.org;
    this.adminUids.set([...(org.orgAdmins ?? [])]);
    this.editForm = this.fb.group({
      name: [org.name, [Validators.required, Validators.minLength(3)]],
      licenseStatus: [org.license.status, Validators.required],
      validUntilDate: [toDate(org.license.validUntil), Validators.required],
      maxActiveEvents: [org.license.maxActiveEvents, [Validators.required, Validators.min(1)]]
    });
  }

  ngOnInit(): void {
    this.filteredUsers = this.userSearch.valueChanges.pipe(
      startWith(''),
      map((term) => this.filterUsers(term ?? ''))
    );
    this.orgService.listUsers().then(
      (users) => {
        this.allUsers.set(users);
        this.usersLoading.set(false);
      },
      () => this.usersLoading.set(false)
    );
  }

  private filterUsers(term: string): AdminUserInfo[] {
    const q = term.trim().toLowerCase();
    const current = new Set(this.adminUids());
    return this.allUsers()
      .filter((u) => !current.has(u.uid))
      .filter((u) => !q || u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q));
  }

  adminLabel(uid: string): string {
    const found = this.allUsers().find((u) => u.uid === uid);
    if (found && found.email) return found.email;
    return uid.slice(0, 8) + '…';
  }

  async addAdmin(email: string): Promise<void> {
    const clean = email.trim();
    if (!clean) return;
    this.adminsBusy.set(true);
    try {
      const res = await this.orgService.addOrgAdmin(this.data.org.orgId, clean);
      if (!this.adminUids().includes(res.uid)) {
        this.adminUids.update((ids) => [...ids, res.uid]);
      }
      this.userSearch.setValue('');
      this.inviteEmail = '';
      this.snackBar.open(
        res.created ? 'משתמש חדש הוזמן והוגדר כמנהל.' : 'המנהל נוסף לארגון.',
        'אישור',
        { duration: 2500 }
      );
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : '';
      this.snackBar.open('הוספת מנהל נכשלה.' + (detail ? ` ${detail}` : ''), 'סגור', { duration: 3500 });
    } finally {
      this.adminsBusy.set(false);
    }
  }

  removeAdmin(uid: string): void {
    if (this.adminUids().length <= 1) {
      this.snackBar.open('לא ניתן להסיר את המנהל האחרון.', 'סגור', { duration: 3000 });
      return;
    }
    const confirmRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'הסרת מנהל',
        message: `להסיר את ${this.adminLabel(uid)} ממנהלי הארגון?`
      }
    });
    confirmRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (!confirmed) return;
      this.adminsBusy.set(true);
      try {
        await this.orgService.removeOrgAdmin(this.data.org.orgId, uid);
        this.adminUids.update((ids) => ids.filter((id) => id !== uid));
        this.snackBar.open('המנהל הוסר.', 'אישור', { duration: 2500 });
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : '';
        this.snackBar.open('הסרת מנהל נכשלה.' + (detail ? ` ${detail}` : ''), 'סגור', { duration: 3500 });
      } finally {
        this.adminsBusy.set(false);
      }
    });
  }

  async onSubmit(): Promise<void> {
    if (this.editForm.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const val = this.editForm.value;
    try {
      await this.orgService.updateOrganization(this.data.org.orgId, {
        name: val.name,
        status: val.licenseStatus,
        validUntil: new Date(val.validUntilDate),
        maxEvents: val.maxActiveEvents
      });
      this.dialogRef.close(true);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : '';
      this.errorMessage.set('עדכון הארגון נכשל.' + (detail ? ` ${detail}` : ''));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
