import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AppLoaderComponent } from '../app-loader/app-loader.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { InviteService } from '../../services/invite.service';
import { EventService } from '../../services/event.service';
import { RoleInvite, inviteLink, inviteWhatsAppText } from '../../models/invite.model';
import {
  BASE_ROLES,
  EventRoleConfig,
  FieldEvent,
  defaultRolesConfig,
  rolesForEvent,
} from '../../models/event.model';

/** Task 5.3 — /org/activities/:id/invites: 6-digit hierarchical role links. */
@Component({
  selector: 'app-invites-generator',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    AppLoaderComponent,
  ],
  template: `
    <div class="page" dir="rtl">
      <h2>הזמנות תפקיד — {{ event()?.name ?? '…' }}</h2>
      <p class="sub">בחירת תפקיד יעד · דגלי ניהול/הזמנה · קוד 6 ספרות · שיתוף בוואטסאפ</p>

      <mat-card class="card">
        <form [formGroup]="form" (ngSubmit)="create()" class="grid">
          <mat-form-field appearance="outline" class="full">
            <mat-label>תפקיד יעד (רשימה סגורה)</mat-label>
            <mat-select formControlName="targetRole" (selectionChange)="onRole($event.value)">
              @for (r of roles(); track r.id) {
                <mat-option [value]="r.id">{{ r.title }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-checkbox formControlName="isManagerial">תפקיד ניהולי (כפופים תחתיו)</mat-checkbox>
          <mat-checkbox formControlName="canInvite">מורשה להזמין תחתיו</mat-checkbox>
          <mat-form-field appearance="outline">
            <mat-label>מכסת שימושים (ריק = ללא הגבלה)</mat-label>
            <input matInput formControlName="maxUses" type="number" min="1" dir="ltr" />
          </mat-form-field>
          <div class="ops">
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
              @if (saving()) { <app-loader size="sm" color="#fff"></app-loader> } @else { הפק קישור }
            </button>
          </div>
        </form>

        @if (lastCode()) {
          <div class="result">
            <p><strong>קוד:</strong> <code dir="ltr">{{ lastCode() }}</code></p>
            <p class="link" dir="ltr">{{ linkFor(lastCode()) }}</p>
            <div class="row">
              <button mat-stroked-button (click)="copyLink()">העתק קישור וקוד</button>
              <button mat-flat-button color="primary" (click)="shareWhatsApp()">שתף בוואטסאפ</button>
            </div>
          </div>
        }
      </mat-card>

      <mat-card class="card roles-card">
        <div class="roles-head">
          <div>
            <h3>תפקידי האירוע</h3>
            <p class="sub2">שמות, צבעים והרשאות לאירוע הזה בלבד — 8 התפקידים הקבועים נשארים קבועים.</p>
          </div>
          <div class="row">
            <button mat-stroked-button type="button" (click)="resetRoles()" [disabled]="rolesSaving()">ברירת מחדל</button>
            <button mat-flat-button color="primary" type="button" (click)="saveRoles()" [disabled]="rolesSaving() || !rolesDirty()">
              @if (rolesSaving()) { <app-loader size="sm" color="#fff"></app-loader> } @else { שמור תפקידים }
            </button>
          </div>
        </div>
        <div class="role-grid">
          <div class="role-row head">
            <span>תפקיד</span>
            <span>שם מותאם</span>
            <span>צבע</span>
            <span>ניהולי</span>
            <span>מזמין</span>
            <span>רואה</span>
          </div>
          @for (r of roles(); track r.id; let i = $index) {
            <div class="role-row">
              <span class="base-role">{{ baseTitle(r.id) }}</span>
              <input
                class="title-input"
                [value]="r.title"
                [placeholder]="baseTitle(r.id)"
                (input)="setRoleField(i, 'title', $any($event.target).value)" />
              <input
                class="color-input"
                type="color"
                [value]="r.color"
                (input)="setRoleField(i, 'color', $any($event.target).value)" />
              <mat-checkbox
                [checked]="r.isManagerial"
                (change)="setRoleField(i, 'isManagerial', $event.checked)"></mat-checkbox>
              <mat-checkbox
                [checked]="r.canInvite"
                (change)="setRoleField(i, 'canInvite', $event.checked)"></mat-checkbox>
              <mat-select
                class="vis-select"
                multiple
                [value]="r.visibleRoles"
                placeholder="כולם"
                (selectionChange)="setRoleField(i, 'visibleRoles', $event.value)">
                @for (o of roles(); track o.id) {
                  @if (o.id !== r.id) {
                    <mat-option [value]="o.id">{{ o.title }}</mat-option>
                  }
                }
              </mat-select>
            </div>
          }
        </div>
      </mat-card>

      <div class="mat-elevation-z2 table-wrap">
        @if (loading()) {
          <div class="loading-block"><app-loader size="lg"></app-loader> טוען הזמנות…</div>
        } @else {
        <table mat-table [dataSource]="invites()">
          <ng-container matColumnDef="code">
            <th mat-header-cell *matHeaderCellDef>קוד</th>
            <td mat-cell *matCellDef="let i"><code dir="ltr">{{ i.code }}</code></td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>תפקיד</th>
            <td mat-cell *matCellDef="let i">{{ roleTitle(i.targetRole) }}</td>
          </ng-container>
          <ng-container matColumnDef="flags">
            <th mat-header-cell *matHeaderCellDef>דגלים</th>
            <td mat-cell *matCellDef="let i">{{ i.isManagerial ? 'ניהולי' : '' }} {{ i.canInvite ? '+מזמין' : '' }}</td>
          </ng-container>
          <ng-container matColumnDef="uses">
            <th mat-header-cell *matHeaderCellDef>ניצול</th>
            <td mat-cell *matCellDef="let i">{{ i.uses }}{{ i.maxUses ? '/' + i.maxUses : '' }}</td>
          </ng-container>
          <ng-container matColumnDef="active">
            <th mat-header-cell *matHeaderCellDef>פעיל</th>
            <td mat-cell *matCellDef="let i">
              <mat-slide-toggle [checked]="i.active" [disabled]="busyCode() === i.code" (change)="toggle(i, $event.checked)"></mat-slide-toggle>
            </td>
          </ng-container>
          <ng-container matColumnDef="share">
            <th mat-header-cell *matHeaderCellDef>שיתוף</th>
            <td mat-cell *matCellDef="let i">
              <button mat-icon-button color="primary" (click)="shareRow(i)" title="שתף בוואטסאפ">
                <mat-icon>share</mat-icon>
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
    .page { max-width: 900px; margin: 0 auto; }
    h2 { margin: 0; } .sub { color: #64748b; font-size: 13px; }
    .card { padding: 20px; margin: 12px 0 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: center; }
    .full { grid-column: 1 / -1; }
    .ops { display: flex; }
    .result { margin-top: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; }
    .link { word-break: break-all; color: #1d4ed8; }
    .row { display: flex; gap: 8px; margin-top: 8px; }
    .table-wrap { background: #fff; border-radius: 8px; overflow: hidden; }
    table { width: 100%; }
    .loading-block { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px; color: #64748b; }
    .roles-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .roles-head h3 { margin: 0 0 2px; font-size: 16px; }
    .sub2 { margin: 0; color: #64748b; font-size: 12px; }
    .role-grid { display: flex; flex-direction: column; gap: 2px; }
    .role-row { display: grid; grid-template-columns: 130px 1fr 56px 72px 72px 190px; gap: 10px; align-items: center; padding: 4px 0; }
    .role-row.head { font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 4px; }
    .base-role { font-weight: 500; font-size: 13px; }
    .title-input { padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; font-size: 13px; width: 100%; box-sizing: border-box; }
    .color-input { width: 44px; height: 30px; padding: 2px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; }
    .vis-select { font-size: 13px; }
  `],
})
export class InvitesGeneratorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private invitesSvc = inject(InviteService);
  private events = inject(EventService);
  private snack = inject(MatSnackBar);

  baseRoles = BASE_ROLES;
  cols = ['code', 'role', 'flags', 'uses', 'active', 'share'];
  invites = signal<RoleInvite[]>([]);
  event = signal<FieldEvent | null>(null);
  eventId = signal<string>('');
  saving = signal(false);
  loading = signal(true);
  busyCode = signal<string | null>(null);
  lastCode = signal<string>('');
  /** Draft of the event's 8 roles (base + this-event overrides). */
  roles = signal<EventRoleConfig[]>(defaultRolesConfig());
  rolesSaving = signal(false);
  rolesDirty = signal(false);
  private rolesSeeded = false;

  form = this.fb.group({
    targetRole: ['guide', Validators.required],
    isManagerial: [false],
    canInvite: [false],
    maxUses: [null as number | null],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.eventId.set(id);
    this.events.watchEvent(id, (e) => {
      this.event.set(e);
      // Seed the role editor once so live snapshots don't clobber local edits.
      if (!this.rolesSeeded && e) {
        this.roles.set(rolesForEvent(e));
        this.rolesSeeded = true;
      }
    });
    this.invitesSvc.watchInvites(id).subscribe({
      next: (list) => {
        this.invites.set(list);
        this.loading.set(false);
      },
      error: (e: Error) => {
        this.snack.open('שגיאה בטעינת הזמנות: ' + e.message, 'סגור', { duration: 3500 });
        this.loading.set(false);
      },
    });
    this.onRole('guide');
  }

  onRole(roleId: string): void {
    const def = this.roles().find((r) => r.id === roleId);
    if (def) {
      this.form.patchValue({ isManagerial: def.isManagerial, canInvite: def.canInvite });
    }
  }

  roleTitle(id: string): string {
    return this.roles().find((r) => r.id === id)?.title ?? id;
  }

  /** The fixed base name of a role (identity column of the editor). */
  baseTitle(id: string): string {
    return BASE_ROLES.find((r) => r.id === id)?.title ?? id;
  }

  setRoleField<K extends keyof EventRoleConfig>(idx: number, key: K, value: EventRoleConfig[K]): void {
    this.roles.update((list) => list.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
    this.rolesDirty.set(true);
  }

  resetRoles(): void {
    this.roles.set(defaultRolesConfig());
    this.rolesDirty.set(true);
  }

  async saveRoles(): Promise<void> {
    this.rolesSaving.set(true);
    try {
      await this.events.updateEvent(this.eventId(), { rolesConfig: this.roles() });
      this.rolesDirty.set(false);
      this.rolesSeeded = false; // re-seed from the saved snapshot
      this.snack.open('תפקידי האירוע נשמרו.', 'אישור', { duration: 2500 });
    } catch (e: unknown) {
      this.snack.open('שמירה נכשלה: ' + (e instanceof Error ? e.message : ''), 'סגור', { duration: 3500 });
    } finally {
      this.rolesSaving.set(false);
    }
  }

  linkFor(code: string): string {
    return inviteLink(code);
  }

  async create(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const v = this.form.value;
      const code = await this.invitesSvc.createInvite(this.eventId(), {
        targetRole: String(v.targetRole ?? ''),
        isManagerial: Boolean(v.isManagerial),
        canInvite: Boolean(v.canInvite),
        maxUses: v.maxUses ? Number(v.maxUses) : null,
      });
      this.lastCode.set(code);
      this.snack.open('הקישור הופק.', 'אישור', { duration: 2500 });
    } catch (e: unknown) {
      this.snack.open('הפקה נכשלה: ' + (e instanceof Error ? e.message : ''), 'סגור', { duration: 3500 });
    } finally {
      this.saving.set(false);
    }
  }

  copyLink(): void {
    const code = this.lastCode();
    const text = `${code} ${inviteLink(code)}`;
    void navigator.clipboard?.writeText(text).then(
      () => this.snack.open('הועתק.', 'אישור', { duration: 2000 }),
      () => this.snack.open(text, 'סגור', { duration: 6000 }),
    );
  }

  shareWhatsApp(): void {
    const code = this.lastCode();
    const text = inviteWhatsAppText(
      this.event()?.name ?? '',
      this.roleTitle(String(this.form.value.targetRole ?? '')),
      code,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
  }

  shareRow(i: RoleInvite): void {
    const text = inviteWhatsAppText(this.event()?.name ?? '', this.roleTitle(i.targetRole), i.code);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
  }

  async toggle(i: RoleInvite, active: boolean): Promise<void> {
    this.busyCode.set(i.code);
    try {
      await this.invitesSvc.setInviteActive(this.eventId(), i.code, active);
    } catch {
      this.snack.open('עדכון נכשל.', 'סגור', { duration: 3000 });
    } finally {
      this.busyCode.set(null);
    }
  }
}
