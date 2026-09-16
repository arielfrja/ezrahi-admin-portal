import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { EventService } from '../../services/event.service';
import { OrganizationService } from '../../services/organization.service';
import { AuthService } from '../../services/auth.service';
import { FieldEvent, EVENT_STATUS_LABELS } from '../../models/event.model';
import { Organization } from '../../models/organization.model';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { MatDialog } from '@angular/material/dialog';

/** Task 5.2 (list half) — /org/activities: planned/active/history + license view. */
@Component({
  selector: 'app-activity-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  template: `
    <div class="page" dir="rtl">
      <div class="head">
        <div>
          <h2>אירועי הארגון</h2>
          <p class="sub">מתוכננים · פעילים · היסטוריים · ניצול רישיון</p>
        </div>
        <div class="head-ops">
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
          <button mat-flat-button color="primary" routerLink="/org/activities/create">
            <mat-icon>add</mat-icon> הקמת אירוע חדש
          </button>
        </div>
      </div>

      @if (quotaText()) {
        <p class="quota">{{ quotaText() }}</p>
      }

      <div class="mat-elevation-z2 table-wrap">
        <table mat-table [dataSource]="events()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>שם האירוע</th>
            <td mat-cell *matCellDef="let e"><strong>{{ e.name }}</strong></td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>סטטוס</th>
            <td mat-cell *matCellDef="let e">
              <span class="badge" [ngClass]="e.status">{{ statusLabel(e.status) }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="window">
            <th mat-header-cell *matHeaderCellDef>חלון פעילות</th>
            <td mat-cell *matCellDef="let e">{{ fmtRange(e) }}</td>
          </ng-container>
          <ng-container matColumnDef="ops">
            <th mat-header-cell *matHeaderCellDef>פעולות</th>
            <td mat-cell *matCellDef="let e">
              <button mat-button color="primary" [routerLink]="['/org/activities', e.eventId, 'invites']">הזמנות</button>
              <button mat-button color="accent" [routerLink]="['/command', e.eventId]">חפ״ק</button>
              @if (e.status !== 'COMPLETED') {
                <button mat-icon-button color="warn" (click)="terminate(e)" title="סיום אירוע לכולם">
                  <mat-icon>stop_circle</mat-icon>
                </button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1100px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    h2 { margin: 0; } .sub { margin: 0; color: #64748b; font-size: 13px; }
    .head-ops { display: flex; gap: 12px; align-items: center; }
    .org-pick { width: 240px; }
    .quota { color: #475569; font-size: 13px; }
    .table-wrap { background: #fff; border-radius: 8px; overflow: hidden; }
    table { width: 100%; }
    .badge { padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .badge.PLANNED { background: #e0f2fe; color: #075985; }
    .badge.ACTIVE { background: #dcfce7; color: #15803d; }
    .badge.COMPLETED { background: #f1f5f9; color: #475569; }
    .badge.CANCELLED { background: #fee2e2; color: #b91c1c; }
  `],
})
export class ActivityListComponent implements OnInit {
  private eventSvc = inject(EventService);
  private orgSvc = inject(OrganizationService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  cols = ['name', 'status', 'window', 'ops'];
  events = signal<FieldEvent[]>([]);
  orgs = signal<Organization[]>([]);
  orgId = signal<string>(this.auth.currentOrgId() ?? '');
  quotaText = signal<string>('');

  isSuper(): boolean {
    return this.auth.isSuperAdmin();
  }

  statusLabel(s: FieldEvent['status']): string {
    return EVENT_STATUS_LABELS[s] ?? s;
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
    this.eventSvc.watchOrgEvents(id).subscribe({
      next: (list) => {
        this.events.set(list);
        const active = list.filter((e) => e.status === 'ACTIVE').length;
        this.quotaText.set(`אירועים פעילים: ${active}`);
      },
      error: (e: Error) => this.snack.open('שגיאה בטעינת אירועים: ' + e.message, 'סגור', { duration: 3500 }),
    });
  }

  fmtRange(e: FieldEvent): string {
    const f = (v: unknown) => {
      if (!v) return '?';
      const d = typeof v === 'object' && v !== null && 'toDate' in v
        ? (v as { toDate: () => Date }).toDate()
        : new Date(v as string);
      return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
    };
    return `${f(e.startTime)} → ${f(e.endTime)}`;
  }

  terminate(e: FieldEvent): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'סיום אירוע לכולם',
        message: `לסיים את "${e.name}"? כל המכשירים יפסיקו לשדר והמפה תינעל לארכיון.`,
      },
    });
    ref.afterClosed().subscribe(async (ok: boolean) => {
      if (!ok) return;
      try {
        await this.eventSvc.terminateEvent(e.eventId);
        this.snack.open('האירוע הסתיים.', 'אישור', { duration: 2500 });
      } catch (err: unknown) {
        this.snack.open('סיום נכשל: ' + (err instanceof Error ? err.message : ''), 'סגור', { duration: 3500 });
      }
    });
  }
}
