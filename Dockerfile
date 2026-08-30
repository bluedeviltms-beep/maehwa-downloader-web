FROM node:20-slim

# Install python3, ffmpeg, curl
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp binary globally
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy proxy files
COPY proxy/package*.json ./
RUN npm install --production || true

COPY proxy/ ./

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
