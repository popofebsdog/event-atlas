FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY scripts/pdf-assets.mjs ./scripts/pdf-assets.mjs
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_TURNSTILE_SITE_KEY
ENV VITE_API_URL=$VITE_API_URL VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY migrations ./migrations
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DB_PATH=/app/data/atlas.sqlite
USER node
EXPOSE 8787
CMD ["node","server/node.js"]
