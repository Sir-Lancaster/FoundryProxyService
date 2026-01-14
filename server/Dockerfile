FROM node:20-alpine

WORKDIR /app

# Copy shared folder first
COPY shared ./shared

# Copy server files
COPY server/package*.json ./
RUN npm install --production

COPY server .

EXPOSE 3000

CMD ["node", "index.js"]