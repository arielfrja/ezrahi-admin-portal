import { Component, Inject, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { AppLoaderComponent } from '../app-loader/app-loader.component';

export interface ReportDialogData {
  lat: number;
  lng: number;
}

export interface ReportDialogResult {
  category: string;
  title: string;
  desc: string;
}

export const INCIDENT_CATEGORIES = [
  { id: 'MEDICAL', title: 'רפואי' },
  { id: 'SECURITY', title: 'ביטחוני' },
  { id: 'DELAY', title: 'עיכוב' },
  { id: 'HAZARD', title: 'מפגע' },
];

/** HQ report creation (crew parity: long-press on the map → quick report). */
@Component({
  selector: 'app-report-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    AppLoaderComponent,
  ],
  template: `
    <h2 mat-dialog-title>דיווח חדש</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>קטגוריה</mat-label>
          <mat-select formControlName="category">
            @for (c of categories; track c.id) {
              <mat-option [value]="c.id">{{ c.title }}</mat-option>
            }
          </mat-select>
          @if (form.get('category')?.hasError('required')) {
            <mat-error>יש לבחור קטגוריה</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>כותרת</mat-label>
          <input matInput formControlName="title" placeholder="תיאור קצר של האירוע" />
          @if (form.get('title')?.hasError('required')) {
            <mat-error>כותרת חובה</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>תיאור (אופציונלי)</mat-label>
          <textarea matInput formControlName="desc" rows="2"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()" [disabled]="saving()">ביטול</button>
      <button mat-flat-button color="primary" (click)="onSubmit()" [disabled]="form.invalid || saving()">
        @if (saving()) { <app-loader size="sm" color="#fff"></app-loader> } @else { שלח דיווח }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display: flex; flex-direction: column; gap: 4px; min-width: 320px; padding-top: 8px; }
    .full-width { width: 100%; }
  `],
})
export class ReportDialogComponent {
  private fb = inject(FormBuilder);
  categories = INCIDENT_CATEGORIES;
  saving = signal(false);
  form = this.fb.group({
    category: ['', Validators.required],
    title: ['', Validators.required],
    desc: [''],
  });

  constructor(
    private dialogRef: MatDialogRef<ReportDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ReportDialogData,
  ) {}

  onCancel(): void {
    this.dialogRef.close(null);
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.value;
    this.dialogRef.close({
      category: String(v.category ?? ''),
      title: String(v.title ?? ''),
      desc: String(v.desc ?? ''),
    } as ReportDialogResult);
  }
}
