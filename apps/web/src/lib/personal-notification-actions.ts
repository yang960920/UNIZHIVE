"use server";

import { getPersonalNotifications } from "./server/personal-notifications";

export async function loadPersonalNotifications() {
  return getPersonalNotifications();
}
