# Backend-only Dockerfile

FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY backend ./backend

EXPOSE 3001

CMD ["node", "backend/server.js"]