FROM node:18-alpine

WORKDIR /backend

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]
EXPOSE 10000