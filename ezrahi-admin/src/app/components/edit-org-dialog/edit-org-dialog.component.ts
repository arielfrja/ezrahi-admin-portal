import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Organization } from '../../models/organization.model';
import { OrganizationService } from '../../services/organization.service';

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
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './edit-org-dialog.component.html',
  styleUrls: ['./edit-org-dialog.component.scss']
})
export class EditOrgDialogComponent {
  editForm: FormGroup;
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<EditOrgDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EditOrgDialogData,
    private orgService: OrganizationService
  ) {
    const org = data.org;
    this.editForm = this.fb.group({
      name: [org.name, [Validators.required, Validators.minLength(3)]],
      licenseStatus: [org.license.status, Validators.required],
      validUntilDate: [toDate(org.license.validUntil), Validators.required],
      maxActiveEvents: [org.license.maxActiveEvents, [Validators.required, Validators.min(1)]]
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
