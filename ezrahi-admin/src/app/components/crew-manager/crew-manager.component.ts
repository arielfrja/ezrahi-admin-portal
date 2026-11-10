import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { AppLoaderComponent } from '../app-loader/app-loader.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import {
  CrewEditDialogComponent,
  CrewEditDialogResult,
} from '../crew-edit-dialog/crew-edit-dialog.component';
import { LiveService, LiveParticipant } from '../../services/live.service';
import { EventService } from '../../services/event.service';
import { InviteService } from '../../services/invite.service';
import { EventRoleConfig, FieldEvent, rolesForEvent } from '../../models/event.model';
import { inviteLink, inviteWhatsAppText } from '../../models/invite.model';
import { PILOT_ROLE_LABELS, personName, presenceLabel } from '../../utils/labels';

/**
 * /org/activities/:id/crew — clean per-activity crew management:
 * add (role invite), edit (name/phone), change role, remove.
 */
@Component({
  selector: 'app-crew-manager',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
    MatSnackBarModule,
    MatTooltipModule,
    AppLoaderComponent,
  ],
  template: `
    <div class="page" dir="rtl">
      <div class="head">
        <div>
          <h2>ניהול צוות — {{ event()?.name ?? '…' }}</h2>
          <p class="sub">הוספה בהזמנה · עריכת פרטים · שינוי תפקיד · הסרה</p>
        </div>
        <div class="ops">
          <a mat-stroked-button [routerLink]="['/org/activities', eventId(), 'invites']" matTooltip="הגדרת שמות/צבעים/הרשאות לתפקידים">
            <mat-icon>badge</mat-icon> תפקידי האירוע
          </a>
          <button mat-flat-button color="primary" (click)="inviteOpen.set(!inviteOpen())">
            <mat-icon>person_add</mat-icon> {{ inviteOpen() ? 'סגור' : 'הוספת איש צוות' }}
          </button>
        </div>
      </div>

      @if (inviteOpen()) {
        <mat-card class="card invite-card">
          <div class="invite-grid">
            <mat-form-field appearance="outline">
              <mat-label>תפקיד להזמנה</mat-label>
              <mat-select [value]="inviteRole()" (selectionChange)="setInviteRole($event.value)">
                @for (r of roles(); track r.id) {
                  <mat-option [value]="r.id">{{ r.title }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <div class="flag-chips">
              <span class="chip" [class.on]="inviteRoleCfg()?.isManagerial">ניהולי</span>
              <span class="chip" [class.on]="inviteRoleCfg()?.canInvite">מורשה להזמין</span>
              <span class="hint">נקבע אוטומטית לפי התפקיד</span>
            </div>
            <button mat-flat-button color="primary" (click)="createInvite()" [disabled]="inviteBusy()">
              @if (inviteBusy()) { <app-loader size="sm" color="#fff"></app-loader> } @else { הפק קישור הזמנה }
            </button>
          </div>
          @if (lastInviteCode()) {
            <div class="result">
              <p><strong>קוד:</strong> <code dir="ltr">{{ lastInviteCode() }}</code></p>
              <p class="link" dir="ltr">{{ inviteLinkFor(lastInviteCode()) }}</p>
              <div class="row">
                <button mat-stroked-button (click)="copyInvite()">העתק קישור וקוד</button>
                <button mat-flat-button color="primary" (click)="shareInvite()">שתף בוואטסאפ</button>
              </div>
            </div>
          }
        </mat-card>
      }

      <div class="mat-elevation-z2 table-wrap">
        @if (loading()) {
          <div class="loading-block"><app-loader size="lg"></app-loader> טוען צוות…</div>
        } @else {
        <table mat-table [dataSource]="crew()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>שם</th>
            <td mat-cell *matCellDef="let p" class="who">
              <span class="dot" [style.background]="colorFor(p.role)"></span>
              <strong>{{ displayName(p) }}</strong>
              @if (!p.name) { <span class="hint">(ללא שם — לחצו עריכה)</span> }
            </td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>תפקיד</th>
            <td mat-cell *matCellDef="let p">
              <mat-select class="role-select" [value]="p.role" [disabled]="busyUid() === p.uid"
                (selectionChange)="changeRole(p, $event.value)">
                @if (isUnknownRole(p.role)) {
                  <mat-option [value]="p.role" disabled>{{ pilotLabel(p.role) }} (מדור קודם)</mat-option>
                }
                @for (r of roles(); track r.id) {
                  <mat-option [value]="r.id">{{ r.title }}</mat-option>
                }
              </mat-select>
            </td>
          </ng-container>
          <ng-container matColumnDef="phone">
            <th mat-header-cell *matHeaderCellDef>טלפון</th>
            <td mat-cell *matCellDef="let p" class="phone">
              @if (p.phone) {
                <span dir="ltr">{{ p.phone }}</span>
                <a mat-icon-button [href]="'tel:' + p.phone" matTooltip="חייג"><mat-icon>call</mat-icon></a>
                <a mat-icon-button [href]="waLink(p.phone)" target="_blank" rel="noopener" matTooltip="הודעה"><mat-icon>chat</mat-icon></a>
              } @else {
                <span class="hint">—</span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>סטטוס</th>
            <td mat-cell *matCellDef="let p">
              <span class="badge" [ngClass]="p.status">{{ presenceLabel(p.status) }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="ops">
            <th mat-header-cell *matHeaderCellDef>פעולות</th>
            <td mat-cell *matCellDef="let p">
              <button mat-icon-button color="primary" (click)="editCrew(p)" matTooltip="עריכת שם/טלפון">
                <mat-icon>edit</mat-icon>
              </button>
              @if (p.status !== 'REMOVED') {
                <button mat-icon-button color="warn" (click)="removeCrew(p)" matTooltip="הסרה מהאירוע">
                  <mat-icon>person_remove</mat-icon>
                </button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        </table>
        @if (!crew().length) {
          <p class="empty">אין אנשי צוות עדיין — הוסיפו בהזמנה מלמעלה.</p>
        }
        }
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1000px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    h2 { margin: 0; } .sub { margin: 2px 0 0; color: #64748b; font-size: 13px; }
    .ops { display: flex; gap: 8px; align-items: center; }
    .card { padding: 16px; margin: 12px 0 16px; }
    .invite-grid { display: grid; grid-template-columns: 260px 1fr auto; gap: 12px; align-items: center; }
    .flag-chips { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .chip { font-size: 12px; padding: 3px 10px; border-radius: 999px; background: #f1f5f9; color: #64748b; }
    .chip.on { background: #dcfce7; color: #15803d; font-weight: 600; }
    .hint { color: #94a3b8; font-size: 12px; }
    .result { margin-top: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; }
    .link { word-break: break-all; color: #1d4ed8; }
    .row { display: flex; gap: 8px; margin-top: 8px; }
    .table-wrap { background: #fff; border-radius: 8px; overflow: hidden; }
    table { width: 100%; }
    .who { display: flex; align-items: center; gap: 8px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .role-select { min-width: 150px; }
    .phone { display: flex; align-items: center; gap: 2px; }
    .badge { font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: #e0f2fe; color: #075985; }
    .badge.REMOVED { background: #fee2e2; color: #991b1b; }
    .badge.OFFLINE { background: #f1f5f9; color: #64748b; }
    .empty { text-align: center; color: #64748b; padding: 24px; }
    .loading-block { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px; color: #64748b; }
  `],
})
export class CrewManagerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private live = inject(LiveService);
  private events = inject(EventService);
  private invitesSvc = inject(InviteService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  cols = ['name', 'role', 'phone', 'status', 'ops'];
  eventId = signal<string>('');
  event = signal<FieldEvent | null>(null);
  crew = signal<LiveParticipant[]>([]);
  loading = signal(true);
  busyUid = signal<string | null>(null);

  inviteOpen = signal(false);
  inviteRole = signal<string>('guide');
  inviteBusy = signal(false);
  lastInviteCode = signal<string>('');

  /** Effective per-event roles (base defaults + event overrides). */
  roles = computed<EventRoleConfig[]>(() => rolesForEvent(this.event()));
  inviteRoleCfg = computed(() => this.roles().find((r) => r.id === this.inviteRole()));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.eventId.set(id);
    this.events.watchEvent(id, (e) => this.event.set(e));
    this.live.watchParticipants(id).subscribe({
      next: (list) => {
        this.crew.set(list);
        this.loading.set(false);
      },
      error: (e: Error) => {
        this.snack.open('שגיאה בטעינת הצוות: ' + e.message, 'סגור', { duration: 3500 });
        this.loading.set(false);
      },
    });
  }

  // ---- display helpers -----------------------------------------------------

  colorFor(role: string): string {
    return this.roles().find((r) => r.id === role)?.color ?? '#16a34a';
  }

  roleTitle(role: string): string {
    return this.roles().find((r) => r.id === role)?.title ?? PILOT_ROLE_LABELS[role] ?? role;
  }

  isUnknownRole(role: string): boolean {
    return !this.roles().some((r) => r.id === role);
  }

  pilotLabel(role: string): string {
    return PILOT_ROLE_LABELS[role] ?? role;
  }

  displayName(p: LiveParticipant): string {
    return personName(p.name, p.phone);
  }

  presenceLabel(status: string): string {
    return presenceLabel(status);
  }

  waLink(phone: string): string {
    return `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
  }

  // ---- crew actions ----------------------------------------------------------

  async changeRole(p: LiveParticipant, role: string): Promise<void> {
    if (role === p.role) return;
    this.busyUid.set(p.uid);
    try {
      await this.live.setParticipantRole(this.eventId(), p.uid, role);
      this.snack.open(`${this.displayName(p)} → ${this.roleTitle(role)}`, 'אישור', { duration: 2500 });
    } catch {
      this.snack.open('שינוי תפקיד נכשל.', 'סגור', { duration: 3000 });
    } finally {
      this.busyUid.set(null);
    }
  }

  editCrew(p: LiveParticipant): void {
    const ref = this.dialog.open(CrewEditDialogComponent, {
      width: '380px',
      data: { uid: p.uid, name: p.name, phone: p.phone, roleTitle: this.roleTitle(p.role) },
    });
    ref.afterClosed().subscribe(async (result: CrewEditDialogResult | null) => {
      if (!result) return;
      this.busyUid.set(p.uid);
      try {
        await this.live.updateParticipant(this.eventId(), p.uid, result);
        this.snack.open('הפרטים עודכנו.', 'אישור', { duration: 2500 });
      } catch {
        this.snack.open('עדכון נכשל.', 'סגור', { duration: 3000 });
      } finally {
        this.busyUid.set(null);
      }
    });
  }

  removeCrew(p: LiveParticipant): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'הסרת איש צוות', message: `להסיר את ${this.displayName(p)} מהאירוע? הסמן שלו יוסתר מהמפה.` },
    });
    ref.afterClosed().subscribe(async (yes: boolean) => {
      if (!yes) return;
      this.busyUid.set(p.uid);
      try {
        await this.live.setParticipantStatus(this.eventId(), p.uid, 'REMOVED');
        this.snack.open('הוסר מהאירוע.', 'אישור', { duration: 2500 });
      } catch {
        this.snack.open('הסרה נכשלה.', 'סגור', { duration: 3000 });
      } finally {
        this.busyUid.set(null);
      }
    });
  }

  // ---- invite creation -------------------------------------------------------

  setInviteRole(role: string): void {
    this.inviteRole.set(role);
  }

  async createInvite(): Promise<void> {
    const cfg = this.inviteRoleCfg();
    if (!cfg) return;
    this.inviteBusy.set(true);
    try {
      // Flags come from the per-event role config automatically.
      const code = await this.invitesSvc.createInvite(this.eventId(), {
        targetRole: cfg.id,
        isManagerial: cfg.isManagerial,
        canInvite: cfg.canInvite,
        maxUses: null,
      });
      this.lastInviteCode.set(code);
      this.snack.open('קישור ההזמנה הופק.', 'אישור', { duration: 2500 });
    } catch (e: unknown) {
      this.snack.open('הפקה נכשלה: ' + (e instanceof Error ? e.message : ''), 'סגור', { duration: 3500 });
    } finally {
      this.inviteBusy.set(false);
    }
  }

  inviteLinkFor(code: string): string {
    return inviteLink(code);
  }

  copyInvite(): void {
    const code = this.lastInviteCode();
    const text = `${code} ${inviteLink(code)}`;
    void navigator.clipboard?.writeText(text).then(
      () => this.snack.open('הועתק.', 'אישור', { duration: 2000 }),
      () => this.snack.open(text, 'סגור', { duration: 6000 }),
    );
  }

  shareInvite(): void {
    const code = this.lastInviteCode();
    const text = inviteWhatsAppText(
      this.event()?.name ?? '',
      this.roleTitle(this.inviteRole()),
      code,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
  }
}
