from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import APP_NAME
from app.api.router import api_router
from app.auth.auth_routes import router as auth_router
from app.admin.admin_routes import router as admin_router
from app.services.aws_ses import validate_aws_credentials
from app.database import connect_to_mongo, close_mongo_connection
import os

app = FastAPI(title=APP_NAME, version="1.0")

# ---------------------------------------------------------------------------
# CORS — allow both local dev and production Vercel frontend
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
]
vercel_url = os.getenv("FRONTEND_URL")
if vercel_url:
    ALLOWED_ORIGINS.append(vercel_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(api_router, prefix="/api")

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    await connect_to_mongo()
    validate_aws_credentials()


@app.on_event("shutdown")
async def shutdown_event():
    await close_mongo_connection()


@app.get("/")
def read_root():
    return {
        "status": "running",
        "message": "Kiirus Automation Backend Active",
    }
