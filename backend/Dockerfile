FROM node:20-alpine

WORKDIR /backend

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

ENTRYPOINT ["node", "server.js"]

CMD ["node", "server.js"]
# Use environment variables for production settings
# e.g., CMD ["sh", "-c", "NODE_ENV=production node server.js"]