import { Component, OnInit, OnDestroy, signal, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as maplibregl from 'maplibre-gl';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { FirebaseService } from '../../services/firebase.service';
import { EventService } from '../../services/event.service';
import { LiveService, LiveParticipant, LiveLocation, FieldIncident } from '../../services/live.service';
import { FieldEvent } from '../../models/event.model';
import { BASE_ROLES } from '../../models/event.model';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { applyHebrewLabels } from '../../utils/hebrew-labels';
import { Subscription } from 'rxjs';

const ROLE_COLORS: Record<string, string> = Object.fromEntries(BASE_ROLES.map((r) => [r.id, r.color]));

/**
 * Tasks 6.1–6.3 — Live Command Center (wide-screen HQ).
 * Full map + GPX + staff markers + urgency-sorted incident board + kill-switch.
 */
@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
    <div class="hq" dir="rtl">
      <div class="topbar">
        <div class="title">
          <h2>{{ event()?.name ?? 'טוען…' }}</h2>
          <span class="status" [ngClass]="event()?.status">{{ event()?.status }}</span>
          @if (archived()) {
            <span class="status ARCH">ארכיון — השידורים הופסקו</span>
          }
        </div>
        <div class="ops">
          <label class="gpx-drop" (dragover)="$event.preventDefault()" (drop)="onGpxDrop($event)" matTooltip="גרור קובץ GPX לעדכון המסלול">
            <mat-icon>upload</mat-icon> עדכן מסלול (GPX)
            <input type="file" accept=".gpx" hidden (change)="onGpxFile($event)" />
          </label>
          <button mat-flat-button color="warn" class="kill" (click)="killSwitch()" [disabled]="archived()">
            <mat-icon>stop_circle</mat-icon> סיום פעילות וסגירת שידורים
          </button>
        </div>
      </div>

      <div class="main">
        <div class="map-wrap">
          <div #mapEl class="map"></div>
          @if (!mapReady()) {
            <div class="map-loading">טוען מפה…</div>
          }
        </div>

        <aside class="side incidents">
          <h3>אירועי שטח ({{ incidents().length }})</h3>
          @for (inc of incidents(); track inc.incidentId) {
            <mat-card class="inc" [class.high]="inc.severity === 'HIGH'" (click)="flyTo(inc)">
              <div class="inc-head">
                <strong>{{ inc.title || inc.category }}</strong>
                <span class="sev" [class.high]="inc.severity === 'HIGH'">
                  {{ inc.severity === 'HIGH' ? 'דחוף' : 'רגיל' }}
                </span>
              </div>
              <p class="desc">{{ inc.desc }}</p>
              <p class="meta">{{ inc.category }} · {{ inc.status }}</p>
              <div class="row">
                <button mat-button color="primary" (click)="setStatus(inc, 'IN_PROGRESS'); $event.stopPropagation()">העבר לטיפול</button>
                <button mat-button color="warn" (click)="setStatus(inc, 'RESOLVED'); $event.stopPropagation()">סמן כטופל וסגור</button>
              </div>
            </mat-card>
          } @empty {
            <p class="empty">אין אירועים פתוחים.</p>
          }
        </aside>

        <aside class="side roster">
          <h3>מצבת כוחות ({{ participants().length }})</h3>
          @for (p of participants(); track p.uid) {
            <div class="person" (click)="flyToPerson(p)">
              <span class="dot" [style.background]="colorFor(p.role)"></span>
              <div class="who">
                <strong>{{ p.name }}</strong>
                <small>{{ roleTitle(p.role) }} · {{ lastSeen(p) }}</small>
              </div>
              @if (p.phone) {
                <a mat-icon-button [href]="'tel:' + p.phone" matTooltip="חייג" (click)="$event.stopPropagation()">
                  <mat-icon>call</mat-icon>
                </a>
              }
            </div>
          } @empty {
            <p class="empty">אין משתתפים עדיין.</p>
          }
        </aside>
      </div>
    </div>
  `,
  styles: [`
    .hq { height: calc(100vh - 64px); display: flex; flex-direction: column; }
    .topbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; }
    .title { display: flex; align-items: center; gap: 10px; }
    h2 { margin: 0; font-size: 20px; }
    .status { font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: #e0f2fe; color: #075985; }
    .status.COMPLETED, .status.ARCH { background: #fee2e2; color: #991b1b; }
    .status.ACTIVE { background: #dcfce7; color: #15803d; }
    .ops { display: flex; gap: 10px; align-items: center; }
    .gpx-drop { display: flex; align-items: center; gap: 6px; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
    .kill { font-weight: 700; }
    .main { flex: 1; display: grid; grid-template-columns: 1fr 320px 280px; gap: 0; min-height: 0; }
    .map-wrap { position: relative; min-height: 400px; }
    .map { position: absolute; inset: 0; }
    .map-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #f1f5f9; }
    .side { background: #fff; border-inline-start: 1px solid #e2e8f0; overflow-y: auto; padding: 12px; }
    .side h3 { margin: 0 0 8px; font-size: 15px; }
    .inc { margin-bottom: 10px; padding: 10px; cursor: pointer; }
    .inc.high { border: 2px solid #ef4444; animation: blink 1.2s infinite; }
    @keyframes blink { 50% { box-shadow: 0 0 12px #ef4444; } }
    .inc-head { display: flex; justify-content: space-between; align-items: center; }
    .sev { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #f1f5f9; }
    .sev.high { background: #ef4444; color: #fff; }
    .desc { margin: 6px 0; font-size: 13px; }
    .meta { margin: 0 0 6px; font-size: 12px; color: #64748b; }
    .row { display: flex; gap: 4px; }
    .empty { color: #94a3b8; font-size: 13px; }
    .person { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid #f1f5f9; cursor: pointer; }
    .person .dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; }
    .who { flex: 1; display: flex; flex-direction: column; }
    .who small { color: #64748b; }
    @media (max-width: 1100px) { .main { grid-template-columns: 1fr 280px; } .roster { display: none; } }
    @media (max-width: 800px) { .main { grid-template-columns: 1fr; } .side { display: none; } .map-wrap { min-height: 60vh; } }
  `],
})
export class CommandCenterComponent implements OnInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private fb = inject(FirebaseService);
  private events = inject(EventService);
  private live = inject(LiveService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  event = signal<FieldEvent | null>(null);
  participants = signal<LiveParticipant[]>([]);
  locations = signal<LiveLocation[]>([]);
  incidents = signal<FieldIncident[]>([]);
  mapReady = signal(false);
  archived = signal(false);

  private eventId = '';
  private subs: Subscription[] = [];
  private unwatchEvent: (() => void) | null = null;
  private map: maplibregl.Map | null = null;
  private staffMarkers = new Map<string, maplibregl.Marker>();
  private incidentMarkers = new Map<string, maplibregl.Marker>();

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('eventId') ?? '';
    if (!this.eventId) {
      this.snack.open('חסר מזהה אירוע.', 'סגור', { duration: 3000 });
      return;
    }
    this.unwatchEvent = this.events.watchEvent(this.eventId, (e) => {
      this.event.set(e);
      if (e?.status === 'COMPLETED') this.archived.set(true);
      if (e) void this.ensureRouteLayer(e);
    });
    this.subs.push(
      this.live.watchParticipants(this.eventId).subscribe({
        next: (list) => {
          this.participants.set(list);
          this.syncStaffMarkers();
        },
      }),
      this.live.watchLocations(this.eventId).subscribe({
        next: (list) => {
          this.locations.set(list);
          this.syncStaffMarkers();
        },
      }),
      this.live.watchIncidents(this.eventId).subscribe({
        next: (list) => {
          this.incidents.set(list);
          this.syncIncidentMarkers();
        },
      }),
    );
    this.initMap();
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.unwatchEvent?.();
    this.map?.remove();
  }

  // ---- map ----

  private initMap(): void {
    this.map = new maplibregl.Map({
      container: this.mapEl.nativeElement,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [35.2137, 31.7683],
      zoom: 10,
    });
    this.map.addControl(new maplibregl.NavigationControl(), 'top-left');
    this.map.on('load', () => {
      this.mapReady.set(true);
      applyHebrewLabels(this.map!);
      const e = this.event();
      if (e) void this.ensureRouteLayer(e);
      this.syncStaffMarkers();
      this.syncIncidentMarkers();
    });
  }

  private parseGpx(text: string): [number, number][] {
    const pts: [number, number][] = [];
    const re = /<trkpt[^>]*lat="([\d.\-]+)"[^>]*lon="([\d.\-]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      pts.push([Number(m[2]), Number(m[1])]);
    }
    return pts;
  }

  private async ensureRouteLayer(e: FieldEvent): Promise<void> {
    if (!this.map || !this.map.isStyleLoaded()) return;
    const gpxPath = e.route?.gpxPath;
    if (this.map.getSource('route')) return; // already drawn
    if (gpxPath) {
      try {
        const url = await getDownloadURL(storageRef(this.fb.storage, gpxPath));
        const text = await (await fetch(url)).text();
        const coords = this.parseGpx(text);
        if (coords.length > 1) {
          this.map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
          });
          this.map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#7c3aed', 'line-width': 4 } });
          const bounds = coords.reduce((b, c) => b.extend(c as [number, number]), new maplibregl.LngLatBounds(coords[0], coords[0]));
          this.map.fitBounds(bounds, { padding: 40 });
          return;
        }
      } catch {
        // fall through to center fallback
      }
    }
    const rects = e.route?.rects;
    if (Array.isArray(rects) && rects.length > 0) {
      const polys = rects.map((r) => [[
        [r.west, r.south],
        [r.east, r.south],
        [r.east, r.north],
        [r.west, r.north],
        [r.west, r.south],
      ]]);
      this.map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: polys.map((coordinates) => ({
            type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates },
          })),
        },
      });
      this.map.addLayer({ id: 'route-fill', type: 'fill', source: 'route', paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.18 } });
      this.map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [3, 2] } });
      const bounds = rects.reduce(
        (b, r) => b.extend([r.west, r.south]).extend([r.east, r.north]),
        new maplibregl.LngLatBounds([rects[0].west, rects[0].south], [rects[0].east, rects[0].north]),
      );
      this.map.fitBounds(bounds, { padding: 40 });
      return;
    }
    if (e.route?.center) {
      this.map.flyTo({ center: [e.route.center.lng, e.route.center.lat], zoom: 12 });
    }
  }

  private personPos(uid: string): [number, number] | null {
    const loc = this.locations().find((l) => l.uid === uid);
    return loc ? [loc.lng, loc.lat] : null;
  }

  colorFor(role: string): string {
    return ROLE_COLORS[role] ?? '#16a34a';
  }

  roleTitle(role: string): string {
    return BASE_ROLES.find((r) => r.id === role)?.title ?? role;
  }

  lastSeen(p: LiveParticipant): string {
    const v = p.lastSeen as { toDate?: () => Date } | undefined;
    if (!v) return '—';
    const d = typeof v === 'object' && v !== null && 'toDate' in v && typeof v.toDate === 'function'
      ? (v as { toDate: () => Date }).toDate()
      : new Date(v as unknown as string);
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  private syncStaffMarkers(): void {
    if (!this.map) return;
    const byUid = new Map(this.participants().map((p) => [p.uid, p]));
    // Remove markers for departed participants.
    for (const [uid, marker] of [...this.staffMarkers]) {
      if (!byUid.has(uid)) {
        marker.remove();
        this.staffMarkers.delete(uid);
      }
    }
    for (const p of this.participants()) {
      const pos = this.personPos(p.uid);
      if (!pos) continue;
      let marker = this.staffMarkers.get(p.uid);
      if (!marker) {
        const el = document.createElement('div');
        el.style.width = '18px';
        el.style.height = '18px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 1px 4px rgba(0,0,0,.4)';
        el.style.background = this.colorFor(p.role);
        el.style.cursor = 'pointer';
        marker = new maplibregl.Marker({ element: el });
        const loc = this.locations().find((l) => l.uid === p.uid);
        const popup = new maplibregl.Popup({ offset: 12 }).setHTML(
          `<strong>${p.name}</strong><br/>${this.roleTitle(p.role)}<br/>` +
            (p.phone ? `<a href="tel:${p.phone}" dir="ltr">${p.phone}</a><br/>` : '') +
            (loc?.motion ? `תנועה: ${loc.motion}<br/>` : ''),
        );
        marker.setPopup(popup);
        marker.setLngLat(pos).addTo(this.map);
        this.staffMarkers.set(p.uid, marker);
      } else {
        marker.setLngLat(pos); // smooth in-place update, no flicker
      }
    }
  }

  private syncIncidentMarkers(): void {
    if (!this.map) return;
    const ids = new Set(this.incidents().map((i) => i.incidentId));
    for (const [id, marker] of [...this.incidentMarkers]) {
      if (!ids.has(id)) {
        marker.remove();
        this.incidentMarkers.delete(id);
      }
    }
    for (const inc of this.incidents()) {
      if (!Number.isFinite(inc.lat) || !Number.isFinite(inc.lng)) continue;
      let marker = this.incidentMarkers.get(inc.incidentId);
      if (!marker) {
        const el = document.createElement('div');
        el.textContent = inc.severity === 'HIGH' ? '🚨' : '⚠️';
        el.style.fontSize = '22px';
        el.style.cursor = 'pointer';
        marker = new maplibregl.Marker({ element: el });
        marker.setPopup(
          new maplibregl.Popup({ offset: 12 }).setText(`${inc.title || inc.category}: ${inc.desc}`),
        );
        marker.setLngLat([inc.lng, inc.lat]).addTo(this.map);
        this.incidentMarkers.set(inc.incidentId, marker);
      } else {
        marker.setLngLat([inc.lng, inc.lat]);
      }
    }
  }

  flyTo(inc: FieldIncident): void {
    this.map?.flyTo({ center: [inc.lng, inc.lat], zoom: 14 });
  }

  flyToPerson(p: LiveParticipant): void {
    const pos = this.personPos(p.uid);
    if (pos) this.map?.flyTo({ center: pos, zoom: 14 });
  }

  async setStatus(inc: FieldIncident, status: 'IN_PROGRESS' | 'RESOLVED'): Promise<void> {
    try {
      await this.live.setIncidentStatus(this.eventId, inc.incidentId, status);
      this.snack.open(status === 'RESOLVED' ? 'האירוע נסגר והוסר מהמפה.' : 'הועבר לטיפול.', 'אישור', { duration: 2000 });
    } catch (e: unknown) {
      this.snack.open('עדכון נכשל.', 'סגור', { duration: 3000 });
    }
  }

  // ---- GPX drag & drop (Task 6.1: update route from HQ laptop) ----

  async onGpxFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) await this.uploadRouteFile(f);
  }

  async onGpxDrop(ev: DragEvent): Promise<void> {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0];
    if (f) await this.uploadRouteFile(f);
  }

  private async uploadRouteFile(f: File): Promise<void> {
    const e = this.event();
    if (!e) return;
    try {
      const path = await this.events.uploadGpx(e.orgId, f);
      await this.events.updateEvent(e.eventId, { route: { gpxPath: path } });
      // Force redraw on next snapshot; clear old layer now.
      if (this.map?.getLayer('route-line')) this.map.removeLayer('route-line');
      if (this.map?.getSource('route')) this.map.removeSource('route');
      this.snack.open('המסלול עודכן.', 'אישור', { duration: 2500 });
    } catch {
      this.snack.open('העלאת GPX נכשלה.', 'סגור', { duration: 3500 });
    }
  }

  // ---- Task 6.3 kill-switch (double confirm -> Function -> archive lock) ----

  killSwitch(): void {
    const first = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'סיום פעילות וסגירת שידורים',
        message: `לסיים את "${this.event()?.name}"? כל המכשירים יפסיקו לשדר מיד.`,
      },
    });
    first.afterClosed().subscribe((ok1: boolean) => {
      if (!ok1) return;
      const second = this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'אימות סופי',
          message: 'פעולה זו נועלת את המפה לארכיון ולא ניתנת לביטול. לאשר סופית?',
        },
      });
      second.afterClosed().subscribe(async (ok2: boolean) => {
        if (!ok2) return;
        try {
          await this.events.terminateEvent(this.eventId);
          this.archived.set(true);
          this.snack.open('הפעילות הסתיימה — השידורים הופסקו.', 'אישור', { duration: 4000 });
        } catch (e: unknown) {
          this.snack.open('סיום נכשל: ' + (e instanceof Error ? e.message : ''), 'סגור', { duration: 3500 });
        }
      });
    });
  }
}
