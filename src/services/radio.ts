import { QueueItem } from "../state";

export async function searchRadioGarden(
  query: string,
): Promise<Partial<QueueItem>[]> {
  try {
    const res = await fetch(
      `http://radio.garden/api/search?q=${encodeURIComponent(query)}`,
    );
    const data = (await res.json()) as any;
    const channels =
      data.hits?.hits?.filter((h: any) => h._source.type === "channel") || [];

    return channels.map((c: any) => {
      const src = c._source;
      const urlStr = src.page?.url || src.url || "";
      const idMatch = urlStr.match(/\/([^\/]+)$/);
      const id = idMatch ? idMatch[1] : src.id;
      return {
        query: `http://radio.garden/api/ara/content/listen/${id}/channel.mp3`,
        title: src.page?.title || src.title,
        artist: `Radio - ${src.page?.subtitle || src.subtitle}`,
        duration: 0,
      };
    });
  } catch (error) {
    console.error("Error in radio garden:", error);
    return [];
  }
}
