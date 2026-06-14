# 部署指南 — Railway / Render

## 步骤 1：推到 GitHub

```bash
# 在项目目录下初始化 Git
git init
git add .
git commit -m "初版"
```

在 GitHub 上创建一个仓库，然后：

```bash
git remote add origin https://github.com/你的用户名/你的仓库.git
git branch -M main
git push -u origin main
```

---

## 步骤 2：选一个平台部署

### Railway（推荐，简单）

1. 打开 [railway.app](https://railway.app)，用 GitHub 账号注册
2. 点 **New Project** → **Deploy from GitHub repo**
3. 选择刚才推送的仓库
4. Railway 自动检测到 Dockerfile，开始构建（约 3-5 分钟）
5. 构建完成后，点 **Variables** 添加环境变量：

```
SECRET_KEY = 随便输入一串随机字符，比如 aB3xZ9qW7rT1yU8pL5kN2mV6
```

6. 点顶部的域名 → **Generate Domain**，获得类似 `xxx.up.railway.app` 的公网地址
7. 把地址发出去，别人就能用了

> **注意**：Railway 免费额度每月 $5，够轻度使用。SQLite 数据存放在 Docker 容器内，每次重新部署会丢失数据。正式使用建议加 Redis 或 PostgreSQL（Railway 免费送 PostgreSQL）。

### Render（备选）

1. 打开 [render.com](https://render.com)，用 GitHub 注册
2. 点 **New** → **Web Service** → 连接仓库
3. 配置：
   - Name：随便填
   - Runtime：**Docker**
   - 点 **Create Web Service**
4. 构建完成后在 **Environment** 里添加 `SECRET_KEY`
5. Render 自动分配 `xxx.onrender.com` 域名

> Render 免费版首次访问有 30-50 秒冷启动延迟，之后正常。

---

## 步骤 3：使用

1. 打开 `https://你的域名.com`
2. 注册账号
3. 右上角点 **AI 设置**，填你自己的 API Key（每个用户用各自的 Key）
4. 创建项目 → 上传数据 → 开始使用

---


---

## 数据持久化（重要！）

**默认情况下，每次 Railway 重新部署都会清空数据库和上传的文件。** 必须挂载 Volume 才能保留数据。

### Railway 配置持久存储

1. 打开 Railway 项目 → 点击你的服务 complaint-analysis
2. 顶部标签栏点 **Settings** → 左侧点 **Volumes**
3. 点 **Add Volume**
4. 配置：
   - **Mount Path**：/app/data
   - **Volume Name**：db-data
5. 再添加一个 Volume：
   - **Mount Path**：/app/uploads
   - **Volume Name**：upload-data
6. 点击 **Deploy** 重新部署

之后无论怎么更新代码，数据库和上传文件都会保留。

### Render 配置

在 Render Dashboard → 服务 → **Disks** → 添加：
- Mount Path: /app/data, Size: 1 GB
- Mount Path: /app/uploads, Size: 5 GB

---

## 国内访问问题

Railway 和 Render 服务器在海外，国内访问可能慢。替代方案：

| 平台 | 适用 |
|---|---|
| **Zeabur** (zeabur.app) | 支持 GitHub 一键部署，有亚洲节点 |
| **Sealos** (sealos.io) | 国内可直接访问，有免费额度 |
| **Railway + CloudFlare** | 用 CloudFlare 代理加速 |

---

## 本地测试部署是否正常

```bash
docker build -t complaint-analysis .
docker run -p 8000:8000 complaint-analysis
```

打开 `http://localhost:8000`，如果能打开注册页就说明镜像正确。
