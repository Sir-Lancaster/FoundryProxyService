FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
COPY ../shared ./shared

EXPOSE 3000 8443

CMD ["node", "index.js"]