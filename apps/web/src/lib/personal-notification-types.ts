export const PERSONAL_NOTIFICATION_KINDS = [
  "ANNOUNCEMENT",
  "PARTY_CHANGE",
  "PARTY_REMINDER",
  "VOTE_DEADLINE",
  "COMMENT",
] as const;

export type PersonalNotificationKind = (typeof PERSONAL_NOTIFICATION_KINDS)[number];

export interface PersonalNotification {
  id: string;
  kind: PersonalNotificationKind;
  title: string;
  description: string;
  href: string;
  occurredAt: string;
  pinned?: boolean;
}

export interface PersonalNotificationFeed {
  items: PersonalNotification[];
  enabledKinds: PersonalNotificationKind[];
  asOf: string;
}

export type PersonalNotificationResult =
  | { mode: "LIVE"; data: PersonalNotificationFeed }
  | { mode: "DEMO"; enabledKinds?: PersonalNotificationKind[] }
  | { mode: "PENDING" | "ERROR" | "REAUTH" | "LEFT"; retryAfterSeconds?: number };
