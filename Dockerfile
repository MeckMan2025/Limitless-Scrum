# Step 1: build the app (dist/) with .env.production: served under /scrum/,
# talking to the server beside it.
FROM node:22-bookworm-slim AS build
WORKDIR /src
# Packages first, so this slow step is reused when only code changes.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npx vite build

# Step 2: the server and the built app, nothing else.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production UPLOAD_DIR=/data/uploads PORT=8080
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY server/ server/
# The server shares the query language and team number with the app.
COPY src/lib/restQuery.js src/lib/restQuery.js
COPY src/data/team.js src/data/team.js
COPY --from=build /src/dist dist/
RUN mkdir -p /data/uploads && chown -R node:node /data
# Run as the image's ordinary "node" user, not root.
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
