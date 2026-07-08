import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ytdlp from "yt-dlp-exec";
import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  AudioResource,
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import { getState } from "../state";
import { extractInfo, TrackInfo, getYoutubePlaylistQueries } from "./youtube";
import { currentTrackInfo, updateMenu } from "../ui";
import {
  CommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  GuildMember,
  GuildTextBasedChannel,
} from "discord.js";

export async function ensureVoiceConnection(
  interaction: CommandInteraction | ButtonInteraction | ModalSubmitInteraction,
) {
  const guildId = interaction.guild!.id;
  const state = getState(guildId);
  const member = interaction.member as GuildMember;
  const channel = member.voice.channel;

  if (!channel) {
    throw new Error("Debes estar en un canal de voz para usar el reproductor.");
  }

  if (!state.connection) {
    state.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
    });
    await entersState(state.connection, VoiceConnectionStatus.Ready, 15_000);
    state.textChannel = interaction.channel as GuildTextBasedChannel;
    setupPlayer(guildId);
  }
  return channel;
}

export function createResourceFromUrl(
  url: string,
  guildId: string,
): AudioResource<unknown> {
  const state = getState(guildId);

  const info = currentTrackInfo.get(guildId);
  if (info?.isRadio) {
    return createAudioResource(url, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });
  }

  const options: Record<string, any> = {
    o: "-",
    q: true,
    f: "bestaudio/best",
    r: "100K",
  };

  let ffmpegArgs: string[] = [];
  if (state.seekOffset > 0) {
    const h = Math.floor(state.seekOffset / 3600);
    const m = Math.floor((state.seekOffset % 3600) / 60);
    const s = Math.floor(state.seekOffset % 60);
    ffmpegArgs.push(`-ss ${h}:${m}:${s}`);
  }

  if (state.filter === "bassboost") ffmpegArgs.push("-af bass=g=15");
  else if (state.filter === "nightcore")
    ffmpegArgs.push("-af asetrate=48000*1.25,aresample=48000,atempo=1/1.25");
  else if (state.filter === "vaporwave")
    ffmpegArgs.push("-af asetrate=48000*0.8,aresample=48000,atempo=1/0.8");
  else if (state.filter === "karaoke")
    ffmpegArgs.push("-af pan=stereo|c0=c0|c1=-c1");

  if (ffmpegArgs.length > 0) {
    options["downloader"] = "ffmpeg";
    options["downloader-args"] = `ffmpeg:${ffmpegArgs.join(" ")}`;
  }

  const exec = (ytdlp as any).exec;
  const stream = exec(url, options as any, {
    stdio: ["ignore", "pipe", "ignore"],
  });

  stream.on("error", (err: any) => console.error("Error de ffmpeg:", err));

  return createAudioResource(stream.stdout!, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });
}

export async function playNext(
  guildId: string,
  forceSkip = false,
): Promise<void> {
  const state = getState(guildId);

  if (!forceSkip && state.nowPlaying) {
    if (state.loopMode === "song") {
      state.queue.unshift(state.nowPlaying);
    } else {
      state.history.push(state.nowPlaying);
      if (state.history.length > 20) state.history.shift();
      if (state.loopMode === "queue") {
        state.queue.push(state.nowPlaying);
      }
    }
  }

  let nextItem = state.queue.shift();

  if (!nextItem && state.autoplay && state.nowPlaying) {
    try {
      const videoIdMatch = state.nowPlaying.query.match(/v=([a-zA-Z0-9_-]+)/);
      if (videoIdMatch) {
        const mixUrl = `https://www.youtube.com/watch?v=${videoIdMatch[1]}&list=RD${videoIdMatch[1]}`;
        const tracks = await getYoutubePlaylistQueries(mixUrl);
        if (tracks.length > 1) {
          nextItem = {
            ...tracks[1],
            query: tracks[1].query!,
            requester: "🤖 Autoplay",
          };
        }
      }
    } catch (e) {
      console.error("Error fetching autoplay related", e);
    }
  }

  if (!nextItem) {
    state.nowPlaying = null;
    currentTrackInfo.delete(guildId);
    state.currentResource = null;
    void updateMenu(guildId);
    return;
  }

  if (!state.player || !state.connection) return;

  state.nowPlaying = nextItem;
  state.seekOffset = 0;

  let info: TrackInfo;
  if (nextItem.query.startsWith("http://radio.garden/")) {
    let finalUrl = nextItem.query;
    try {
      const ac = new AbortController();
      const res = await fetch(finalUrl, {
        signal: ac.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/114.0.0.0 Safari/537.36",
        },
      });
      finalUrl = res.url;
      ac.abort();
    } catch (e) {
      console.error("Error resolving radio redirect:", e);
    }

    info = {
      title: nextItem.title || "Radio",
      artist: nextItem.artist || "Radio",
      url: finalUrl,
      webpage_url: nextItem.query,
      duration: 0,
      isRadio: true,
    };
    currentTrackInfo.set(guildId, info);
  } else {
    try {
      info = await extractInfo(nextItem.query);
      currentTrackInfo.set(guildId, info);
    } catch (err: any) {
      state.textChannel?.send(
        `No pude reproducir \`${nextItem.query}\`: ${err.message}`,
      );
      state.nowPlaying = null;
      return playNext(guildId);
    }
  }

  try {
    const resource = createResourceFromUrl(info.url, guildId);
    if (state.currentResource?.volume) {
      resource.volume?.setVolume(state.currentResource.volume.volume);
    }
    state.player.play(resource);
    state.currentResource = resource;
    void updateMenu(guildId);
  } catch (error: any) {
    console.error("Error al reproducir audio:", error);
    state.textChannel?.send(
      `Hubo un error interno al intentar reproducir **${info.title}**.`,
    );
    state.nowPlaying = null;
    return playNext(guildId);
  }
}

export async function seek(guildId: string, seconds: number) {
  const state = getState(guildId);
  if (!state.nowPlaying || !state.player || !state.currentResource) return;

  const currentPos =
    state.seekOffset + state.currentResource.playbackDuration / 1000;
  let newPos = currentPos + seconds;
  if (newPos < 0) newPos = 0;

  const info = currentTrackInfo.get(guildId);
  if (!info) return;

  state.seekOffset = newPos;

  try {
    const resource = createResourceFromUrl(info.url, guildId);
    if (state.currentResource?.volume) {
      resource.volume?.setVolume(state.currentResource.volume.volume);
    }
    state.player.play(resource);
    state.currentResource = resource;
    void updateMenu(guildId);
  } catch (error) {
    console.error("Error in seek:", error);
  }
}

export function setupPlayer(guildId: string): void {
  const state = getState(guildId);
  const player = createAudioPlayer();

  player.on(AudioPlayerStatus.Playing, () => {
    if (!state.progressInterval) {
      state.progressInterval = setInterval(() => {
        void updateMenu(guildId);
      }, 5000);
    }
  });

  player.on(AudioPlayerStatus.Paused, () => {
    if (state.progressInterval) {
      clearInterval(state.progressInterval);
      state.progressInterval = null;
    }
    void updateMenu(guildId);
  });

  player.on(AudioPlayerStatus.Idle, () => {
    if (state.progressInterval) {
      clearInterval(state.progressInterval);
      state.progressInterval = null;
    }
    playNext(guildId);
  });

  player.on("error", (err) => {
    console.error("Error del reproductor:", err);
    state.textChannel?.send(`Error de reproducción: ${err.message}`);
    if (state.progressInterval) {
      clearInterval(state.progressInterval);
      state.progressInterval = null;
    }
    playNext(guildId);
  });

  state.player = player;
  state.connection!.subscribe(player);
}
