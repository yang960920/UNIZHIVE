"use server";

import { getRecentAnnouncements } from "./server/community-repository";

export async function loadAnnouncementNotifications() {
  return getRecentAnnouncements();
}
