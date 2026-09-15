import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

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
      if (err instanceof Error && err.message.startsWith('Access denied')) {
        return 'אין גישה: המשתמש אינו רשום כסופר-אדמין.';
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
    MatProgressSpinnerModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginForm: FormGroup;
  errorMessage = signal<string | null>(null);
  isSubmitting = signal<boolean>(false);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.value;
    try {
      await this.auth.login(email, password);
      this.router.navigate(['/organizations']);
    } catch (err: unknown) {
      this.errorMessage.set(toHebrewError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
