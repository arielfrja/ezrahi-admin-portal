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
import { MatSliderModule } from '@angular/material/slider';
import { EventService } from '../../services/event.service';
import { StaffService } from '../../services/staff.service';
import { OrganizationService } from '../../services/organization.service';
import { AuthService } from '../../services/auth.service';
import { PermanentStaff } from '../../models/staff.model';
import { Organization } from '../../models/organization.model';

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
    MatSliderModule,
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
              <p class="hint">ללא קובץ — יש להגדיר שטח אירוע במפה למטה</p>
            }
          </div>

          <div class="full area-card">
            <label>שטח האירוע — לחצו על המפה למקם מרכז, גררו את הסמן לדיוק</label>
            <div #mapEl class="map"></div>
            <p class="hint" dir="ltr">
              מרכז: {{ centerLat().toFixed(5) }}, {{ centerLng().toFixed(5) }} · רדיוס: {{ radiusM() }} מ׳
            </p>
          </div>

          <div class="full radius-box">
            <label>רדיוס (מטר)</label>
            <mat-slider class="slider" min="100" max="20000" step="100">
              <input matSliderThumb formControlName="radiusM" (valueChange)="onRadiusChange($event)" />
            </mat-slider>
            <span class="radius-val" dir="ltr">{{ radiusM() }} מ׳</span>
          </div>

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
    .map { width: 100%; height: 320px; border-radius: 8px; overflow: hidden; margin-top: 8px; }
    .slider { width: 100%; }
    .radius-val { color: #475569; font-size: 13px; }
    .radius-box { display: flex; align-items: center; gap: 12px; }
    .radius-box .slider { flex: 1; }
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

  centerLat = signal(31.7683);
  centerLng = signal(35.2137);
  radiusM = signal(2000);

  private map: maplibregl.Map | null = null;
  private centerMarker: maplibregl.Marker | null = null;

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

  // ---- map: set center + radius for the event area ----

  private initMap(): void {
    if (!this.mapEl || this.map) return;
    this.ngZone.runOutsideAngular(() => {
      this.map = new maplibregl.Map({
        container: this.mapEl.nativeElement,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [this.centerLng(), this.centerLat()],
        zoom: 10,
      });
      this.map.addControl(new maplibregl.NavigationControl(), 'top-left');

      const el = document.createElement('div');
      el.style.cssText =
        'width:22px;height:22px;background:#7c3aed;border:3px solid #fff;' +
        'border-radius:50% 50% 50% 0;transform:rotate(-45deg);' +
        'box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:grab;';
      this.centerMarker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([this.centerLng(), this.centerLat()])
        .addTo(this.map);
      this.centerMarker.on('dragend', () => {
        const ll = this.centerMarker!.getLngLat();
        this.ngZone.run(() => this.setCenter(ll.lat, ll.lng));
      });

      this.map.on('click', (e) => {
        this.centerMarker?.setLngLat([e.lngLat.lng, e.lngLat.lat]);
        this.ngZone.run(() => this.setCenter(e.lngLat.lat, e.lngLat.lng));
      });

      this.map.on('load', () => this.redrawRadius());
    });
    this.redrawRadius();
  }

  private setCenter(lat: number, lng: number): void {
    this.centerLat.set(lat);
    this.centerLng.set(lng);
    this.form.patchValue({ centerLat: lat, centerLng: lng });
    this.redrawRadius();
  }

  onRadiusChange(v: number | null): void {
    const r = Number(v ?? 2000);
    this.radiusM.set(r);
    this.form.patchValue({ radiusM: r });
    this.redrawRadius();
  }

  /** Redraw the radius circle as a 64-segment polygon (no proj lib needed;
   *  lng scale corrected by cos(lat)). Uses GeoJSON source + style layers. */
  private redrawRadius(): void {
    if (!this.map || !this.map.isStyleLoaded()) return;
    const lat = this.centerLat();
    const lng = this.centerLng();
    const r = this.radiusM();
    const dLat = r / 111320;
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
    const dLng = r / (111320 * cosLat);
    const coords: [number, number][] = [];
    const segs = 64;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * 2 * Math.PI;
      coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
    }
    coords.push(coords[0]);
    const fc: maplibregl.GeoJSONFeature = {
      type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] },
    } as maplibregl.GeoJSONFeature;
    if (!this.map.getSource('area')) {
      this.map.addSource('area', { type: 'geojson', data: fc });
      this.map.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.18 } });
      this.map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [3, 2] } });
    } else {
      (this.map.getSource('area') as maplibregl.GeoJSONSource).setData(fc);
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
