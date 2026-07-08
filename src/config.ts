import "dotenv/config";

export const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
export const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
export const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!DISCORD_TOKEN) {
  console.error("Falta DISCORD_TOKEN en tu archivo .env");
  process.exit(1);
}
