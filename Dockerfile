FROM node:22 as builder

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm install

COPY src ./src
COPY tsconfig.json ./
RUN npm run build

RUN npm prune --production

FROM node:22

WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/dist ./dist
# For source maps
COPY --from=builder /app/src ./src

CMD ["npm", "start"]
