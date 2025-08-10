# backend/Dockerfile
FROM node:18-alpine

WORKDIR /backend

COPY . .
RUN apk add --no-cache git
RUN npm install -g npm@latest
RUN npm install -g nodemon@latest
RUN npm install -g pm2@latest

COPY package*.json ./

RUN npm install

COPY . .

CMD ["node", "server.js"]
EXPOSE 3000