# ── Deps stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Builder stage ─────────────────────────────────────────────────────────────
# Service URLs must be baked at build time — Next.js rewrites() destinations
# are compiled into the routing manifest during `next build`, not re-read at
# `next start`. Pass them as build args so the correct Docker service-name
# hostnames are embedded in the image.
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXTAUTH_SECRET=build-placeholder

# Service URL build args — docker-compose passes these via build.args
ARG IDENTITY_SERVICE_URL=http://identity-service:3001
ARG MARKETPLACE_SERVICE_URL=http://marketplace-service:3002
ARG CHECKLIST_SERVICE_URL=http://checklist-service:3003
ARG LICENSE_SERVICE_URL=http://license-service:3004
ARG MATCHING_SERVICE_URL=http://matching-service:3005
ARG COMPLIANCE_SERVICE_URL=http://compliance-service:3006
ARG TELEMETRY_SERVICE_URL=http://telemetry-service:3007
ARG ANALYTICS_SERVICE_URL=http://analytics-service:3008
ARG REPUTATION_SERVICE_URL=http://reputation-service:3009
ARG PAYOUT_SERVICE_URL=http://payout-service:3010
ARG COMMUNITY_SERVICE_URL=http://community-service:3011
ARG NOTIFICATION_SERVICE_URL=http://notification-service:3012

# Promote ARGs to ENVs so next.config.ts can read process.env at build time
ENV IDENTITY_SERVICE_URL=$IDENTITY_SERVICE_URL
ENV MARKETPLACE_SERVICE_URL=$MARKETPLACE_SERVICE_URL
ENV CHECKLIST_SERVICE_URL=$CHECKLIST_SERVICE_URL
ENV LICENSE_SERVICE_URL=$LICENSE_SERVICE_URL
ENV MATCHING_SERVICE_URL=$MATCHING_SERVICE_URL
ENV COMPLIANCE_SERVICE_URL=$COMPLIANCE_SERVICE_URL
ENV TELEMETRY_SERVICE_URL=$TELEMETRY_SERVICE_URL
ENV ANALYTICS_SERVICE_URL=$ANALYTICS_SERVICE_URL
ENV REPUTATION_SERVICE_URL=$REPUTATION_SERVICE_URL
ENV PAYOUT_SERVICE_URL=$PAYOUT_SERVICE_URL
ENV COMMUNITY_SERVICE_URL=$COMMUNITY_SERVICE_URL
ENV NOTIFICATION_SERVICE_URL=$NOTIFICATION_SERVICE_URL

RUN npm run build

# ── Runner stage ──────────────────────────────────────────────────────────────
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

CMD ["npm", "start"]
