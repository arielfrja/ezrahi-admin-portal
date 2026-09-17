import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface SetupLinkDialogData {
  title: string;
  description: string;
  /** Set-password / invite link to hand over. */
  link: string;
  /** Full https://wa.me/?text=... share URL (prebuilt by caller). */
  whatsappUrl: string;
}

/**
 * Credential handoff dialog: shows a setup link with copy + WhatsApp share.
 * Used after adding an org admin (new or EXISTING user) and after org creation.
 */
@Component({
  selector: 'app-setup-link-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="desc">{{ data.description }}</p>
      @if (data.link) {
        <mat-form-field appearance="outline" class="full-width" dir="ltr">
          <mat-label>Setup link</mat-label>
          <input matInput [value]="data.link" readonly (focus)="$any($event.target).select()" />
          <button mat-icon-button matSuffix (click)="copy()" title="Copy link">
            <mat-icon>content_copy</mat-icon>
          </button>
        </mat-form-field>
      } @else {
        <p class="warn">No link was generated — ask the user to use “forgot password” on the login screen.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Close</button>
      @if (data.link) {
        <button mat-stroked-button color="primary" (click)="copy()">Copy link</button>
        <button mat-flat-button color="primary" (click)="share()">Share on WhatsApp</button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .desc { color: #475569; font-size: 14px; }
    .full-width { width: 100%; }
    .warn { color: #b45309; }
  `],
})
export class SetupLinkDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<SetupLinkDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SetupLinkDialogData,
    private snackBar: MatSnackBar,
  ) {}

  copy(): void {
    if (!this.data.link) return;
    void navigator.clipboard?.writeText(this.data.link).then(
      () => this.snackBar.open('The link was copied.', 'OK', { duration: 2500 }),
      () => this.snackBar.open('Copy failed — select the link manually.', 'Close', { duration: 4000 }),
    );
  }

  share(): void {
    window.open(this.data.whatsappUrl, '_blank', 'noopener');
    this.close();
  }

  close(): void {
    this.dialogRef.close();
  }
}
