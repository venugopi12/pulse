# Pulse API server (Express + WebSocket). The web app is deployed separately (Vercel).
#
#   docker build -t pulse-api .
#   docker run -p 4000:4000 -e JWT_SECRET=$(openssl rand -hex 32) -e CORS_ORIGIN=http://localhost:5173 pulse-api

# ---- build: compile the server (tsup bundles @pulse/shared into dist/) ----
FROM node:22-alpine AS build
WORKDIR /app
# Manifests first, so dependency installs are cached until they change.
COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @pulse/server
# A package.json with ONLY the server's runtime dependencies. @pulse/shared is
# already bundled into dist/, and nothing from the web app or the dev tooling
# belongs in the server image.
RUN node -e "const p=require('./apps/server/package.json');delete p.dependencies['@pulse/shared'];delete p.devDependencies;p.scripts={start:'node dist/index.js'};require('fs').writeFileSync('runtime-package.json',JSON.stringify(p,null,2))"

# ---- runtime: production dependencies + compiled output only ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY --from=build /app/runtime-package.json package.json
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/apps/server/dist dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:${PORT}/api/health || exit 1
CMD ["node", "dist/index.js"]
