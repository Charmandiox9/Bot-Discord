# Bot de Música para Discord (TypeScript + pnpm)

Versión en TypeScript del bot de música interactivo, gestionado con pnpm y utilizando Slash Commands.
Incluye un reproductor visual y modular.

## Características

- **YouTube**: Reproduce enlaces directos, playlists y realiza búsquedas automáticas.
- **Spotify**: Reproduce canciones y playlists (el bot busca automáticamente el equivalente exacto en YouTube).
- **Radio Garden**: Reproduce estaciones de radio web en vivo a nivel mundial.
- **Playlists Personales**: Guarda tus canciones o la cola entera en playlists personalizadas para cargarlas cuando quieras.
- **Reproductor Interactivo**: Controla la música desde botones directamente en Discord (Pausar, Reanudar, Ajustar Volumen, Buscar Letras, etc.).
- **Filtros de Audio**: Aplica filtros en tiempo real como Nightcore, 8D, Vaporwave o Karaoke.
- **Letras**: Obtiene y muestra la letra de la canción que está sonando.

## 1. Requisitos previos

- **Node.js 18 o superior**
- **pnpm** (`npm install -g pnpm` si no lo tienes)
- **Python 3** instalado en el sistema (yt-dlp lo necesita internamente)
- No necesitas instalar ffmpeg aparte: `ffmpeg-static` lo trae incluido como dependencia npm.

## 2. Crear el bot en Discord

1. Ve a https://discord.com/developers/applications
2. **New Application** → ponle un nombre
3. Pestaña **Bot** → **Reset Token** → copia el token
4. En la misma pestaña, activa **MESSAGE CONTENT INTENT**
5. **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Connect`, `Speak`, `Send Messages`, `Read Message History`
   - Abre la URL generada para invitar el bot a tu servidor

## 3. (Opcional) Credenciales de Spotify

Solo si vas a usar links de Spotify:

1. https://developer.spotify.com/dashboard → **Create app**
2. Copia el **Client ID** y **Client Secret**

## 4. Instalación

```bash
pnpm install
```

## 5. Configurar variables de entorno

Crea o edita un archivo `.env` en la raíz del proyecto:
```
DISCORD_TOKEN=tu_token_aqui
DISCORD_CLIENT_ID=el_id_de_tu_aplicacion_aqui
SPOTIFY_CLIENT_ID=tu_client_id_aqui        # opcional
SPOTIFY_CLIENT_SECRET=tu_client_secret_aqui # opcional
```

> **Importante**: Para que los comandos `/` funcionen, debes ejecutar el script de registro al menos una vez (o cada vez que agregues un nuevo comando):
> ```bash
> pnpm run register
> ```

## 6. Ejecutar el bot

**Modo desarrollo** (recarga automática al guardar con `tsx`):
```bash
pnpm dev
```

**Modo producción** (compila a JS y luego corre el build):
```bash
pnpm build
pnpm start
```

## 7. Comandos disponibles (Slash Commands)

| Comando | Descripción |
|---|---|
| `/play <enlace o búsqueda>` | Despliega el menú del reproductor y agrega la canción o playlist a la cola. |
| `/radio <nombre>` | Busca una emisora en Radio Garden y la reproduce en vivo. |
| `/playlist save <nombre>` | Guarda todo lo que está sonando y en la cola en una playlist personal. |
| `/playlist load <nombre>` | Carga una playlist que hayas guardado previamente. |
| `/playlist list` | Muestra los nombres de tus playlists guardadas. |
| `/queue` | Muestra las canciones en la cola. |
| `/skip` | Salta la canción actual. |
| `/pause` | Pausa la reproducción de forma temporal. |
| `/resume` | Reanuda la reproducción pausada. |
| `/stop` | Detiene todo, vacía la cola y reinicia el reproductor. |

## 8. Menú Interactivo (Player UI)

Al ejecutar `/play` o interactuar con el reproductor, el bot mostrará un panel de botones:
- **▶️/⏸️ Pausar/Reanudar:** Controla el estado actual.
- **⏭️ Saltar:** Pasa a la siguiente canción.
- **🔊 Volumen:** Abre un menú para ajustar el volumen del 0 al 200%.
- **📝 Letras:** Busca la letra de la canción que suena.
- **🎵 Añadir:** Abre un menú para buscar música o insertar enlaces (YouTube/Spotify).
- **🌍 Radio Garden:** Abre un menú para buscar una emisora.
- **💾 / 📂 Guardar y Cargar Playlist:** Gestiona tus mixes favoritos sin tener que volver a buscar todas las canciones.
- **🎛️ Filtros:** Desplegable para aplicar filtros de sonido al instante (Normal, Bassboost, Nightcore, 8D, etc.).

*Nota: La radio en vivo y la lista de canciones en cola se manejan sin solaparse. Si reproduces una radio mientras escuchas música, la cola se vacía para dar prioridad a la radio, y viceversa.*

## 9. Estructura del proyecto

```
discord-music-bot-ts/
├── src/
│   ├── commands/       # Slash commands (/play, /radio, etc.)
│   ├── services/       # Módulos externos (audioPlayer, spotify, youtube, radio, playlistDb)
│   ├── index.ts        # Punto de entrada (conexión del cliente)
│   ├── interactions.ts # Gestor de interacciones (Botones, Modales, SelectMenus)
│   ├── register.ts     # Script para registrar Slash Commands en la API de Discord
│   ├── state.ts        # Estado global de los servidores (colones, reproductor, volumen)
│   └── ui.ts           # Funciones para construir el panel del Reproductor (Embeds/Botones)
├── playlists.json      # Base de datos local donde se guardan tus playlists
├── package.json
├── tsconfig.json
└── README.md
```

## Notas importantes

- Corre `pnpm run typecheck` en cualquier momento para verificar tipos sin generar archivos.
- `yt-dlp-exec` descarga el binario de `yt-dlp` automáticamente en la instalación. Si falla, puedes reinstalar el paquete.
- Reproducir contenido con copyright puede violar los Términos de Servicio de YouTube/Spotify según el uso. Úsalo de forma privada y responsable.
