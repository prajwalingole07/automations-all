# ==============================================================================
# Dockerfile for Render.com - NEXUS Automation Hub
# ==============================================================================
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PORT=3080
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Install Python 3, pip, and system dependencies for Playwright / Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root dependency manifests
COPY package.json package-lock.json* ./

# Install ALL dependencies (including build tools like tailwindcss, typescript)
RUN npm install --include=dev --legacy-peer-deps

# Install Playwright Chromium browser binaries
RUN npx playwright install chromium

# Install Python packages required for Python-based automations
RUN pip3 install --no-cache-dir --break-system-packages \
    pandas \
    openpyxl \
    pdfplumber \
    flask \
    requests

# Copy full application code (clean, no 2026 test files)
COPY . .

# Build Next.js production bundle
RUN npm run build

# Set production runtime environment
ENV NODE_ENV=production

# Expose server port (Render routes dynamic PORT to this container)
EXPOSE 3080

# Start command
CMD ["npm", "start"]
