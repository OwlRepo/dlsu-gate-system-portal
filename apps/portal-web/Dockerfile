# syntax=docker/dockerfile:1

FROM node:20 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm install

# Build the application
FROM deps AS build
COPY . .
# Build with access to dev dependencies
# RUN npm ci
RUN npm install
RUN npm run build

# Production image
FROM base AS final
WORKDIR /app
# ENV NODE_ENV production
ENV NODE_ENV=production
USER node

COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["npm", "start"]