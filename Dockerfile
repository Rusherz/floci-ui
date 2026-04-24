FROM node:24-alpine

WORKDIR /app

COPY index.html ./
COPY server.js ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=4173

EXPOSE 4173

CMD ["node", "server.js"]
