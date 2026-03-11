# ── Deps stage ────────────────────────────────────────────────────────────────
# Install production + dev deps in a throw-away layer.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Builder stage ─────────────────────────────────────────────────────────────
# Build the Next.js app.  Auth env vars are not needed at build time;
# NEXTAUTH_SECRET is required by Auth.js even during `next build`.
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Provide a dummy secret so `next build` doesn't fail the auth import.
# The real secret is injected at runtime via docker-compose environment.
ENV NEXTAUTH_SECRET=build-placeholder
RUN npm run build

# ── Runner stage ──────────────────────────────────────────────────────────────
# Minimal runtime image — copies only the built artefacts.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public           ./public
COPY --from=builder /app/.next            ./.next
COPY --from=builder /app/node_modules     ./node_modules
COPY --from=builder /app/package.json     ./

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# `next start` re-evaluates next.config.ts on startup so service URLs
# injected via docker-compose environment are picked up correctly.
CMD ["npm", "start"]
