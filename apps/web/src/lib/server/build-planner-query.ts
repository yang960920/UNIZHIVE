import "server-only";
import { z } from "zod";

export const PLANNER_LIBRARY_PAGE_SIZE = 9;
export const PLANNER_VERSION_PAGE_SIZE = 20;
const cursorSchema = z.strictObject({ updatedAt: z.iso.datetime({ offset: true }), id: z.uuid() });

export function decodeBuildCursor(value?: string): z.infer<typeof cursorSchema> | null {
  if (!value || value.length > 240 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encodeBuildCursor(value: { updatedAt: string; id: string }): string {
  return Buffer.from(
    JSON.stringify(cursorSchema.parse({ updatedAt: value.updatedAt, id: value.id })),
  ).toString("base64url");
}

export function normalizeBuildQuery(value?: string): string {
  return Array.from((value ?? "").normalize("NFC").trim().replace(/^#+/, ""))
    .slice(0, 80)
    .join("");
}

export function literalSearchPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
