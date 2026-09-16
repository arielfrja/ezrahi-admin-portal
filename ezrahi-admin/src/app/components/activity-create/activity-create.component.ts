import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EventService } from '../../services/event.service';
import { StaffService } from '../../services/staff.service';
import { OrganizationService } from '../../services/organization.service';
import { AuthService } from '../../services/auth.service';
import { PermanentStaff } from '../../models/staff.model';
import { Organization } from '../../models/organization.model';

/** Task 5.2 — /org/activities/create: name + hours + manager + GPX/center+radius. */
@Component({
  selector: 'app-activity-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCardModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="page" dir="rtl">
      <h2>הקמת אירוע חדש</h2>
      <p class="sub">שם · שעות פעילות · מנהל מהמאגר · מסלול GPX או מרכז+רדיוס</p>

      <mat-card class="card">
        <form [formGroup]="form" (ngSubmit)="submit()" class="grid">
          @if (isSuper()) {
            <mat-form-field appearance="outline" class="full">
              <mat-label>ארגון</mat-label>
              <mat-select formControlName="orgId" (selectionChange)="onOrgChange($event.value)">
                @for (o of orgs(); track o.orgId) {
                  <mat-option [value]="o.orgId">{{ o.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          <mat-form-field appearance="outline" class="full">
            <mat-label>שם האירוע</mat-label>
            <input matInput formControlName="name" placeholder="טיול פסח שכבה ח׳" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>התחלה</mat-label>
            <input matInput formControlName="startTime" type="datetime-local" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>סיום</mat-label>
            <input matInput formControlName="endTime" type="datetime-local" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>מנהל אירוע (מהמאגר הקבוע)</mat-label>
            <mat-select formControlName="managerId">
              @for (s of staff(); track s.staffId) {
                <mat-option [value]="s.staffId">{{ s.name }} · {{ s.phone }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <div class="full drop" (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
            <label>קובץ מסלול GPX (גרור לכאן או בחר)</label>
            <input type="file" accept=".gpx,application/gpx+xml" (change)="onFile($event)" />
            @if (gpxName()) {
              <p class="ok">נבחר: {{ gpxName() }}</p>
            } @else {
              <p class="hint">ללא קובץ — יש להזין מרכז ורדיוס למטה</p>
            }
          </div>

          <mat-form-field appearance="outline">
            <mat-label>מרכז — קו רוחב (lat)</mat-label>
            <input matInput formControlName="centerLat" type="number" step="any" dir="ltr" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>מרכז — קו אורך (lng)</mat-label>
            <input matInput formControlName="centerLng" type="number" step="any" dir="ltr" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>רדיוס (מטר)</mat-label>
            <input matInput formControlName="radiusM" type="number" min="100" dir="ltr" />
          </mat-form-field>

          <div class="full ops">
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
              @if (saving()) { <mat-spinner diameter="20"></mat-spinner> } @else { צור אירוע והמשך להזמנות }
            </button>
          </div>
          @if (error()) {
            <p class="full err">{{ error() }}</p>
          }
        </form>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { max-width: 800px; margin: 0 auto; }
    h2 { margin: 0; } .sub { color: #64748b; font-size: 13px; }
    .card { padding: 20px; margin-top: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .full { grid-column: 1 / -1; }
    .drop { border: 2px dashed #cbd5e1; border-radius: 8px; padding: 16px; }
    .hint { color: #64748b; font-size: 13px; } .ok { color: #15803d; }
    .ops { display: flex; } .err { color: #b91c1c; }
  `],
})
export class ActivityCreateComponent implements OnInit {
  private fb = inject(FormBuilder);
  private events = inject(EventService);
  private staffSvc = inject(StaffService);
  private orgSvc = inject(OrganizationService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private router = inject(Router);

  orgs = signal<Organization[]>([]);
  staff = signal<PermanentStaff[]>([]);
  saving = signal(false);
  error = signal<string | null>(null);
  gpxFile = signal<File | null>(null);
  gpxName = signal<string>('');

  form = this.fb.group({
    orgId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3)]],
    startTime: ['', Validators.required],
    endTime: ['', Validators.required],
    managerId: ['', Validators.required],
    centerLat: [31.7683],
    centerLng: [35.2137],
    radiusM: [2000, [Validators.min(100)]],
  });

  isSuper(): boolean {
    return this.auth.isSuperAdmin();
  }

  ngOnInit(): void {
    const current = this.auth.currentOrgId() ?? '';
    if (this.isSuper()) {
      this.orgSvc.getOrganizations().subscribe({
        next: (orgs) => {
          this.orgs.set(orgs);
          const pick = current && orgs.some((o) => o.orgId === current) ? current : (orgs[0]?.orgId ?? '');
          this.form.patchValue({ orgId: pick });
          this.loadStaff(pick);
        },
      });
    } else {
      this.form.patchValue({ orgId: current });
      this.loadStaff(current);
    }
  }

  onOrgChange(orgId: string): void {
    this.loadStaff(orgId);
  }

  private loadStaff(orgId: string): void {
    if (!orgId) return;
    this.staffSvc.watchStaff(orgId).subscribe({
      next: (list) => this.staff.set(list.filter((s) => s.active)),
    });
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) {
      this.gpxFile.set(f);
      this.gpxName.set(f.name);
    }
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0];
    if (f) {
      this.gpxFile.set(f);
      this.gpxName.set(f.name);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const v = this.form.value;
      const orgId = String(v.orgId ?? '');
      let gpxPath: string | undefined;
      const file = this.gpxFile();
      if (file) {
        gpxPath = await this.events.uploadGpx(orgId, file);
      }
      const eventId = await this.events.createEvent({
        orgId,
        name: String(v.name ?? ''),
        managerId: String(v.managerId ?? ''),
        startTime: new Date(String(v.startTime)).toISOString(),
        endTime: new Date(String(v.endTime)).toISOString(),
        ...(gpxPath
          ? { gpxPath }
          : {
              center: { lat: Number(v.centerLat), lng: Number(v.centerLng) },
              radiusM: Number(v.radiusM ?? 2000),
            }),
      });
      this.snack.open('האירוע נוצר.', 'אישור', { duration: 2500 });
      void this.router.navigate(['/org/activities', eventId, 'invites']);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'יצירה נכשלה.';
      this.error.set(this.toHebrew(msg));
    } finally {
      this.saving.set(false);
    }
  }

  private toHebrew(msg: string): string {
    if (msg.includes('quota') || msg.includes('resource-exhausted')) return 'מכסת האירועים הפעילים נוצלה — לא ניתן ליצור אירוע נוסף.';
    if (msg.includes('license')) return 'רישיון הארגון אינו פעיל או שפג תוקפו — לא ניתן ליצור אירוע.';
    return 'יצירת האירוע נכשלה: ' + msg;
  }
}
