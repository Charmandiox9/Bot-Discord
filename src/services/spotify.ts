import SpotifyWebApi from 'spotify-web-api-node';
import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from '../config';
import { QueueItem } from '../state';

export const spotifyApi: SpotifyWebApi | null =
  SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET
    ? new SpotifyWebApi({
        clientId: SPOTIFY_CLIENT_ID,
        clientSecret: SPOTIFY_CLIENT_SECRET,
      })
    : null;

export async function ensureSpotifyToken(): Promise<void> {
  if (!spotifyApi) {
    throw new Error(
      'Spotify no está configurado. Faltan las credenciales en tu .env'
    );
  }
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body.access_token);
  } catch (error: any) {
    console.error('Error al obtener token de Spotify:', error.message);
    throw new Error('No se pudo acceder a Spotify. Verifica tus credenciales o asegúrate de que la playlist sea pública.');
  }
}

function itemsToQueries(items: SpotifyApi.PlaylistTrackObject[]): Partial<QueueItem>[] {
  return items
    .filter((item) => item.track)
    .map((item) => {
      const t = item.track!;
      const artists = t.artists.map((a) => a.name).join(', ');
      return {
        query: `${t.name} ${artists}`,
        title: t.name,
        artist: artists,
        duration: Math.floor(t.duration_ms / 1000),
      };
    });
}

export async function getSpotifyTrackQueries(url: string): Promise<Partial<QueueItem>[]> {
  await ensureSpotifyToken();
  if (!spotifyApi) throw new Error('Spotify no configurado');

  try {
    if (url.includes('playlist/')) {
      const playlistId = url.split('playlist/')[1].split('?')[0];
      let queries: Partial<QueueItem>[] = [];
      let response = await spotifyApi.getPlaylistTracks(playlistId, { limit: 100, offset: 0 });
      queries = queries.concat(itemsToQueries(response.body.items));

      const total = response.body.total;
      let offset = 100;
      while (offset < total) {
        response = await spotifyApi.getPlaylistTracks(playlistId, { limit: 100, offset });
        queries = queries.concat(itemsToQueries(response.body.items));
        offset += 100;
      }
      return queries;
    }

    if (url.includes('track/')) {
      const trackId = url.split('track/')[1].split('?')[0];
      const response = await spotifyApi.getTrack(trackId);
      const t = response.body;
      const artists = t.artists.map((a) => a.name).join(', ');
      return [{
        query: `${t.name} ${artists}`,
        title: t.name,
        artist: artists,
        duration: Math.floor(t.duration_ms / 1000),
      }];
    }

    return [];
  } catch (error: any) {
    console.error('Error en getSpotifyTrackQueries:', error.message);
    throw new Error('Hubo un problema con Spotify. ¿Verificaste que la playlist no sea privada?');
  }
}
