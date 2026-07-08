FROM node:20-alpine

# Instalar Python 3 (requerido por yt-dlp) y FFmpeg
RUN apk add --no-cache python3 ffmpeg

WORKDIR /app

# Habilitar pnpm
RUN corepack enable

# Copiar dependencias e instalarlas
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copiar el resto del código y compilar TypeScript
COPY . .
RUN pnpm build

# Comando para iniciar el bot
CMD ["pnpm", "start"]
