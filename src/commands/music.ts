import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { AudioPlayerStatus } from '@discordjs/voice';
import { getState } from '../state';
import { ensureVoiceConnection, playNext } from '../services/audioPlayer';
import { classify, getYoutubePlaylistQueries, extractInfo } from '../services/youtube';
import { getSpotifyTrackQueries } from '../services/spotify';
import { searchRadioGarden } from '../services/radio';
import { savePlaylist, getPlaylist, listPlaylists } from '../services/playlistDb';
import { getPlayerUI, updateMenu, formatTime } from '../ui';

export const commands = [
  {
    data: new SlashCommandBuilder().setName('menu').setDescription('Abre el menú interactivo del reproductor.'),
    async execute(interaction: ChatInputCommandInteraction) {
      const guildId = interaction.guild!.id;
      const state = getState(guildId);
      
      const ui = getPlayerUI(guildId);
      await interaction.reply(ui);
      const msg = await interaction.fetchReply();
      state.menuMessage = msg;
    }
  },
  {
    data: new SlashCommandBuilder().setName('join').setDescription('Hace que el bot se una a tu canal de voz.'),
    async execute(interaction: ChatInputCommandInteraction) {
      const channel = await ensureVoiceConnection(interaction);
      await interaction.editReply(`🔊 Conectado a **${channel.name}**`);
    }
  },
  {
    data: new SlashCommandBuilder().setName('leave').setDescription('Desconecta al bot del canal de voz.'),
    async execute(interaction: ChatInputCommandInteraction) {
      const state = getState(interaction.guild!.id);
      state.queue = [];
      state.history = [];
      state.nowPlaying = null;
      state.player?.stop();
      state.connection?.destroy();
      state.connection = null;
      state.player = null;
      await interaction.reply('👋 Desconectado.');
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('play')
      .setDescription('Reproduce una canción de YouTube o Spotify.')
      .addStringOption(option => 
        option.setName('query')
        .setDescription('Enlace o texto a buscar')
        .setRequired(true)),
    async execute(interaction: ChatInputCommandInteraction) {
      const query = interaction.options.getString('query', true);
      const guildId = interaction.guild!.id;
      const state = getState(guildId);
      const member = interaction.member as GuildMember;
      
      await ensureVoiceConnection(interaction);

      const kind = classify(query);
      const requester = member.displayName;

      const isRadioPlaying = state.nowPlaying?.query.startsWith('http://radio.garden/') || state.queue.some(q => q.query.startsWith('http://radio.garden/'));
      if (isRadioPlaying) {
        state.queue = [];
        state.player?.stop();
        state.nowPlaying = null;
      }

      if (kind === 'spotify_playlist') {
        const tracks = await getSpotifyTrackQueries(query);
        tracks.forEach((t) => state.queue.push({ ...t, query: t.query!, requester }));
        await interaction.editReply(`📀 Agregadas **${tracks.length}** canciones desde Spotify.`);
      } else if (kind === 'spotify_track') {
        const tracks = await getSpotifyTrackQueries(query);
        tracks.forEach((t) => state.queue.push({ ...t, query: t.query!, requester }));
        await interaction.editReply('➕ Agregada canción de Spotify a la cola.');
      } else if (kind === 'youtube_playlist') {
        const tracks = await getYoutubePlaylistQueries(query);
        tracks.forEach((t) => state.queue.push({ ...t, query: t.query!, requester }));
        await interaction.editReply(`📺 Agregados **${tracks.length}** videos desde la playlist de YouTube.`);
      } else {
        try {
          const info = await extractInfo(query);
          state.queue.push({
            query: info.webpage_url,
            title: info.title,
            artist: info.artist,
            duration: info.duration,
            requester
          });
          await interaction.editReply(`➕ Agregado: **${info.title}**`);
        } catch {
          state.queue.push({ query, requester });
          await interaction.editReply('➕ Agregado a la cola.');
        }
      }

      if (state.player && state.player.state.status === AudioPlayerStatus.Idle) {
        void playNext(guildId);
      } else {
        void updateMenu(guildId);
      }
    }
  },
  {
    data: new SlashCommandBuilder().setName('skip').setDescription('Salta la canción actual.'),
    async execute(interaction: ChatInputCommandInteraction) {
      const state = getState(interaction.guild!.id);
      if (state.player) {
        if (state.nowPlaying) {
          state.history.push(state.nowPlaying);
          state.nowPlaying = null;
        }
        state.player.stop();
        await interaction.reply('⏭️ Canción saltada.');
      } else {
        await interaction.reply({ content: 'No hay nada reproduciéndose.', flags: 64 });
      }
    }
  },
  {
    data: new SlashCommandBuilder().setName('pause').setDescription('Pausa la música de forma temporal.'),
    async execute(interaction: ChatInputCommandInteraction) {
      const state = getState(interaction.guild!.id);
      const status = state.player?.state.status;
      if (status === AudioPlayerStatus.Playing || status === AudioPlayerStatus.Buffering) {
        state.player!.pause();
        await interaction.reply('⏸️ Pausado. Usa el comando /resume o el botón para continuar.');
        void updateMenu(interaction.guild!.id);
      } else {
        await interaction.reply({ content: 'No hay nada reproduciéndose.', flags: 64 });
      }
    }
  },
  {
    data: new SlashCommandBuilder().setName('resume').setDescription('Reanuda la música pausada.'),
    async execute(interaction: ChatInputCommandInteraction) {
      const state = getState(interaction.guild!.id);
      const status = state.player?.state.status;
      if (status === AudioPlayerStatus.Paused || status === AudioPlayerStatus.AutoPaused) {
        state.player!.unpause();
        await interaction.reply('▶️ Reanudado.');
        void updateMenu(interaction.guild!.id);
      } else {
        await interaction.reply({ content: 'No hay música pausada.', flags: 64 });
      }
    }
  },
  {
    data: new SlashCommandBuilder().setName('stop').setDescription('Detiene la reproducción y vacía la cola.'),
    async execute(interaction: ChatInputCommandInteraction) {
      const state = getState(interaction.guild!.id);
      state.queue = [];
      state.history = [];
      state.nowPlaying = null;
      state.player?.stop();
      await interaction.reply('⏹️ Detenido y cola vaciada.');
      void updateMenu(interaction.guild!.id);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('radio')
      .setDescription('Busca una estación de radio web para reproducir')
      .addStringOption(option => option.setName('busqueda').setDescription('Nombre de la radio').setRequired(true)),
    async execute(interaction: ChatInputCommandInteraction) {
      const guildId = interaction.guild!.id;
      const state = getState(guildId);
      const query = interaction.options.getString('busqueda', true);
      const member = interaction.member as GuildMember;
      
      if (!member.voice.channelId) {
        await interaction.reply({ content: 'Debes estar en un canal de voz.', flags: 64 });
        return;
      }

      await interaction.deferReply();
      
      try {
        await ensureVoiceConnection(interaction);
      } catch (e: any) {
        await interaction.editReply(`❌ ${e.message}`);
        return;
      }

      const channels = await searchRadioGarden(query);
      if (!channels.length) {
        await interaction.editReply('❌ No encontré ninguna radio con ese nombre en Radio Garden.');
        return;
      }
      const target = channels[0];
      
      // Clear queue when playing radio to prevent overlap
      state.queue = [];
      state.player?.stop();
      state.nowPlaying = null;
      
      state.queue.push({ ...target, query: target.query!, requester: member.displayName });
      
      await interaction.editReply(`📻 Reproduciendo radio: **${target.title}**`);
      
      if (state.player && state.player.state.status === AudioPlayerStatus.Idle) {
        void playNext(guildId);
      } else {
        void updateMenu(guildId);
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('playlist')
      .setDescription('Guarda o carga tus playlists personales')
      .addStringOption(o => o.setName('accion').setDescription('save | load | list').setRequired(true))
      .addStringOption(o => o.setName('nombre').setDescription('Nombre de la playlist')),
    async execute(interaction: ChatInputCommandInteraction) {
      const guildId = interaction.guild!.id;
      const state = getState(guildId);
      const action = interaction.options.getString('accion', true).toLowerCase();
      const name = interaction.options.getString('nombre');
      const userId = interaction.user.id;
      
      if (action === 'save') {
        if (!name) return interaction.reply({ content: 'Dime el nombre para guardar: `/playlist save mi-mix`', flags: 64 });
        if (state.queue.length === 0 && !state.nowPlaying) return interaction.reply({ content: 'No hay nada reproduciéndose para guardar.', flags: 64 });
        
        const toSave = [];
        if (state.nowPlaying) toSave.push({ ...state.nowPlaying });
        toSave.push(...state.queue);
        
        savePlaylist(userId, name, toSave);
        await interaction.reply(`💾 ¡Playlist **${name}** guardada con ${toSave.length} canciones!`);
      } else if (action === 'load') {
        if (!name) return interaction.reply({ content: 'Dime el nombre a cargar: `/playlist load mi-mix`', flags: 64 });
        const tracks = getPlaylist(userId, name);
        if (!tracks) return interaction.reply({ content: `No encontré la playlist **${name}**.`, flags: 64 });
        
        const member = interaction.member as GuildMember;
        if (!member.voice.channelId) return interaction.reply({ content: 'Debes estar en un canal de voz.', flags: 64 });
        
        await ensureVoiceConnection(interaction);
        
        const isRadioPlaying = state.nowPlaying?.query.startsWith('http://radio.garden/') || state.queue.some(q => q.query.startsWith('http://radio.garden/'));
        if (isRadioPlaying) {
          state.queue = [];
          state.player?.stop();
          state.nowPlaying = null;
        }

        tracks.forEach(t => state.queue.push({ ...t, query: t.query!, requester: member.displayName }));
        
        await interaction.reply(`🎧 ¡Playlist **${name}** cargada! (${tracks.length} canciones añadidas)`);
        if (state.player && state.player.state.status === AudioPlayerStatus.Idle) void playNext(guildId);
        else void updateMenu(guildId);
      } else if (action === 'list') {
        const names = listPlaylists(userId);
        if (!names.length) await interaction.reply({ content: 'Aún no has guardado ninguna playlist.', flags: 64 });
        else await interaction.reply({ content: `📁 **Tus Playlists:**\n${names.map(n => `- ${n}`).join('\n')}`, flags: 64 });
      }
    }
  },
  {
    data: new SlashCommandBuilder().setName('queue').setDescription('Muestra la cola de canciones.'),
    async execute(interaction: ChatInputCommandInteraction) {
      const state = getState(interaction.guild!.id);
      if (state.queue.length === 0) {
        await interaction.reply('La cola está vacía.');
        return;
      }
      const lines = state.queue.slice(0, 15).map((i, idx) => {
        const name = i.title ? `**${i.title}**` : i.query;
        const artist = i.artist ? ` - *${i.artist}*` : '';
        const dur = i.duration ? ` [\`${formatTime(i.duration)}\`]` : '';
        return `${idx + 1}. ${name}${artist}${dur} (por ${i.requester})`;
      });
      const extra = state.queue.length > 15 ? `\n... y ${state.queue.length - 15} más` : '';
      await interaction.reply('📋 **Cola actual:**\n' + lines.join('\n') + extra);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('volume')
      .setDescription('Ajusta el volumen (0-200).')
      .addIntegerOption(option => 
        option.setName('level')
        .setDescription('Nivel de volumen (0-200)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(200)),
    async execute(interaction: ChatInputCommandInteraction) {
      const guildId = interaction.guild!.id;
      const state = getState(guildId);
      const level = interaction.options.getInteger('level', true);
      if (state.currentResource?.volume) {
        state.currentResource.volume.setVolume(level / 100);
        await interaction.reply(`🔊 Volumen ajustado a ${level}%`);
        void updateMenu(guildId);
      } else {
        await interaction.reply({ content: 'No hay nada reproduciéndose.', flags: 64 });
      }
    }
  }
];
