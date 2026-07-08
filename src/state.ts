import { AudioPlayer, VoiceConnection, AudioResource } from '@discordjs/voice';
import { GuildTextBasedChannel, Message } from 'discord.js';

export interface QueueItem {
  query: string;
  requester: string;
  title?: string;
  artist?: string;
  duration?: number;
}

export type LoopMode = 'off' | 'song' | 'queue';
export type AudioFilter = 'none' | 'bassboost' | 'nightcore' | 'vaporwave' | 'karaoke';

export interface GuildState {
  queue: QueueItem[];
  history: QueueItem[];
  loopMode: LoopMode;
  nowPlaying: QueueItem | null;
  player: AudioPlayer | null;
  connection: VoiceConnection | null;
  textChannel: GuildTextBasedChannel | null;
  currentResource: AudioResource<unknown> | null;
  menuMessage: Message | null;
  seekOffset: number;
  progressInterval?: NodeJS.Timeout | null;
  filter: AudioFilter;
  autoplay: boolean;
}

const guildStates = new Map<string, GuildState>();

export function getState(guildId: string): GuildState {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      queue: [],
      history: [],
      loopMode: 'off',
      nowPlaying: null,
      player: null,
      connection: null,
      textChannel: null,
      currentResource: null,
      menuMessage: null,
      seekOffset: 0,
      progressInterval: null,
      filter: 'none',
      autoplay: false,
    });
  }
  return guildStates.get(guildId)!;
}
