import { Component, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirebaseService } from '../../services/firebase.service';
import { sendPasswordResetEmail } from 'firebase/auth';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AppLoaderComponent } from '../app-loader/app-loader.component';

/** Firebase Auth error codes mapped to Hebrew messages. */
function toHebrewError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
      return 'פרטי ההתחברות שגויים.';
    case 'auth/too-many-requests':
      return 'יותר מדי ניסיונות. יש לנסות שוב מאוחר יותר.';
    case 'auth/network-request-failed':
      return 'שגיאת תקשורת. יש לבדוק את החיבור ולנסות שוב.';
    default:
      if (err instanceof Error && err.message.includes('PORTAL_UNAUTHORIZED')) {
        return 'משתמש זה אינו מורשה גישה לפורטל הניהול';
      }
      if (err instanceof Error && err.message.startsWith('Access denied')) {
        return 'משתמש זה אינו מורשה גישה לפורטל הניהול';
      }
      return 'ההתחברות נכשלה.';
  }
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    AppLoaderComponent
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginForm: FormGroup;
  errorMessage = signal<string | null>(null);
  isSubmitting = signal<boolean>(false);
  isSendingReset = signal<boolean>(false);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private firebase: FirebaseService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
    // Already signed in (e.g. reopened /login): skip to the role home.
    effect(() => {
      if (!this.auth.isLoading() && this.auth.currentUser()) {
        const home = this.auth.userRole() === 'super-admin' ? '/super-admin/organizations' : '/org';
        void this.router.navigate([home]);
      }
    });
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.value;
    try {
      const role = await this.auth.login(email, password);
      if (role === 'super-admin') {
        this.router.navigate(['/super-admin/organizations']);
      } else {
        this.router.navigate(['/org']);
      }
    } catch (err: unknown) {
      this.errorMessage.set(toHebrewError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Self-serve recovery for existing users (org admins added earlier). */
  async onForgotPassword(): Promise<void> {
    const emailCtrl = this.loginForm.get('email');
    const email = String(emailCtrl?.value ?? '').trim();
    if (!emailCtrl?.valid) {
      emailCtrl?.markAsTouched();
      this.snackBar.open('יש להזין כתובת דוא״ל תקינה ואז לנסות שוב.', 'סגור', { duration: 3500 });
      return;
    }
    this.isSendingReset.set(true);
    try {
      await sendPasswordResetEmail(this.firebase.auth, email);
      this.snackBar.open('נשלח דוא״ל לאיפוס סיסמה — יש לבדוק גם ספאם.', 'אישור', { duration: 5000 });
    } catch {
      // With enumeration protection the call may fail silently; same message.
      this.snackBar.open('אם הדוא״ל רשום, קישור איפוס נשלח אליו.', 'אישור', { duration: 5000 });
    } finally {
      this.isSendingReset.set(false);
    }
  }
}
