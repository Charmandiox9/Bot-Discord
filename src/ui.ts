import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getState } from './state';
import { AudioPlayerStatus } from '@discordjs/voice';
import { TrackInfo } from './services/youtube';

export const currentTrackInfo = new Map<string, TrackInfo>();

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getPlayerUI(guildId: string) {
  const state = getState(guildId);
  const info = currentTrackInfo.get(guildId);
  const status = state.player?.state.status;
  const isPlaying = status === AudioPlayerStatus.Playing || status === AudioPlayerStatus.Buffering;
  
  const currentPosSecs = state.currentResource ? state.seekOffset + (state.currentResource.playbackDuration / 1000) : 0;

  const embed = new EmbedBuilder().setColor('#2B2D31');

  if (state.nowPlaying && info) {
    const totalDuration = info.duration ? formatTime(info.duration) : '∞';
    const currentTime = formatTime(currentPosSecs);
    
    let progressBar = '';
    if (info.duration && info.duration > 0) {
      const percent = Math.min(1, currentPosSecs / info.duration);
      const length = 15;
      const progress = Math.round(length * percent);
      const progressStr = '▬'.repeat(progress) + '🔘' + '▬'.repeat(Math.max(0, length - progress - 1));
      progressBar = `\n\n\`${currentTime}\` ${progressStr} \`${totalDuration}\``;
    }

    embed.setAuthor({ name: 'Reproduciendo Ahora', iconURL: 'https://cdn-icons-png.flaticon.com/512/3269/3269986.png' })
         .setTitle(info.title || state.nowPlaying.title || 'Desconocido')
         .setURL(info.webpage_url || null)
         .setDescription(progressBar || null)
         .addFields(
           { name: '🎤 Artista', value: `\`${info.artist || state.nowPlaying.artist || 'Desconocido'}\``, inline: true },
           { name: '👤 Pedido por', value: `\`${state.nowPlaying.requester}\``, inline: true }
         );
         
    if (info.thumbnail) {
      embed.setThumbnail(info.thumbnail);
    }
  } else {
    embed.setAuthor({ name: 'Reproductor de Música' })
         .setDescription('💤 *Silencio en la sala... No hay nada reproduciéndose.*');
  }

  const loopStr = state.loopMode === 'off' ? 'Desactivado' : state.loopMode === 'song' ? 'Canción' : 'Cola';
  const volStr = state.currentResource?.volume ? `${Math.round(state.currentResource.volume.volume * 100)}%` : '100%';
  const filterStr = state.filter !== 'none' ? ` | 🎛️ ${state.filter}` : '';
  const apStr = state.autoplay ? ' | 📻 Autoplay' : '';
  embed.setFooter({ text: `En Cola: ${state.queue.length} | Bucle: ${loopStr} | Vol: ${volStr}${filterStr}${apStr}` });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_prev').setLabel('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(state.history.length === 0),
    new ButtonBuilder().setCustomId(isPlaying ? 'btn_pause' : 'btn_resume').setLabel(isPlaying ? '⏸️ Pausa' : '▶️ Reanudar').setStyle(isPlaying ? ButtonStyle.Primary : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(state.queue.length === 0 && !state.autoplay),
    new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Limpiar y Parar').setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_rewind').setLabel('⏪').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_forward').setLabel('⏩').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_loop').setLabel('🔁').setStyle(state.loopMode !== 'off' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_volume').setLabel('🔊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_queue').setLabel('📋').setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_add').setLabel('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_lyrics').setLabel('📝 Letra').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_filter').setLabel(`🎛️ Filtro`).setStyle(state.filter !== 'none' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_autoplay').setLabel(`📻 Autoplay`).setStyle(state.autoplay ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_radio').setLabel('🌍 Radio Garden').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_playlist_save').setLabel('💾 Guardar Playlist').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_playlist_load').setLabel('📂 Cargar Playlist').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

export async function updateMenu(guildId: string) {
  const state = getState(guildId);
  if (state.menuMessage) {
    try {
      await state.menuMessage.edit(getPlayerUI(guildId));
    } catch (e) {
      state.menuMessage = null;
    }
  }
  if (!state.menuMessage && state.textChannel) {
    try {
      state.menuMessage = await state.textChannel.send(getPlayerUI(guildId));
    } catch (e) {
      console.error('Error enviando el menu:', e);
    }
  }
}

export function getAddSongModal() {
  const modal = new ModalBuilder().setCustomId('modal_add_song').setTitle('Agregar Canción');
  const input = new TextInputBuilder()
    .setCustomId('input_query')
    .setLabel('Nombre o Enlace (YouTube/Spotify)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function getVolumeModal() {
  const modal = new ModalBuilder().setCustomId('modal_volume').setTitle('Ajustar Volumen');
  const input = new TextInputBuilder()
    .setCustomId('input_volume')
    .setLabel('Nivel (0 a 200)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function getRadioModal() {
  const modal = new ModalBuilder().setCustomId('modal_radio').setTitle('Buscar Radio Garden');
  const input = new TextInputBuilder()
    .setCustomId('input_query')
    .setLabel('Nombre de la radio (ej. FM Dos)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function getPlaylistSaveModal() {
  const modal = new ModalBuilder().setCustomId('modal_playlist_save').setTitle('Guardar Playlist');
  const input = new TextInputBuilder()
    .setCustomId('input_name')
    .setLabel('Nombre de la playlist')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function getPlaylistLoadModal() {
  const modal = new ModalBuilder().setCustomId('modal_playlist_load').setTitle('Cargar Playlist');
  const input = new TextInputBuilder()
    .setCustomId('input_name')
    .setLabel('Nombre de la playlist a cargar')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}
