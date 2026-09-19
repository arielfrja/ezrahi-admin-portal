import { Component, OnInit, OnDestroy, signal, inject, ElementRef, ViewChild, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import * as maplibregl from 'maplibre-gl';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { EventRect } from '../../models/event.model';
import { EventService } from '../../services/event.service';
import { StaffService } from '../../services/staff.service';
import { OrganizationService } from '../../services/organization.service';
import { AuthService } from '../../services/auth.service';
import { applyHebrewLabels } from '../../utils/hebrew-labels';
import { PermanentStaff } from '../../models/staff.model';
import { Organization } from '../../models/organization.model';

interface DrawnFeature {
  type: 'Feature';
  properties: { editing: boolean };
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
}

/** Bounds of the drag from corner a to corner b (order-independent). */
function rectBetween(a: maplibregl.LngLat, b: maplibregl.LngLat): EventRect {
  return {
    north: Math.max(a.lat, b.lat),
    south: Math.min(a.lat, b.lat),
    east: Math.max(a.lng, b.lng),
    west: Math.min(a.lng, b.lng),
  };
}

function rectCoords(r: EventRect): [number, number][] {
  return [
    [r.west, r.south],
    [r.east, r.south],
    [r.east, r.north],
    [r.west, r.north],
    [r.west, r.south],
  ];
}

/** Discard degenerate drags (a click without drag); threshold ~10m. */
function isUsableRect(r: EventRect): boolean {
  return (r.north - r.south) * 111320 > 10 && (r.east - r.west) * 111320 > 10;
}

/** Task 5.2 — /org/activities/create: name + hours + manager + GPX / map-set area. */
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
    MatIconModule,
  ],
  template: `
    <div class="page" dir="rtl">
      <h2>הקמת אירוע חדש</h2>
      <p class="sub">שם · שעות פעילות · מנהל מהמאגר · מסלול GPX או שטח אירוע במפה</p>

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
              <p class="hint">ללא קובץ — יש לסמן שטח אחד לפחות במפה למטה</p>
            }
          </div>

          <div class="full area-card">
            <div class="area-bar">
              <label>שטחי האירוע — מלבנים על המפה (ניתן לסמן כמה)</label>
              <div class="area-ops">
                <button mat-stroked-button color="primary" type="button" (click)="toggleDraw()">
                  {{ drawMode() ? 'סיום סימון' : 'סימון שטח' }}
                </button>
                <button mat-button type="button" (click)="clearAll()" [disabled]="rects().length === 0">נקה הכל</button>
              </div>
            </div>
            <div #mapEl class="map" [class.drawing]="drawMode()"></div>
            @if (editingIndex() !== null) {
              <p class="hint">מצב עריכה: גררו מלבן חדש במקום שטח {{ editingIndex()! + 1 }}</p>
            } @else if (drawMode()) {
              <p class="hint">גררו מלבן על המפה — בסיום לחצו שוב על "סיום סימון"</p>
            } @else {
              <p class="hint">סומנו {{ rects().length }} שטחים · לחצו "סימון שטח" ואז גררו מלבן על המפה</p>
            }
            @if (rects().length > 0) {
              <div class="rect-list">
                @for (r of rects(); track $index) {
                  <span class="rect-chip" [class.editing]="editingIndex() === $index">שטח {{ $index + 1 }}
                    <button mat-icon-button type="button" (click)="startEdit($index)" title="ערוך שטח">
                      <mat-icon>{{ editingIndex() === $index ? 'close' : 'edit' }}</mat-icon>
                    </button>
                    <button mat-icon-button type="button" (click)="removeRect($index)" title="מחק שטח">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </span>
                }
              </div>
            }
          </div>

          <div class="full ops">
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving() || (!gpxFile() && rects().length === 0)">
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
    .map { width: 100%; height: 320px; border-radius: 8px; overflow: hidden; margin-top: 8px; }
    .map.drawing { outline: 2px solid #7c3aed; }
    .area-bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .area-ops { display: flex; gap: 8px; align-items: center; }
    .rect-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .rect-chip { display: inline-flex; align-items: center; gap: 4px; background: #f1f5f9; border-radius: 999px; padding: 2px 6px 2px 12px; font-size: 13px; }
    .rect-chip.editing { background: #fef3c7; outline: 2px solid #f59e0b; }
  `],
})
export class ActivityCreateComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;

  private fb = inject(FormBuilder);
  private events = inject(EventService);
  private staffSvc = inject(StaffService);
  private orgSvc = inject(OrganizationService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private router = inject(Router);
  private ngZone = inject(NgZone);

  orgs = signal<Organization[]>([]);
  staff = signal<PermanentStaff[]>([]);
  saving = signal(false);
  error = signal<string | null>(null);
  gpxFile = signal<File | null>(null);
  gpxName = signal<string>('');

  rects = signal<EventRect[]>([]);
  drawMode = signal(false);
  /** Index of the rect being re-drawn, or null when not editing. */
  editingIndex = signal<number | null>(null);

  private map: maplibregl.Map | null = null;
  private drawStart: maplibregl.LngLat | null = null;
  private preview: EventRect | null = null;

  form = this.fb.group({
    orgId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3)]],
    startTime: ['', Validators.required],
    endTime: ['', Validators.required],
    managerId: ['', Validators.required],
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

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
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

  // ---- map: draw multiple rectangular event areas ----

  private initMap(): void {
    if (!this.mapEl || this.map) return;
    this.ngZone.runOutsideAngular(() => {
      this.map = new maplibregl.Map({
        container: this.mapEl.nativeElement,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [35.2137, 31.7683],
        zoom: 10,
      });
      this.map.addControl(new maplibregl.NavigationControl(), 'top-left');

      this.map.on('mousedown', (e) => {
        if (!this.drawMode() || (e.originalEvent.button ?? 0) !== 0) return;
        this.drawStart = e.lngLat;
      });
      this.map.on('mousemove', (e) => {
        if (!this.drawMode() || !this.drawStart) return;
        this.preview = rectBetween(this.drawStart, e.lngLat);
        this.syncAreas();
      });
      this.map.on('mouseup', (e) => {
        if (!this.drawMode() || !this.drawStart) return;
        const rect = rectBetween(this.drawStart, e.lngLat);
        this.drawStart = null;
        this.preview = null;
        if (!isUsableRect(rect)) {
          this.syncAreas();
          return;
        }
        this.ngZone.run(() => {
          const idx = this.editingIndex();
          if (idx == null) {
            this.rects.update((list) => [...list, rect].slice(0, 20));
            this.syncAreas();
          } else {
            // Replace the edited rect, then leave edit + draw mode.
            this.rects.update((list) => list.map((r, k) => (k === idx ? rect : r)));
            this.editingIndex.set(null);
            if (this.drawMode()) this.toggleDraw();
            else this.syncAreas();
          }
        });
      });

      this.map.on('load', () => this.syncAreas());
      this.map.on('load', () => applyHebrewLabels(this.map!));
    });
    this.syncAreas();
  }

  toggleDraw(): void {
    this.drawMode.update((v) => !v);
    if (!this.drawMode()) this.editingIndex.set(null);
    this.drawStart = null;
    this.preview = null;
    this.syncAreas();
    const canvas = this.map?.getCanvas();
    if (canvas) canvas.style.cursor = this.drawMode() ? 'crosshair' : '';
    if (this.map) {
      if (this.drawMode()) this.map.dragPan.disable();
      else this.map.dragPan.enable();
    }
  }

  clearAll(): void {
    this.rects.set([]);
    this.editingIndex.set(null);
    this.syncAreas();
  }

  removeRect(i: number): void {
    if (this.editingIndex() === i) this.editingIndex.set(null);
    else if (this.editingIndex() != null && i < this.editingIndex()!) {
      this.editingIndex.update((v) => (v == null ? v : v - 1));
    }
    this.rects.update((list) => list.filter((_, k) => k !== i));
    this.syncAreas();
  }

  /** Enter edit mode for rect i: the next drawn rectangle replaces it.
   *  Clicking the same rect again cancels editing. */
  startEdit(i: number): void {
    if (this.editingIndex() === i) {
      this.editingIndex.set(null);
      if (this.drawMode()) this.toggleDraw();
      else this.syncAreas();
      return;
    }
    this.editingIndex.set(i);
    if (!this.drawMode()) this.toggleDraw();
    else {
      this.drawStart = null;
      this.preview = null;
      this.syncAreas();
    }
  }

  /** Render all drawn rects (+ the in-progress preview) as GeoJSON polygons.
   *  The rect under edit (and the preview replacing it) renders orange. */
  private syncAreas(): void {
    if (!this.map || !this.map.isStyleLoaded()) return;
    const editing = this.editingIndex();
    const feats: DrawnFeature[] = this.rects().map((r, k) => ({
      type: 'Feature',
      properties: { editing: editing === k },
      geometry: { type: 'Polygon', coordinates: [rectCoords(r)] },
    }));
    if (this.preview) {
      feats.push({
        type: 'Feature',
        properties: { editing: true },
        geometry: { type: 'Polygon', coordinates: [rectCoords(this.preview)] },
      });
    }
    const fc: { type: 'FeatureCollection'; features: DrawnFeature[] } = {
      type: 'FeatureCollection',
      features: feats,
    };
    if (!this.map.getSource('areas')) {
      this.map.addSource('areas', { type: 'geojson', data: fc });
      this.map.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': ['case', ['==', ['get', 'editing'], true], '#f59e0b', '#7c3aed'], 'fill-opacity': 0.18 } });
      this.map.addLayer({ id: 'areas-line', type: 'line', source: 'areas', paint: { 'line-color': ['case', ['==', ['get', 'editing'], true], '#f59e0b', '#7c3aed'], 'line-width': 2, 'line-dasharray': [3, 2] } });
    } else {
      void (this.map.getSource('areas') as maplibregl.GeoJSONSource).setData(fc);
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
        ...(gpxPath ? { gpxPath } : { rects: this.rects() }),
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
