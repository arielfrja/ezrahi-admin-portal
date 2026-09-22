import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AppLoaderComponent } from '../app-loader/app-loader.component';
import { MatCardModule } from '@angular/material/card';
import { StaffService } from '../../services/staff.service';
import { OrganizationService } from '../../services/organization.service';
import { AuthService } from '../../services/auth.service';
import { PermanentStaff, STAFF_ROLE_LABELS, STAFF_ROLE_OPTIONS } from '../../models/staff.model';
import { Organization } from '../../models/organization.model';

/** Task 5.1 — /org/staff: permanent roster CRUD (name/phone/email/role/active). */
@Component({
  selector: 'app-staff-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    AppLoaderComponent,
    MatCardModule,
  ],
  template: `
    <div class="page" dir="rtl">
      <div class="head">
        <div>
          <h2>מאגר עובדים קבועים</h2>
          <p class="sub">ניהול כוח האדם הארגוני — מוכן לשיוך לאירועים</p>
        </div>
        @if (isSuper()) {
          <mat-form-field appearance="outline" class="org-pick">
            <mat-label>ארגון</mat-label>
            <mat-select [value]="orgId()" (selectionChange)="orgId.set($event.value); load()">
              @for (o of orgs(); track o.orgId) {
                <mat-option [value]="o.orgId">{{ o.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </div>

      <mat-card class="form-card">
        <form [formGroup]="form" (ngSubmit)="save()" class="grid">
          <mat-form-field appearance="outline">
            <mat-label>שם מלא</mat-label>
            <input matInput formControlName="name" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>טלפון</mat-label>
            <input matInput formControlName="phone" dir="ltr" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>אימייל</mat-label>
            <input matInput formControlName="email" type="email" dir="ltr" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>תפקיד ברירת מחדל</mat-label>
            <mat-select formControlName="defaultRole">
              @for (r of roles; track r) {
                <mat-option [value]="r">{{ roleLabel(r) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <div class="actions">
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
              @if (saving()) { <app-loader size="sm" color="#fff"></app-loader> } @else { {{ editingId() ? 'שמור עריכה' : 'הוסף עובד' }} }
            </button>
            @if (editingId()) {
              <button mat-button type="button" (click)="cancelEdit()">ביטול</button>
            }
          </div>
        </form>
      </mat-card>

      <div class="mat-elevation-z2 table-wrap">
        @if (loading()) {
          <div class="loading-block"><app-loader size="lg"></app-loader> טוען עובדים…</div>
        } @else {
        <table mat-table [dataSource]="staff()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>שם</th>
            <td mat-cell *matCellDef="let s"><strong>{{ s.name }}</strong></td>
          </ng-container>
          <ng-container matColumnDef="phone">
            <th mat-header-cell *matHeaderCellDef>טלפון</th>
            <td mat-cell *matCellDef="let s"><span dir="ltr">{{ s.phone }}</span></td>
          </ng-container>
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>אימייל</th>
            <td mat-cell *matCellDef="let s">{{ s.email }}</td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>תפקיד</th>
            <td mat-cell *matCellDef="let s">{{ roleLabel(s.defaultRole) }}</td>
          </ng-container>
          <ng-container matColumnDef="active">
            <th mat-header-cell *matHeaderCellDef>פעיל</th>
            <td mat-cell *matCellDef="let s">
              <mat-slide-toggle [checked]="s.active" [disabled]="busyId() === s.staffId" (change)="toggleActive(s, $event.checked)"></mat-slide-toggle>
            </td>
          </ng-container>
          <ng-container matColumnDef="ops">
            <th mat-header-cell *matHeaderCellDef>פעולות</th>
            <td mat-cell *matCellDef="let s">
              <button mat-icon-button color="primary" (click)="startEdit(s)" title="עריכה">
                <mat-icon>edit</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        </table>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1100px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    h2 { margin: 0; } .sub { margin: 0; color: #64748b; font-size: 13px; }
    .org-pick { width: 280px; }
    .form-card { padding: 16px; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; align-items: center; }
    .actions { display: flex; gap: 8px; }
    .table-wrap { background: #fff; border-radius: 8px; overflow: hidden; }
    table { width: 100%; }
    .loading-block { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px; color: #64748b; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
  `],
})
export class StaffListComponent implements OnInit {
  private fb = inject(FormBuilder);
  private staffSvc = inject(StaffService);
  private orgSvc = inject(OrganizationService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);

  cols = ['name', 'phone', 'email', 'role', 'active', 'ops'];
  roles = STAFF_ROLE_OPTIONS;
  staff = signal<PermanentStaff[]>([]);
  orgs = signal<Organization[]>([]);
  orgId = signal<string>(this.auth.currentOrgId() ?? '');
  saving = signal(false);
  loading = signal(true);
  busyId = signal<string | null>(null);
  editingId = signal<string | null>(null);
  private unsub: (() => void) | null = null;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.minLength(7)]],
    email: ['', [Validators.email]],
    defaultRole: ['guide', Validators.required],
    active: [true],
  });

  isSuper(): boolean {
    return this.auth.isSuperAdmin();
  }

  roleLabel(r: string): string {
    return STAFF_ROLE_LABELS[r] ?? r;
  }

  ngOnInit(): void {
    if (this.isSuper()) {
      this.orgSvc.getOrganizations().subscribe({
        next: (orgs) => {
          this.orgs.set(orgs);
          if (!this.orgId() && orgs.length > 0) this.orgId.set(orgs[0].orgId);
          this.load();
        },
      });
    } else {
      this.load();
    }
  }

  load(): void {
    const id = this.orgId();
    if (!id) return;
    this.loading.set(true);
    this.staffSvc.watchStaff(id).subscribe({
      next: (list) => {
        this.staff.set(list);
        this.loading.set(false);
      },
      error: (e: Error) => {
        this.snack.open('שגיאה בטעינת עובדים: ' + e.message, 'סגור', { duration: 3500 });
        this.loading.set(false);
      },
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const id = this.orgId();
    if (!id) {
      this.snack.open('בחר ארגון תחילה.', 'סגור', { duration: 3000 });
      return;
    }
    this.saving.set(true);
    try {
      const v = this.form.value;
      const payload = {
        name: String(v.name ?? ''),
        phone: String(v.phone ?? ''),
        email: String(v.email ?? ''),
        defaultRole: String(v.defaultRole ?? 'guide'),
        active: Boolean(v.active ?? true),
      };
      const edit = this.editingId();
      if (edit) {
        await this.staffSvc.updateStaff(id, edit, payload);
        this.snack.open('העובד עודכן.', 'אישור', { duration: 2500 });
      } else {
        await this.staffSvc.addStaff(id, payload);
        this.snack.open('העובד נוסף.', 'אישור', { duration: 2500 });
      }
      this.cancelEdit();
    } catch (e: unknown) {
      this.snack.open('שמירה נכשלה: ' + (e instanceof Error ? e.message : ''), 'סגור', { duration: 3500 });
    } finally {
      this.saving.set(false);
    }
  }

  startEdit(s: PermanentStaff): void {
    this.editingId.set(s.staffId);
    this.form.patchValue({
      name: s.name,
      phone: s.phone,
      email: s.email,
      defaultRole: s.defaultRole,
      active: s.active,
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ defaultRole: 'guide', active: true });
  }

  async toggleActive(s: PermanentStaff, active: boolean): Promise<void> {
    this.busyId.set(s.staffId);
    try {
      await this.staffSvc.setActive(this.orgId(), s.staffId, active);
    } catch (e: unknown) {
      this.snack.open('עדכון נכשל.', 'סגור', { duration: 3000 });
    } finally {
      this.busyId.set(null);
    }
  }
}
