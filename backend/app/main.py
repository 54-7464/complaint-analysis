import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import engine, Base
from .routes import auth, projects, upload, labeling, analysis, report

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="卫生投诉分析平台", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(upload.router)
app.include_router(labeling.router)
app.include_router(analysis.router)
app.include_router(report.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve uploaded files
uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(uploads_dir, exist_ok=True)


# In production, frontend static files are served here
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend-dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
