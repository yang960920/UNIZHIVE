import { z } from "zod";

export const reactionKinds = ["COMMUNITY_POST", "COMMUNITY_COMMENT", "BUILD"] as const;
export type ReactionKind = (typeof reactionKinds)[number];
export const reactionSaveSchema = z
  .object({
    kind: z.enum(reactionKinds),
    targetId: z.uuid(),
    liked: z.boolean(),
  })
  .strict();
export interface LikeSummary {
  likeCount: number;
  likedByMe: boolean;
}
