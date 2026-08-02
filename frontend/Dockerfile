# ─── Stage 1: build the static bundle ─────────────────────────────────────────
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines env vars at build time, so the API URL must be known here.
ARG VITE_API_URL=http://localhost:3000/api
ARG VITE_SOCKET_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL

RUN npm run build


# ─── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
