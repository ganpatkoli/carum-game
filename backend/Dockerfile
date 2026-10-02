FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/game-core packages/game-core
COPY backend backend
# the mobile/admin workspaces are not needed for the API image
RUN npm pkg set workspaces='["packages/*","backend"]' && npm install --no-audit --no-fund --workspace @carrom/backend --include-workspace-root
WORKDIR /app/backend
RUN npx prisma generate
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# apply migrations + DB constraints, then start (idempotent)
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/apply-constraints.ts && npx tsx prisma/seed.ts && npx tsx src/server.ts"]
