FROM node:22-slim
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/src/admin/rbac.ts backend/src/admin/rbac.ts
COPY admin admin
RUN npm pkg set workspaces='["admin"]' && npm install --no-audit --no-fund --workspace @carrom/admin --include-workspace-root --include=dev
WORKDIR /app/admin
RUN npx next build
EXPOSE 3001
CMD ["npx", "next", "start", "-p", "3001"]
