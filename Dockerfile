FROM node:20-alpine

RUN apk add --no-cache libc6-compat vips-dev python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]
