export interface DiscordGuildMember {
  userId: string;
  nickname: string | null;
  roleIds: string[];
  source: "MOCK" | "LIVE";
}

export interface DiscordAdapter {
  getGuildMember(guildId: string, userId: string): Promise<DiscordGuildMember | null>;
  getGuildOnlineCount(guildId: string): Promise<number | null>;
  getChannelLink(guildId: string, channelId: string): string;
}

export function buildDiscordChannelLink(guildId: string, channelId: string): string {
  if (!/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(channelId)) {
    throw new Error("Discord channel links require valid Discord IDs.");
  }
  return `https://discord.com/channels/${guildId}/${channelId}`;
}
