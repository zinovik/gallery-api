FROM node:22-slim as builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY src ./src
COPY tsconfig.json ./
RUN npm run build

RUN npm prune --omit=dev

###

FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# For source maps
COPY --from=builder /app/src ./src

EXPOSE 8080

CMD ["npm", "start"]
