FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm cache clean --force
COPY pipelines/wiki-stream ./pipelines/wiki-stream
COPY lib/wiki-stream ./lib/wiki-stream
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--import", "tsx", "pipelines/wiki-stream/scripts/worker.mts"]
