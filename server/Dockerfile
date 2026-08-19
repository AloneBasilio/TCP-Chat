# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY certs ./certs

# Generate a self-signed certificate at build time if one isn't already provided,
# so TLS=true works out of the box for local/demo use.
RUN [ -f ./certs/server.crt ] && [ -f ./certs/server.key ] || \
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout ./certs/server.key -out ./certs/server.crt -days 365 \
      -subj "/C=MZ/ST=Maputo/L=Maputo/O=TCPChat/CN=localhost"

ENV NODE_ENV=production

EXPOSE 3000 8080

CMD ["node", "dist/index.js"]
