import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { OrganizationService } from '../../services/organization.service';

@Component({
  selector: 'app-register-org-dialog',
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
  templateUrl: './register-org-dialog.component.html',
  styleUrls: ['./register-org-dialog.component.scss']
})
export class RegisterOrgDialogComponent {
  orgForm: FormGroup;
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<RegisterOrgDialogComponent>,
    private orgService: OrganizationService
  ) {
    // Default valid date: 1 year from now
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    this.orgForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      orgId: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]],
      adminEmail: ['', [Validators.required, Validators.email]],
      adminPassword: ['ROTATED-SECRET-REMOVED', [Validators.required, Validators.minLength(6)]],
      licenseStatus: ['ACTIVE', Validators.required],
      validUntilDate: [oneYearFromNow, Validators.required],
      maxActiveEvents: [5, [Validators.required, Validators.min(1)]]
    });
  }

  // Auto-fill orgId slug when name changes
  onNameBlur(): void {
    const currentSlug = this.orgForm.get('orgId')?.value;
    if (!currentSlug) {
      const name = this.orgForm.get('name')?.value || '';
      const autoSlug = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      this.orgForm.patchValue({ orgId: autoSlug });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.orgForm.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const val = this.orgForm.value;
    try {
      await this.orgService.registerOrganization({
        name: val.name,
        orgId: val.orgId,
        adminEmail: val.adminEmail,
        adminPassword: val.adminPassword,
        licenseStatus: val.licenseStatus,
        validUntilDate: new Date(val.validUntilDate).toISOString(),
        maxActiveEvents: val.maxActiveEvents
      });

      this.dialogRef.close({ name: val.name, orgId: val.orgId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create organization';
      this.errorMessage.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
