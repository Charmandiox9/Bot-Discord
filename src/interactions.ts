import {
  ButtonInteraction,
  ModalSubmitInteraction,
  GuildMember,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { getState } from "./state";
import { AudioPlayerStatus } from "@discordjs/voice";
import {
  getAddSongModal,
  getVolumeModal,
  updateMenu,
  formatTime,
  getRadioModal,
  getPlaylistSaveModal,
  getPlaylistLoadModal,
} from "./ui";
import {
  classify,
  getYoutubePlaylistQueries,
  extractInfo,
} from "./services/youtube";
import { getSpotifyTrackQueries } from "./services/spotify";
import { searchRadioGarden } from "./services/radio";
import {
  savePlaylist,
  getPlaylist,
  listPlaylists,
} from "./services/playlistDb";
import { playNext, ensureVoiceConnection, seek } from "./services/audioPlayer";
export async function handleInteraction(
  interaction:
    | ButtonInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction,
) {
  const guildId = interaction.guild!.id;
  const state = getState(guildId);

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "select_filter") {
      const filter = interaction.values[0] as any;
      state.filter = filter;
      if (state.currentResource) {
        void seek(guildId, state.seekOffset);
      }
      await interaction.update({
        content: `✅ Filtro cambiado a **${filter}**. Recargando audio...`,
        components: [],
      });
      return;
    }

    if (interaction.customId === "select_playlist_load") {
      const name = interaction.values[0];
      const tracks = getPlaylist(interaction.user.id, name);
      if (!tracks) {
        await interaction.update({
          content: `No encontré la playlist **${name}**.`,
          components: [],
        });
        return;
      }

      try {
        await ensureVoiceConnection(interaction as any);
      } catch (e: any) {
        await interaction.update({
          content: `❌ ${e.message}`,
          components: [],
        });
        return;
      }

      const isRadioPlaying =
        state.nowPlaying?.query.startsWith("http://radio.garden/") ||
        state.queue.some((q) => q.query.startsWith("http://radio.garden/"));
      if (isRadioPlaying) {
        state.queue = [];
        state.player?.stop();
        state.nowPlaying = null;
      }

      state.queue.push(...(tracks as any));
      if (!state.nowPlaying) {
        void playNext(guildId);
      } else {
        void updateMenu(guildId);
      }
      await interaction.update({
        content: `🎧 ¡Playlist **${name}** cargada! (${tracks.length} canciones añadidas)`,
        components: [],
      });
      return;
    }
  }

  if (interaction.isButton()) {
    switch (interaction.customId) {
      case "btn_prev":
        if (state.history.length > 0) {
          const prev = state.history.pop()!;
          if (state.nowPlaying) {
            state.queue.unshift(state.nowPlaying);
            state.nowPlaying = null;
          }
          state.queue.unshift(prev);
          state.player?.stop();
          await interaction.deferUpdate();
        }
        break;
      case "btn_rewind":
        await interaction.deferUpdate();
        void seek(guildId, -15);
        break;

      case "btn_forward":
        await interaction.deferUpdate();
        void seek(guildId, 15);
        break;

      case "btn_pause":
      case "btn_resume":
        if (state.player) {
          const status = state.player.state.status;
          if (
            status === AudioPlayerStatus.Playing ||
            status === AudioPlayerStatus.Buffering
          ) {
            state.player.pause();
          } else if (
            status === AudioPlayerStatus.Paused ||
            status === AudioPlayerStatus.AutoPaused
          ) {
            state.player.unpause();
          }
        }
        await interaction.deferUpdate();
        void updateMenu(guildId);
        break;

      case "btn_skip":
        if (state.player) {
          if (state.nowPlaying) {
            state.history.push(state.nowPlaying);
            state.nowPlaying = null;
          }
          state.player.stop();
        }
        await interaction.deferUpdate();
        break;

      case "btn_loop":
        if (state.loopMode === "off") state.loopMode = "song";
        else if (state.loopMode === "song") state.loopMode = "queue";
        else state.loopMode = "off";
        await interaction.deferUpdate();
        void updateMenu(guildId);
        break;

      case "btn_add":
        await interaction.showModal(getAddSongModal());
        break;

      case "btn_volume":
        await interaction.showModal(getVolumeModal());
        break;

      case "btn_radio":
        await interaction.showModal(getRadioModal());
        break;

      case "btn_playlist_save":
        await interaction.showModal(getPlaylistSaveModal());
        break;

      case "btn_playlist_load": {
        const names = listPlaylists(interaction.user.id);
        if (names.length === 0) {
          await interaction.reply({
            content: "Aún no has guardado ninguna playlist.",
            flags: 64,
          });
          return;
        }

        const options = names.map((n) => ({ label: n, value: n }));
        const row =
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("select_playlist_load")
              .setPlaceholder("Elige una playlist para cargar")
              .addOptions(options.slice(0, 25)),
          );
        await interaction.reply({
          content: "Selecciona la playlist que quieres cargar:",
          components: [row],
          flags: 64,
        });
        break;
      }

      case "btn_lyrics": {
        if (!state.nowPlaying) {
          await interaction.reply({
            content: "No hay nada reproduciéndose.",
            flags: 64,
          });
          return;
        }
        const title = state.nowPlaying.title || "";
        const artist = state.nowPlaying.artist || "";

        await interaction.deferReply({ flags: 64 });
        try {
          const lyricsFinder = require("lyrics-finder");
          const lyrics =
            (await lyricsFinder(artist, title)) ||
            "No se encontraron letras para esta canción.";
          await interaction.editReply(
            `📝 **Letra de ${title || state.nowPlaying.query}**\n\n${lyrics.substring(0, 1900)}`,
          );
        } catch (err) {
          await interaction.editReply("Hubo un error buscando las letras.");
        }
        break;
      }

      case "btn_autoplay": {
        state.autoplay = !state.autoplay;
        void updateMenu(guildId);
        await interaction.deferUpdate();
        break;
      }

      case "btn_filter": {
        const row =
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("select_filter")
              .setPlaceholder("Elige un filtro de audio")
              .addOptions([
                { label: "Ninguno (Normal)", value: "none" },
                { label: "Bassboost (Graves)", value: "bassboost" },
                { label: "Nightcore (Acelerado)", value: "nightcore" },
                { label: "Vaporwave (Lento)", value: "vaporwave" },
                { label: "Karaoke (Sin voz)", value: "karaoke" },
              ]),
          );
        await interaction.reply({
          content: "Selecciona el filtro que quieres aplicar:",
          components: [row],
          flags: 64,
        });
        break;
      }

      case "btn_queue": {
        const lines = state.queue.slice(0, 15).map((i, idx) => {
          const name = i.title ? `**${i.title}**` : i.query;
          const artist = i.artist ? ` - *${i.artist}*` : "";
          const dur = i.duration ? ` [\`${formatTime(i.duration)}\`]` : "";
          return `${idx + 1}. ${name}${artist}${dur} (por ${i.requester})`;
        });
        const extra =
          state.queue.length > 15
            ? `\n... y ${state.queue.length - 15} más`
            : "";
        const qMsg = lines.length
          ? lines.join("\n") + extra
          : "La cola está vacía.";
        await interaction.reply({
          content: `📋 **Cola actual:**\n${qMsg}`,
          flags: 64,
        });
        break;
      }

      case "btn_stop":
        state.queue = [];
        state.history = [];
        state.nowPlaying = null;
        state.player?.stop();
        await interaction.deferUpdate();
        void updateMenu(guildId);
        break;
    }
  }
}

export async function handleModal(interaction: ModalSubmitInteraction) {
  const guildId = interaction.guild!.id;
  const state = getState(guildId);
  const member = interaction.member as GuildMember;

  if (interaction.customId === "modal_add_song") {
    const query = interaction.fields.getTextInputValue("input_query");
    await interaction.deferReply({ flags: 64 });

    try {
      await ensureVoiceConnection(interaction);
    } catch (e: any) {
      await interaction.editReply(`❌ ${e.message}`);
      return;
    }

    const kind = classify(query);
    const requester = member.displayName;

    try {
      let added = 0;

      const isRadioPlaying =
        state.nowPlaying?.query.startsWith("http://radio.garden/") ||
        state.queue.some((q) => q.query.startsWith("http://radio.garden/"));
      if (isRadioPlaying) {
        state.queue = [];
        state.player?.stop();
        state.nowPlaying = null;
      }

      if (kind === "spotify_playlist" || kind === "spotify_track") {
        const tracks = await getSpotifyTrackQueries(query);
        tracks.forEach((t) =>
          state.queue.push({ ...t, query: t.query!, requester }),
        );
        added = tracks.length;
      } else if (kind === "youtube_playlist") {
        const tracks = await getYoutubePlaylistQueries(query);
        tracks.forEach((t) =>
          state.queue.push({ ...t, query: t.query!, requester }),
        );
        added = tracks.length;
      } else {
        try {
          const info = await extractInfo(query);
          state.queue.push({
            query: info.webpage_url || query,
            title: info.title,
            artist: info.artist,
            duration: info.duration,
            requester,
          });
        } catch {
          state.queue.push({ query, requester });
        }
        added = 1;
      }

      await interaction.editReply(`✅ Se agregaron ${added} pistas a la cola.`);

      if (
        state.player &&
        state.player.state.status === AudioPlayerStatus.Idle
      ) {
        void playNext(guildId);
      } else {
        void updateMenu(guildId);
      }
    } catch (e: any) {
      await interaction.editReply(`⚠️ Error: ${e.message}`);
    }
  }

  if (interaction.customId === "modal_volume") {
    const levelStr = interaction.fields.getTextInputValue("input_volume");
    const level = parseInt(levelStr, 10);

    if (isNaN(level) || level < 0 || level > 200) {
      await interaction.reply({
        content: "❌ El volumen debe ser un número entre 0 y 200.",
        flags: 64,
      });
      return;
    }

    if (state.currentResource?.volume) {
      state.currentResource.volume.setVolume(level / 100);
      await interaction.reply({
        content: `🔊 Volumen ajustado a ${level}%`,
        flags: 64,
      });
      void updateMenu(guildId);
    } else {
      await interaction.reply({
        content: "No hay nada reproduciéndose.",
        flags: 64,
      });
    }
  }

  if (interaction.customId === "modal_radio") {
    const query = interaction.fields.getTextInputValue("input_query");
    await interaction.deferReply({ flags: 64 });
    try {
      await ensureVoiceConnection(interaction);
    } catch (e: any) {
      await interaction.editReply(`❌ ${e.message}`);
      return;
    }
    const channels = await searchRadioGarden(query);
    if (!channels.length) {
      await interaction.editReply(
        "❌ No encontré ninguna radio con ese nombre en Radio Garden.",
      );
      return;
    }
    const target = channels[0];

    state.queue = [];
    state.player?.stop();
    state.nowPlaying = null;

    state.queue.push({
      ...target,
      query: target.query!,
      requester: member.displayName,
    });
    await interaction.editReply(`✅ Reproduciendo radio: **${target.title}**`);
    if (state.player && state.player.state.status === AudioPlayerStatus.Idle) {
      void playNext(guildId);
    } else {
      void updateMenu(guildId);
    }
  }

  if (interaction.customId === "modal_playlist_save") {
    const name = interaction.fields.getTextInputValue("input_name");
    if (state.queue.length === 0 && !state.nowPlaying) {
      await interaction.reply({
        content: "No hay nada reproduciéndose para guardar.",
        flags: 64,
      });
      return;
    }
    const toSave = [];
    if (state.nowPlaying) toSave.push({ ...state.nowPlaying });
    toSave.push(...state.queue);
    savePlaylist(interaction.user.id, name, toSave);
    await interaction.reply({
      content: `💾 ¡Playlist **${name}** guardada con ${toSave.length} canciones!`,
      flags: 64,
    });
  }

  if (interaction.customId === "modal_playlist_load") {
    const name = interaction.fields.getTextInputValue("input_name");
    const tracks = getPlaylist(interaction.user.id, name);
    if (!tracks) {
      await interaction.reply({
        content: `No encontré la playlist **${name}**.`,
        flags: 64,
      });
      return;
    }
    try {
      await ensureVoiceConnection(interaction);
    } catch (e: any) {
      await interaction.reply({ content: `❌ ${e.message}`, flags: 64 });
      return;
    }
    tracks.forEach((t) =>
      state.queue.push({
        ...t,
        query: t.query!,
        requester: member.displayName,
      }),
    );
    await interaction.reply({
      content: `🎧 ¡Playlist **${name}** cargada! (${tracks.length} canciones añadidas)`,
      flags: 64,
    });
    if (state.player && state.player.state.status === AudioPlayerStatus.Idle)
      void playNext(guildId);
    else void updateMenu(guildId);
  }
}
