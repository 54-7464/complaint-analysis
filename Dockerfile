# Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Final image
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /frontend/dist ./frontend-dist

RUN mkdir -p uploads data

EXPOSE 8000

ENV SECRET_KEY=change-me-in-production

CMD sh -c 'if [ "$SECRET_KEY" = "change-me-in-production" ]; then export SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))"); fi; uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}'
