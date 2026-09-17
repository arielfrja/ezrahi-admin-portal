import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
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
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="desc">{{ data.description }}</p>
      @if (data.link) {
        <div #linkBox class="link-box" dir="ltr" (click)="selectAll()" title="Click to select">
          {{ data.link }}
        </div>
        <p class="hint">The full link is shown above — click it to select, or use Copy.</p>
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
    .link-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.6;
      overflow-wrap: anywhere;
      word-break: break-all;
      cursor: text;
      user-select: all;
      max-height: 160px;
      overflow-y: auto;
    }
    .hint { color: #94a3b8; font-size: 12px; margin-top: 6px; }
    .warn { color: #b45309; }
  `],
})
export class SetupLinkDialogComponent {
  @ViewChild('linkBox') linkBox?: ElementRef<HTMLElement>;

  constructor(
    public dialogRef: MatDialogRef<SetupLinkDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SetupLinkDialogData,
    private snackBar: MatSnackBar,
  ) {}

  selectAll(): void {
    const el = this.linkBox?.nativeElement;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  copy(): void {
    if (!this.data.link) return;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(this.data.link).then(
        () => this.snackBar.open('The link was copied.', 'OK', { duration: 2500 }),
        () => {
          this.selectAll();
          this.snackBar.open('Copy blocked — link selected, press Ctrl+C.', 'OK', { duration: 4000 });
        },
      );
    } else {
      this.selectAll();
      this.snackBar.open('Link selected — press Ctrl+C to copy.', 'OK', { duration: 4000 });
    }
  }

  share(): void {
    window.open(this.data.whatsappUrl, '_blank', 'noopener');
    this.close();
  }

  close(): void {
    this.dialogRef.close();
  }
}
