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
import { FirebaseService } from '../../services/firebase.service';
import { sendPasswordResetEmail } from 'firebase/auth';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

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
    MatProgressSpinnerModule,
    MatSnackBarModule
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
    private orgService: OrganizationService,
    private firebase: FirebaseService,
    private snackBar: MatSnackBar
  ) {
    // Default valid date: 1 year from now
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    this.orgForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      // Optional manual slug; empty => backend auto-generates the doc ID.
      orgId: ['', [Validators.pattern(/^[a-z0-9_-]+$/)]],
      adminEmail: ['', [Validators.required, Validators.email]],
      // Optional: empty => backend generates a random password and the portal
      // emails the admin a set-your-password link after registration.
      adminPassword: ['', [Validators.minLength(6)]],
      licenseStatus: ['ACTIVE', Validators.required],
      validUntilDate: [oneYearFromNow, Validators.required],
      maxActiveEvents: [5, [Validators.required, Validators.min(1)]]
    });
  }

  /** Suggest a close alternative when the requested slug is taken. */
  private suggestId(base: string): string {
    const suffix = Math.floor(10000 + Math.random() * 90000);
    return `${base}${suffix}`;
  }

  private isAlreadyExists(err: unknown): boolean {
    return (
      typeof err === 'object' && err !== null && 'code' in err &&
      (err as { code: unknown }).code === 'functions/already-exists'
    );
  }

  async onSubmit(): Promise<void> {
    if (this.orgForm.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const val = this.orgForm.value;
    const manualSlug = (val.orgId as string)?.trim() || undefined;
    const manualPassword = (val.adminPassword as string)?.trim() || undefined;
    try {
      await this.orgService.registerOrganization({
        name: val.name,
        orgId: manualSlug,
        adminEmail: val.adminEmail,
        adminPassword: manualPassword,
        licenseStatus: val.licenseStatus,
        validUntilDate: new Date(val.validUntilDate).toISOString(),
        maxActiveEvents: val.maxActiveEvents
      });

      this.dialogRef.close({ name: val.name, orgId: manualSlug ?? '' });

      // Auto-generated password: email the admin a set-your-password link.
      if (!manualPassword) {
        try {
          await sendPasswordResetEmail(this.firebase.auth, val.adminEmail);
          this.snackBar.open('נשלח דוא״ל להגדרת סיסמה למנהל הארגון.', 'אישור', { duration: 3500 });
        } catch {
          this.snackBar.open('הארגון נוצר, אך שליחת הדוא״ל נכשלה.', 'סגור', { duration: 4000 });
        }
      }
    } catch (err: unknown) {
      if (manualSlug && this.isAlreadyExists(err)) {
        const suggestion = this.suggestId(manualSlug);
        this.orgForm.patchValue({ orgId: suggestion });
        this.errorMessage.set('המזהה שבחרת תפוס. הכנסנו הצעה חלופית — ניתן לערוך אותה או ללחוץ רישום שוב.');
      } else {
        const detail = err instanceof Error ? err.message : '';
        this.errorMessage.set('רישום הארגון נכשל.' + (detail ? ` ${detail}` : ''));
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
