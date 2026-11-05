# Long-running host image with Playwright/Chromium for Render / Railway / Fly
FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV ENABLE_PLAYWRIGHT=1
ENV PORT=3000

COPY package.json package-lock.json* ./
RUN npm install --omit=dev=false

COPY . .
RUN npm run build

# Ensure Chromium deps present (base image already has browsers)
RUN npx playwright install chromium || true
# Optional stealth engine (uncomment + set PLAYWRIGHT_ENGINE=patchright):
# RUN npm install patchright && npx patchright install chromium || true

EXPOSE 3000
CMD ["npm", "run", "start"]
