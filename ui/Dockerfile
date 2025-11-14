ARG REGISTRY_PREFIX=
FROM ${REGISTRY_PREFIX}node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${REGISTRY_PREFIX}node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Inject public envs at build time to ensure correct client API base
ARG NEXT_PUBLIC_API_BASE=/api
ARG NEXT_PUBLIC_API_KEY
RUN printf "NEXT_PUBLIC_API_BASE=%s\nNEXT_PUBLIC_API_KEY=%s\n" "$NEXT_PUBLIC_API_BASE" "$NEXT_PUBLIC_API_KEY" > .env.local
RUN npm run build

FROM ${REGISTRY_PREFIX}node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "run", "start"]
