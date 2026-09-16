/** Task 5.3 — Hierarchical role invites (events/{id}/invites, doc id == 6-digit code). */

export interface RoleInvite {
  code: string;
  targetRole: string;
  isManagerial: boolean;
  canInvite: boolean;
  createdBy: string;
  /** Auto direct-superior when the creator is managerial. */
  parentManagerUid?: string | null;
  maxUses?: number | null;
  uses: number;
  active: boolean;
  createdAt?: unknown;
}

export interface CreateInviteRequest {
  targetRole: string;
  isManagerial: boolean;
  canInvite: boolean;
  maxUses?: number | null;
}

/** Deep link base for field join (Android app handles /join?code=). */
export function inviteLink(code: string): string {
  return `https://ezrahi.app/join?code=${code}`;
}

export function inviteWhatsAppText(eventName: string, roleTitle: string, code: string): string {
  const link = inviteLink(code);
  return encodeURIComponent(
    `הוזמנת לאירוע "${eventName}" בתפקיד ${roleTitle}.\nקוד הצטרפות: ${code}\nקישור: ${link}`,
  );
}
