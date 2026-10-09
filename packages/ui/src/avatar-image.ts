/** Uploaded avatars use only the authenticated same-origin image endpoint. */
export function avatarImageSource(value: unknown): string | null {
  return typeof value === "string" &&
    /^\/api\/profile\/image\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\?v=[0-9a-f]{64}$/.test(
      value,
    )
    ? value
    : null;
}
