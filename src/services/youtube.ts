import ytdlp from "yt-dlp-exec";
import { QueueItem } from "../state";

export type QueryKind =
  | "spotify_playlist"
  | "spotify_track"
  | "youtube_playlist"
  | "youtube_link"
  | "search";

export interface TrackInfo {
  title: string;
  artist: string;
  url: string;
  webpage_url?: string;
  duration?: number;
  thumbnail?: string;
  isRadio?: boolean;
}

interface YtDlpFlatEntry {
  id?: string;
  title?: string;
  url?: string;
  duration?: number;
  uploader?: string;
  channel?: string;
}

interface YtDlpPlaylistResult {
  entries?: YtDlpFlatEntry[];
}

export function classify(query: string): QueryKind {
  const q = query.toLowerCase();
  if (q.includes("open.spotify.com/playlist")) return "spotify_playlist";
  if (q.includes("open.spotify.com/track")) return "spotify_track";
  if (q.includes("youtube.com") || q.includes("youtu.be")) {
    if (q.includes("list=")) return "youtube_playlist";
    return "youtube_link";
  }
  return "search";
}

export async function extractInfo(query: string): Promise<TrackInfo> {
  try {
    const result = await ytdlp(query, {
      dumpSingleJson: true,
      noPlaylist: true,
      format: "bestaudio/best",
      defaultSearch: "ytsearch1",
      noWarnings: true,
      quiet: true,
      cookies: "/app/youtube-cookies.txt",
    });
    const withEntries = result as unknown as YtDlpPlaylistResult;
    const info = withEntries.entries?.[0] ?? result;
    return {
      title: info.title || "Desconocido",
      url: info.url as string,
      webpage_url: (result.webpage_url as string) || query,
      artist:
        (info as any).uploader ||
        (info as any).artist ||
        (info as any).channel ||
        "Desconocido",
      duration: info.duration,
      thumbnail: (info as any).thumbnail,
    };
  } catch (error: any) {
    console.error("Error extrayendo info de YT:", error.message);
    throw new Error("No pude procesar o encontrar este video en YouTube.");
  }
}

export async function getYoutubePlaylistQueries(
  url: string,
): Promise<Partial<QueueItem>[]> {
  try {
    const result = await ytdlp(url, {
      dumpSingleJson: true,
      flatPlaylist: true,
      noWarnings: true,
      quiet: true,
      cookies: '/app/youtube-cookies.txt',
    });
    const entries = (result as unknown as YtDlpPlaylistResult).entries || [];
    return entries
      .filter((e) => e.id)
      .map((e) => ({
        query: `https://www.youtube.com/watch?v=${e.id}`,
        title: e.title,
        artist: e.uploader || e.channel || "YouTube",
        duration: e.duration,
      }));
  } catch (error: any) {
    console.error("Error obteniendo playlist de YT:", error.message);
    throw new Error(
      "No pude leer la playlist de YouTube. Puede que sea privada.",
    );
  }
}
