import { Component, OnInit, OnDestroy, signal, inject, ElementRef, ViewChild, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import * as maplibregl from 'maplibre-gl';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { EventRect, EventRoute } from '../../models/event.model';
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

/** Parse GPX track points as [lng, lat] (same as the command-center renderer). */
function parseGpxTrack(text: string): [number, number][] {
  const pts: [number, number][] = [];
  const re = /<trkpt[^>]*lat="([\d.\-]+)"[^>]*lon="([\d.\-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    pts.push([Number(m[2]), Number(m[1])]);
  }
  return pts;
}

/** Bounding box of a track (loop-safe for large point counts). */
function bboxOf(coords: [number, number][]): EventRect {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return { north, south, east, west };
}

/** Sides of a rectangle grabbed for resizing (edges and/or corners). */
interface ResizeSides {
  n?: boolean;
  s?: boolean;
  e?: boolean;
  w?: boolean;
}

function cursorForSides(s: ResizeSides): string {
  if ((s.n && s.w) || (s.s && s.e)) return 'nwse-resize';
  if ((s.n && s.e) || (s.s && s.w)) return 'nesw-resize';
  if (s.n || s.s) return 'ns-resize';
  return 'ew-resize';
}

function distToSegPx(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Expand a rect by `meters` on every side (clamped to valid lat/lng). */
function padRect(r: EventRect, meters: number): EventRect {
  const midLat = (r.north + r.south) / 2;
  const dLat = meters / 111320;
  const dLng = meters / (111320 * (Math.cos((midLat * Math.PI) / 180) || 1));
  return {
    north: Math.min(90, r.north + dLat),
    south: Math.max(-90, r.south - dLat),
    east: Math.min(180, r.east + dLng),
    west: Math.max(-180, r.west - dLng),
  };
}

/** Union bounding box of several rects. */
function unionBox(boxes: EventRect[]): EventRect {
  return boxes.reduce(
    (acc, r) => ({
      north: Math.max(acc.north, r.north),
      south: Math.min(acc.south, r.south),
      east: Math.max(acc.east, r.east),
      west: Math.min(acc.west, r.west),
    }),
    { ...boxes[0] },
  );
}
/** Discard degenerate drags (a click without drag); threshold ~10m. */
function isUsableRect(r: EventRect): boolean {
  return (r.north - r.south) * 111320 > 10 && (r.east - r.west) * 111320 > 10;
}

/** Group validator: effective end (default 23:59) must be after effective start (default 00:00). */
function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const v = group.value as { startDate: Date | null; startClock: Date | null; endDate: Date | null; endClock: Date | null };
  const eff = (date: unknown, clock: unknown, isEnd: boolean): number | null => {
    if (!(date instanceof Date) || isNaN(date.getTime())) return null;
    const t = new Date(date);
    if (clock instanceof Date && !isNaN(clock.getTime())) t.setHours(clock.getHours(), clock.getMinutes(), 0, 0);
    else if (isEnd) t.setHours(23, 59, 0, 0);
    else t.setHours(0, 0, 0, 0);
    return t.getTime();
  };
  const s = eff(v.startDate, v.startClock, false);
  const e = eff(v.endDate, v.endClock, true);
  return s != null && e != null && e <= s ? { order: true } : null;
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
    MatDatepickerModule,
    MatNativeDateModule,
    MatTimepickerModule,
  ],
  template: `
    <div class="page" dir="rtl">
      <h2>{{ isEdit() ? 'עריכת אירוע' : 'הקמת אירוע חדש' }}</h2>
      <p class="sub">שם · תאריך ושעות פעילות · מנהל מהמאגר · מסלול GPX או שטח אירוע במפה</p>

      <mat-card class="card">
        <form [formGroup]="form" (ngSubmit)="submit()" class="grid">
          @if (isSuper() && !isEdit()) {
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
            @if (form.get('name')?.hasError('required')) {
              <mat-error>שם האירוע חובה</mat-error>
            } @else if (form.get('name')?.hasError('minlength')) {
              <mat-error>לפחות 3 תווים</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>תאריך התחלה</mat-label>
            <input matInput [matDatepicker]="startDatePicker" formControlName="startDate" />
            <mat-datepicker-toggle matIconSuffix [for]="startDatePicker"></mat-datepicker-toggle>
            <mat-datepicker #startDatePicker></mat-datepicker>
            @if (form.get('startDate')?.hasError('required')) {
              <mat-error>תאריך התחלה חובה</mat-error>
            } @else if (form.get('startDate')?.hasError('matDatepickerParse')) {
              <mat-error>תאריך לא תקין</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>שעת התחלה</mat-label>
            <input matInput [matTimepicker]="startTimePicker" formControlName="startClock" placeholder="00:00" />
            <mat-timepicker-toggle matIconSuffix [for]="startTimePicker"></mat-timepicker-toggle>
            <mat-timepicker #startTimePicker></mat-timepicker>
            @if (form.get('startClock')?.invalid) {
              <mat-error>שעה לא תקינה (למשל 08:30)</mat-error>
            }
            <mat-hint>אופציונלי — ברירת מחדל 00:00</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>תאריך סיום</mat-label>
            <input matInput [matDatepicker]="endDatePicker" formControlName="endDate" />
            <mat-datepicker-toggle matIconSuffix [for]="endDatePicker"></mat-datepicker-toggle>
            <mat-datepicker #endDatePicker></mat-datepicker>
            @if (form.get('endDate')?.hasError('required')) {
              <mat-error>תאריך סיום חובה</mat-error>
            } @else if (form.get('endDate')?.hasError('matDatepickerParse')) {
              <mat-error>תאריך לא תקין</mat-error>
            } @else if (form.hasError('order')) {
              <mat-error>הסיום חייב להיות אחרי ההתחלה</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>שעת סיום</mat-label>
            <input matInput [matTimepicker]="endTimePicker" formControlName="endClock" placeholder="23:59" />
            <mat-timepicker-toggle matIconSuffix [for]="endTimePicker"></mat-timepicker-toggle>
            <mat-timepicker #endTimePicker></mat-timepicker>
            @if (form.get('endClock')?.invalid) {
              <mat-error>שעה לא תקינה (למשל 18:30)</mat-error>
            } @else if (form.hasError('order')) {
              <mat-error>הסיום חייב להיות אחרי ההתחלה</mat-error>
            }
            <mat-hint>אופציונלי — ברירת מחדל 23:59</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>מנהל אירוע (מהמאגר הקבוע)</mat-label>
            <mat-select formControlName="managerId">
              @for (s of staff(); track s.staffId) {
                <mat-option [value]="s.staffId">{{ s.name }} · {{ s.phone }}</mat-option>
              }
            </mat-select>
            @if (form.get('managerId')?.hasError('required')) {
              <mat-error>יש לבחור מנהל אירוע</mat-error>
            }
          </mat-form-field>

          <div class="full drop" [class.dragging]="dragOver()"
            (dragenter)="$event.preventDefault(); dragOver.set(true)"
            (dragover)="$event.preventDefault(); dragOver.set(true)"
            (dragleave)="dragOver.set(false)"
            (drop)="dragOver.set(false); onDrop($event)">
            <div class="drop-row">
              <button mat-flat-button color="primary" type="button" (click)="gpxInput.click()">
                <mat-icon>upload_file</mat-icon> בחירת קובץ GPX
              </button>
              <span class="hint">או גררו קובץ GPX לכאן</span>
            </div>
            <input #gpxInput hidden type="file" accept=".gpx,application/gpx+xml" (change)="onFile($event)" />
            @if (gpxName()) {
              <p class="ok">נבחר: {{ gpxName() }} · {{ gpxPoints() }} נקודות — המסלול מוצג על המפה · ניתן לשנות את גודל האזור בגרירת הגבול
                <button mat-button type="button" (click)="clearGpx()">הסר קובץ</button>
              </p>
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
            @if (loading()) {
              <p class="hint">טוען נתוני אירוע…</p>
            } @else if (editingIndex() !== null) {
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
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving() || !hasRoute()">
              @if (saving()) { <mat-spinner diameter="20"></mat-spinner> } @else { {{ isEdit() ? 'שמור שינויים' : 'צור אירוע והמשך להזמנות' }} }
            </button>
            @if (isEdit()) {
              <button mat-button type="button" (click)="cancelEdit()">ביטול</button>
            }
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
    .drop { border: 2px dashed #cbd5e1; border-radius: 8px; padding: 16px; transition: border-color 0.15s, background 0.15s; }
    .drop.dragging { border-color: #7c3aed; background: #f5f3ff; }
    .drop-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
    .hint { color: #64748b; font-size: 13px; } .ok { color: #15803d; }
    .ops { display: flex; gap: 8px; } .err { color: #b91c1c; }
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
  @ViewChild('gpxInput') gpxInput!: ElementRef<HTMLInputElement>;

  private fb = inject(FormBuilder);
  private events = inject(EventService);
  private staffSvc = inject(StaffService);
  private orgSvc = inject(OrganizationService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private ngZone = inject(NgZone);

  /** Event id when opened as /org/activities/:id/edit; null in create mode. */
  editId = signal<string | null>(null);
  /** Event id from the route when opened as .../activities/:id/edit. */
  private routeEventId: string | null = null;
  /** Edit data arrived (form + areas + initial camera ready). */
  private editReady = false;
  /** ngAfterViewInit ran before edit data arrived — init the map once it does. */
  private mapPending = false;
  /** Initial camera framing the event area (edit mode); null → default view. */
  private pendingView: { center: [number, number]; zoom: number } | null = null;
  loading = signal(false);
  /** GPX path already stored on the edited event (kept unless replaced/cleared). */
  private existingGpxPath: string | null = null;
  /** Route snapshot of the edited event (to preserve untouched customized areas). */
  private initialRoute: EventRoute | null = null;
  /** True while a file is dragged over the drop zone (focus highlight). */
  dragOver = signal(false);

  orgs = signal<Organization[]>([]);
  staff = signal<PermanentStaff[]>([]);
  saving = signal(false);
  error = signal<string | null>(null);
  gpxFile = signal<File | null>(null);
  gpxName = signal<string>('');
  gpxPoints = signal(0);
  private gpxCoords: [number, number][] = [];
  private gpxFitted = false;
  /** Editable GPX area (bbox + 500m padding at load; user-resizable after). */
  private gpxArea: EventRect | null = null;
  /** True once the user resizes the GPX area — then it is submitted as rects. */
  private gpxAreaDirty = false;
  /** Active edge/corner resize drag: which rect (or the GPX area) + which sides. */
  private resizeTarget: { sides: ResizeSides; rectIndex: number | 'gpx' } | null = null;
  private onWindowMouseUp = (): void => {
    this.endResize();
  };

  rects = signal<EventRect[]>([]);
  drawMode = signal(false);
  /** Index of the rect being re-drawn, or null when not editing. */
  editingIndex = signal<number | null>(null);

  private map: maplibregl.Map | null = null;
  private drawStart: maplibregl.LngLat | null = null;
  private preview: EventRect | null = null;

  form = this.fb.group(
    {
      orgId: ['', Validators.required],
      name: ['', [Validators.required, Validators.minLength(3)]],
      startDate: [null as Date | null, Validators.required],
      startClock: [null as Date | null],
      endDate: [null as Date | null, Validators.required],
      endClock: [null as Date | null],
      managerId: ['', Validators.required],
    },
    { validators: endAfterStart },
  );

  isSuper(): boolean {
    return this.auth.isSuperAdmin();
  }

  isEdit(): boolean {
    return this.editId() !== null;
  }

  /** Route coverage from a fresh upload, the stored GPX, or drawn rects. */
  hasRoute(): boolean {
    return !!this.gpxFile() || !!this.existingGpxPath || this.rects().length > 0;
  }

  cancelEdit(): void {
    void this.router.navigate(['/org/activities']);
  }

  /** Merge a datepicker date with an optional timepicker time into one Date.
   *  Missing time defaults to 00:00 for start, 23:59 for end. */
  private combine(date: Date | null, clock: Date | null, isEnd: boolean): Date | null {
    if (!date || isNaN(date.getTime())) return null;
    const d = new Date(date);
    if (clock && !isNaN(clock.getTime())) d.setHours(clock.getHours(), clock.getMinutes(), 0, 0);
    else if (isEnd) d.setHours(23, 59, 0, 0);
    else d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Normalize Firestore Timestamp | ISO string | Date to a Date. */
  private toDate(v: unknown): Date | null {
    if (!v) return null;
    if (typeof v === 'object' && v !== null && 'toDate' in v) {
      try {
        return (v as { toDate: () => Date }).toDate();
      } catch {
        return null;
      }
    }
    const d = new Date(v as string);
    return isNaN(d.getTime()) ? null : d;
  }

  ngOnInit(): void {
    this.routeEventId = this.route.snapshot.paramMap.get('id');
    const id = this.routeEventId;
    const current = this.auth.currentOrgId() ?? '';
    if (this.isSuper()) {
      this.orgSvc.getOrganizations().subscribe({
        next: (orgs) => {
          this.orgs.set(orgs);
          const pick = current && orgs.some((o) => o.orgId === current) ? current : (orgs[0]?.orgId ?? '');
          this.form.patchValue({ orgId: pick });
          this.loadStaff(pick);
          if (id) this.loadForEdit(id);
        },
      });
    } else {
      this.form.patchValue({ orgId: current });
      this.loadStaff(current);
      if (id) this.loadForEdit(id);
    }
  }

  /** Edit mode: prefill the form + areas from the stored event.
   *  The map is created only after the event data arrives, so its initial
   *  camera already frames the event area (no default-view flash). */
  private loadForEdit(id: string): void {
    this.loading.set(true);
    const unsub = this.events.watchEvent(id, (e) => {
      unsub();
      if (!e) {
        this.loading.set(false);
        this.snack.open('האירוע לא נמצא.', 'סגור', { duration: 3500 });
        void this.router.navigate(['/org/activities']);
        return;
      }
      this.editId.set(id);
      this.form.patchValue({ orgId: e.orgId, name: e.name, managerId: e.managerId });
      this.form.get('orgId')?.disable();
      const start = this.toDate(e.startTime);
      const end = this.toDate(e.endTime);
      if (start) this.form.patchValue({ startDate: new Date(start), startClock: new Date(start) });
      if (end) this.form.patchValue({ endDate: new Date(end), endClock: new Date(end) });
      this.loadStaff(e.orgId);
      const r = e.route ?? null;
      this.initialRoute = r;
      if (r?.rects?.length) {
        this.rects.set([...r.rects]);
      }
      this.pendingView = this.computeView([...this.rects()]);
      void (async () => {
        if (r?.gpxPath) await this.fetchExistingGpx(r.gpxPath);
        this.pendingView = this.computeView([
          ...this.rects(),
          ...(this.gpxArea ? [this.gpxArea] : []),
        ]);
        this.editReady = true;
        this.loading.set(false);
        if (this.mapPending) {
          this.mapPending = false;
          this.initMap();
        } else {
          this.ngZone.runOutsideAngular(() => {
            this.syncAreas();
            this.syncGpxPreview();
            this.fitEventArea();
          });
        }
      })();
    });
  }

  /** Initial camera framing the given boxes (or null for the default view). */
  private computeView(boxes: EventRect[]): { center: [number, number]; zoom: number } | null {
    if (boxes.length === 0) return null;
    const b = unionBox(boxes);
    const el = this.mapEl?.nativeElement;
    const w = el?.clientWidth || 700;
    const h = el?.clientHeight || 320;
    const spanLng = Math.max(b.east - b.west, 0.0005);
    const spanLat = Math.max(b.north - b.south, 0.0005);
    const zoom =
      Math.min(
        Math.log2((w * 360) / (spanLng * 512)),
        Math.log2((h * 180) / (spanLat * 512)),
        18,
      ) - 0.6; // padding margin
    return {
      center: [(b.west + b.east) / 2, (b.south + b.north) / 2],
      zoom: Math.max(5, zoom),
    };
  }

  /** Download the stored GPX of the edited event for preview + resize.
   *  Served by the getGpxPreview Function: direct Storage downloads are
   *  blocked by bucket CORS on some origins (e.g. localhost during dev). */
  private async fetchExistingGpx(path: string): Promise<void> {
    try {
      const { points, name } = await this.events.getGpxPreview(path);
      this.existingGpxPath = path;
      this.gpxName.set(name);
      if (points.length < 2) return;
      this.gpxCoords = points;
      this.gpxPoints.set(points.length);
      this.gpxFitted = false;
      this.gpxArea = padRect(bboxOf(points), 500);
      this.gpxAreaDirty = false;
    } catch {
      this.existingGpxPath = path;
      this.gpxName.set(path.split('/').pop() ?? path);
    }
  }

  ngAfterViewInit(): void {
    if (this.routeEventId && !this.editReady) this.mapPending = true;
    else this.initMap();
  }

  ngOnDestroy(): void {
    window.removeEventListener('mouseup', this.onWindowMouseUp);
    window.removeEventListener('blur', this.onWindowMouseUp);
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
    if (f) void this.handleGpxFile(f);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0];
    if (f) void this.handleGpxFile(f);
  }

  /** Parse the selected GPX immediately and preview track + area on the map. */
  private async handleGpxFile(f: File): Promise<void> {
    let coords: [number, number][];
    try {
      coords = parseGpxTrack(await f.text());
    } catch {
      this.snack.open('קריאת הקובץ נכשלה.', 'סגור', { duration: 3500 });
      return;
    }
    if (coords.length < 2) {
      this.snack.open('הקובץ אינו מכיל מסלול GPX תקין.', 'סגור', { duration: 3500 });
      return;
    }
    this.gpxFile.set(f);
    this.gpxName.set(f.name);
    this.gpxCoords = coords;
    this.gpxPoints.set(coords.length);
    this.gpxFitted = false;
    this.gpxArea = padRect(bboxOf(coords), 500);
    this.gpxAreaDirty = false;
    this.ngZone.runOutsideAngular(() => {
      this.syncGpxPreview();
      this.fitGpx();
    });
  }

  clearGpx(): void {
    this.gpxFile.set(null);
    this.gpxName.set('');
    this.existingGpxPath = null;
    this.gpxCoords = [];
    this.gpxPoints.set(0);
    this.gpxFitted = false;
    this.gpxArea = null;
    this.gpxAreaDirty = false;
    this.endResize();
    if (this.gpxInput) this.gpxInput.nativeElement.value = '';
    this.ngZone.runOutsideAngular(() => this.removeGpxLayers());
  }

  // ---- map: draw multiple rectangular event areas ----

  private initMap(): void {
    if (!this.mapEl || this.map) return;
    this.ngZone.runOutsideAngular(() => {
      this.map = new maplibregl.Map({
        container: this.mapEl.nativeElement,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        // Edit mode: initial camera already frames the event area (computed
        // from the stored route before the map is created — no default flash).
        center: this.pendingView?.center ?? [35.2137, 31.7683],
        zoom: this.pendingView?.zoom ?? 10,
      });
      this.map.addControl(new maplibregl.NavigationControl(), 'top-left');

      this.map.on('mousedown', (e) => {
        if (!this.drawMode() || (e.originalEvent.button ?? 0) !== 0) return;
        this.drawStart = e.lngLat;
      });
      this.map.on('mousedown', (e) => {
        // Edge/corner resize of a drawn rect or the GPX area (draw mode off).
        if (this.drawMode() || (e.originalEvent.button ?? 0) !== 0) return;
        const hit = this.resizeHit(e.lngLat);
        if (!hit) return;
        this.resizeTarget = hit;
        this.map?.dragPan.disable();
      });
      this.map.on('mousemove', (e) => {
        if (this.resizeTarget) {
          this.updateResize(e.lngLat);
          return;
        }
        if (!this.drawMode() || !this.drawStart) {
          if (!this.drawMode() && (e.originalEvent.buttons ?? 0) === 0) this.updateHoverCursor(e.lngLat);
          return;
        }
        this.preview = rectBetween(this.drawStart, e.lngLat);
        this.syncAreas();
      });
      this.map.on('mouseup', (e) => {
        if (this.resizeTarget) {
          this.endResize();
          return;
        }
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
      this.map.on('load', () => {
        this.syncGpxPreview();
        this.fitGpx();
      });
      window.addEventListener('mouseup', this.onWindowMouseUp);
      window.addEventListener('blur', this.onWindowMouseUp);
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
    this.endResize();
    this.rects.set([]);
    this.editingIndex.set(null);
    this.syncAreas();
  }

  removeRect(i: number): void {
    if (this.resizeTarget && this.resizeTarget.rectIndex !== 'gpx') {
      const t = this.resizeTarget.rectIndex;
      if (i === t) this.endResize();
      else if (i < t) {
        const rt = this.resizeTarget;
        if (rt && rt.rectIndex !== 'gpx') rt.rectIndex = t - 1;
      }
    }
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

  // ---- style readiness + area framing ----

  /** Callbacks waiting for the style to become ready (flushed on next idle). */
  private styleReadyQueue: Array<() => void> = [];
  private styleReadyHooked = false;

  /** Run cb now if the style is ready, else once rendering settles.
   *  isStyleLoaded() is unreliable right inside the map 'load' handler
   *  (style churn from label overrides), so all sync/fit paths go through here. */
  private afterStyleReady(cb: () => void): void {
    const map = this.map;
    if (!map) return;
    if (map.isStyleLoaded()) {
      cb();
      return;
    }
    if (this.styleReadyQueue.length < 8) this.styleReadyQueue.push(cb);
    if (this.styleReadyHooked) return;
    this.styleReadyHooked = true;
    map.once('idle', () => {
      this.styleReadyHooked = false;
      const q = this.styleReadyQueue.splice(0);
      for (const fn of q) {
        try {
          fn();
        } catch {
          // map torn down mid-wait — drop
        }
      }
    });
  }

  /** Frame the event area on the map (edit mode + after GPX load).
   *  Prefers the GPX area when present, else the combined drawn rects. Once. */
  private eventAreaFramed = false;

  private fitEventArea(): void {
    if (!this.map || this.eventAreaFramed) return;
    const boxes = [...this.rects()];
    if (this.gpxArea) boxes.push(this.gpxArea);
    if (boxes.length === 0) return;
    if (!this.map.isStyleLoaded()) {
      this.afterStyleReady(() => this.fitEventArea());
      return;
    }
    const b = unionBox(boxes);
    this.map.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: 40, duration: 0 });
    this.eventAreaFramed = true;
  }

  /** Draw the selected GPX track plus its (resizable) area. */
  private syncGpxPreview(): void {
    if (!this.map) return;
    if (!this.map.isStyleLoaded()) {
      this.afterStyleReady(() => this.syncGpxPreview());
      return;
    }
    if (this.gpxCoords.length < 2 || !this.gpxArea) return;
    const box = this.gpxArea;
    const data = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [rectCoords(box)] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: this.gpxCoords },
        },
      ],
    };
    try {
      if (!this.map.getSource('gpx')) {
        this.map.addSource('gpx', { type: 'geojson', data });
        this.map.addLayer({ id: 'gpx-area-fill', type: 'fill', source: 'gpx', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.12 } });
        this.map.addLayer({ id: 'gpx-area-line', type: 'line', source: 'gpx', filter: ['==', '$type', 'Polygon'], paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [3, 2] } });
        this.map.addLayer({ id: 'gpx-track', type: 'line', source: 'gpx', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#7c3aed', 'line-width': 4 } });
      } else {
        void (this.map.getSource('gpx') as maplibregl.GeoJSONSource).setData(data);
      }
    } catch (err) {
      this.error.set('הצגת המסלול נכשלה: ' + String(err));
    }
  }

  private fitGpx(): void {
    if (!this.map || this.gpxFitted) return;
    if (!this.map.isStyleLoaded()) {
      this.afterStyleReady(() => this.fitGpx());
      return;
    }
    if (this.gpxCoords.length < 2 || !this.gpxArea) return;
    const box = this.gpxArea;
    // duration 0: jump immediately (animated ease freezes when the tab renders in background).
    this.map.fitBounds([[box.west, box.south], [box.east, box.north]], { padding: 40, duration: 0 });
    this.gpxFitted = true;
  }

  private removeGpxLayers(): void {
    if (!this.map) return;
    for (const id of ['gpx-track', 'gpx-area-line', 'gpx-area-fill']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('gpx')) this.map.removeSource('gpx');
  }
  // ---- edge/corner resize (Windows-style) for drawn rects + GPX area ----

  /** Hit-test rect borders (topmost drawn rect first), then the GPX area. */
  private resizeHit(lngLat: maplibregl.LngLat): { sides: ResizeSides; rectIndex: number | 'gpx' } | null {
    const map = this.map;
    if (!map) return null;
    const tol = 10;
    const p = map.project([lngLat.lng, lngLat.lat]);
    const testRect = (r: EventRect): ResizeSides | null => {
      const nw = map.project([r.west, r.north]);
      const ne = map.project([r.east, r.north]);
      const sw = map.project([r.west, r.south]);
      const se = map.project([r.east, r.south]);
      const nearPt = (q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
      if (nearPt(nw)) return { n: true, w: true };
      if (nearPt(ne)) return { n: true, e: true };
      if (nearPt(sw)) return { s: true, w: true };
      if (nearPt(se)) return { s: true, e: true };
      if (distToSegPx(p.x, p.y, nw.x, nw.y, ne.x, ne.y) <= tol) return { n: true };
      if (distToSegPx(p.x, p.y, sw.x, sw.y, se.x, se.y) <= tol) return { s: true };
      if (distToSegPx(p.x, p.y, nw.x, nw.y, sw.x, sw.y) <= tol) return { w: true };
      if (distToSegPx(p.x, p.y, ne.x, ne.y, se.x, se.y) <= tol) return { e: true };
      return null;
    };
    const list = this.rects();
    for (let k = list.length - 1; k >= 0; k--) {
      const sides = testRect(list[k]);
      if (sides) return { sides, rectIndex: k };
    }
    if (this.gpxArea) {
      const sides = testRect(this.gpxArea);
      if (sides) return { sides, rectIndex: 'gpx' };
    }
    return null;
  }

  private updateHoverCursor(lngLat: maplibregl.LngLat): void {
    const canvas = this.map?.getCanvas();
    if (!canvas) return;
    const hit = this.resizeHit(lngLat);
    canvas.style.cursor = hit ? cursorForSides(hit.sides) : '';
  }

  /** Apply the pointer position to the grabbed sides (min size ~10m). */
  private updateResize(lngLat: maplibregl.LngLat): void {
    const target = this.resizeTarget;
    if (!target) return;
    const current = target.rectIndex === 'gpx' ? this.gpxArea : this.rects()[target.rectIndex];
    if (!current) {
      this.endResize();
      return;
    }
    const midLat = (current.north + current.south) / 2;
    const minLatD = 10 / 111320;
    const minLngD = 10 / (111320 * (Math.cos((midLat * Math.PI) / 180) || 1));
    const r: EventRect = { ...current };
    if (target.sides.n) r.north = Math.min(90, Math.max(lngLat.lat, r.south + minLatD));
    if (target.sides.s) r.south = Math.max(-90, Math.min(lngLat.lat, r.north - minLatD));
    if (target.sides.e) r.east = Math.min(180, Math.max(lngLat.lng, r.west + minLngD));
    if (target.sides.w) r.west = Math.max(-180, Math.min(lngLat.lng, r.east - minLngD));
    if (target.rectIndex === 'gpx') {
      this.gpxArea = r;
      this.gpxAreaDirty = true;
      this.syncGpxPreview();
    } else {
      const idx = target.rectIndex;
      this.ngZone.run(() => {
        this.rects.update((list) => list.map((v, k) => (k === idx ? r : v)));
        this.syncAreas();
      });
    }
  }

  private endResize(): void {
    if (!this.resizeTarget) return;
    this.resizeTarget = null;
    if (this.map && !this.drawMode()) this.map.dragPan.enable();
    const canvas = this.map?.getCanvas();
    if (canvas) canvas.style.cursor = this.drawMode() ? 'crosshair' : '';
    this.syncAreas();
    this.syncGpxPreview();
  }

  /** Render all drawn rects (+ the in-progress preview) as GeoJSON polygons.
   *  The rect under edit (and the preview replacing it) renders orange. */
  private syncAreas(): void {
    if (!this.map) return;
    if (!this.map.isStyleLoaded()) {
      this.afterStyleReady(() => this.syncAreas());
      return;
    }
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
    const v = this.form.getRawValue();
    const start = this.combine(v.startDate ?? null, v.startClock ?? null, false);
    const end = this.combine(v.endDate ?? null, v.endClock ?? null, true);
    if (!start || !end) {
      this.error.set('יש לבחור תאריך ושעה להתחלה ולסיום.');
      return;
    }
    if (end.getTime() <= start.getTime()) {
      this.error.set('שעת הסיום חייבת להיות אחרי שעת ההתחלה.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const orgId = String(v.orgId ?? '');
      const file = this.gpxFile();
      // New upload wins; otherwise keep the stored GPX of the edited event.
      const gpxPath = file ? await this.events.uploadGpx(orgId, file) : (this.existingGpxPath ?? undefined);
      const route = gpxPath
        ? {
            gpxPath,
            ...(this.gpxAreaDirty && this.gpxArea
              ? { rects: [this.gpxArea] }
              : !file && this.initialRoute?.rects?.length
                ? { rects: this.initialRoute.rects }
                : {}),
          }
        : { rects: this.rects() };
      if (this.editId()) {
        await this.events.updateEvent(this.editId()!, {
          name: String(v.name ?? ''),
          managerId: String(v.managerId ?? ''),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          route,
        });
        this.snack.open('השינויים נשמרו.', 'אישור', { duration: 2500 });
        void this.router.navigate(['/org/activities']);
        return;
      }
      const eventId = await this.events.createEvent({
        orgId,
        name: String(v.name ?? ''),
        managerId: String(v.managerId ?? ''),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        ...route,
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
    return (this.isEdit() ? 'שמירת השינויים נכשלה: ' : 'יצירת האירוע נכשלה: ') + msg;
  }
}
