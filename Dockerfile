FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts /app/vite.config.ts /app/mail-ingest.ts ./
COPY --from=build /app/src ./src
COPY --from=build /app/config ./config
COPY --from=build /app/tsconfig*.json ./
EXPOSE 3100
CMD ["npm", "start"]
