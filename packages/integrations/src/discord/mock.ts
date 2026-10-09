import { buildDiscordChannelLink, type DiscordAdapter, type DiscordGuildMember } from "./types";

export function createMockDiscordAdapter(
  members: readonly DiscordGuildMember[] = [],
  onlineCount = 18,
): DiscordAdapter {
  return {
    async getGuildMember(_guildId, userId) {
      return members.find((member) => member.userId === userId) ?? null;
    },
    async getGuildOnlineCount() {
      return onlineCount;
    },
    getChannelLink: buildDiscordChannelLink,
  };
}
