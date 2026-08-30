FROM node:20-slim

# Install python3, python3-pip, ffmpeg, curl, ca-certificates
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp via pip3 (most updated release)
RUN pip3 install --no-cache-dir -U yt-dlp --break-system-packages || pip3 install --no-cache-dir -U yt-dlp

WORKDIR /app

# Copy proxy package files
COPY proxy/package*.json ./
RUN npm install --production || true

COPY proxy/ ./

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
