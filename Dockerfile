# ========== 第一阶段：构建前端 ==========
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm install --registry=https://registry.npmmirror.com
COPY frontend/ ./
RUN npm run build

# ========== 第二阶段：构建后端 ==========
FROM node:20-bookworm-slim

WORKDIR /app

# 设置国内镜像
ENV PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/

# 安装系统依赖（Playwright 需要）
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# 复制后端依赖文件
COPY backend/package*.json ./

# 安装后端依赖（使用淘宝镜像）
RUN npm install --omit=dev --registry=https://registry.npmmirror.com

# 安装 Playwright 浏览器（使用国内镜像）
RUN npx playwright install chromium

# 备份node_modules
RUN mv node_modules /tmp/node_modules_backup

# 复制后端源码
COPY backend/ ./

# 恢复node_modules
RUN rm -rf node_modules && mv /tmp/node_modules_backup node_modules

# 从第一阶段复制前端构建产物
COPY --from=frontend-builder /frontend/dist ./public/app

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
