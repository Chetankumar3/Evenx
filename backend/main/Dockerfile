FROM node:20-slim
WORKDIR /app

# Self-contained -- this folder is the whole build context, no shared_folder.
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "src/index.js"]
