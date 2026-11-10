import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

export interface CrewEditDialogData {
  uid: string;
  name: string;
  phone: string;
  roleTitle: string;
}

export interface CrewEditDialogResult {
  name: string;
  phone: string;
}

/** Edit a crew member's name/phone (role changes happen inline in the table). */
@Component({
  selector: 'app-crew-edit-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>עריכת איש צוות — {{ data.roleTitle }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="full">
          <mat-label>שם מלא</mat-label>
          <input matInput formControlName="name" />
          @if (form.get('name')?.hasError('required')) {
            <mat-error>שם חובה</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>טלפון</mat-label>
          <input matInput formControlName="phone" dir="ltr" placeholder="050-0000000" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">ביטול</button>
      <button mat-flat-button color="primary" (click)="onSave()" [disabled]="form.invalid">שמור</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; gap: 4px; min-width: 300px; padding-top: 8px; }
    .full { width: 100%; }
  `],
})
export class CrewEditDialogComponent {
  private fb = inject(FormBuilder);

  form = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
  });

  constructor(
    private dialogRef: MatDialogRef<CrewEditDialogComponent, CrewEditDialogResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: CrewEditDialogData,
  ) {
    this.form.setValue({ name: data.name, phone: data.phone });
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  onSave(): void {
    this.dialogRef.close({
      name: String(this.form.value.name ?? '').trim(),
      phone: String(this.form.value.phone ?? '').trim(),
    });
  }
}
