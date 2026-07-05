FROM node:22-alpine

WORKDIR /app

# 先装依赖，利用镜像层缓存
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3210 HOST=0.0.0.0
EXPOSE 3210

CMD ["node", "server.js"]
