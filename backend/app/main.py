from dotenv import load_dotenv
import os
load_dotenv()  # must be first — loads .env before any module reads os.getenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import APP_NAME
from app.api.router import api_router
from app.auth.auth_routes import router as auth_router
from app.admin.admin_routes import router as admin_router
from app.services.aws_ses import validate_aws_credentials
from app.database import connect_to_mongo, close_mongo_connection

app = FastAPI(title=APP_NAME, version="1.0")

# ---------------------------------------------------------------------------
# CORS — env-driven, Render-compatible
#
# Priority:
#   1. CORS_ORIGINS env var (comma-separated list of specific origins)
#      → allows credentials (safe for named domains)
#   2. FRONTEND_URL env var (single Vercel / Render deploy URL)
#      → merged with localhost defaults, allows credentials
#   3. Neither set → open wildcard, credentials disabled
#      (JWT Bearer-header auth still works; only cookie-based auth would break)
# ---------------------------------------------------------------------------
_base_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
]

_cors_origins_env = os.getenv("CORS_ORIGINS", "")
_frontend_url = os.getenv("FRONTEND_URL", "")

if _cors_origins_env:
    # Explicit list wins everything
    ALLOWED_ORIGINS = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    _allow_credentials = True
elif _frontend_url:
    # Append production URL to localhost defaults
    ALLOWED_ORIGINS = _base_origins + [_frontend_url.rstrip("/")]
    _allow_credentials = True
else:
    # No specific origin configured — open for initial deployment
    ALLOWED_ORIGINS = ["*"]
    _allow_credentials = False  # required by CORS spec when allow_origins=["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=_allow_credentials,
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
    # Ensure local storage directories exist (Render filesystem is ephemeral)
    for _dir in [
        os.path.join("app", "storage", "batches"),
        os.path.join("app", "storage", "tmp"),
        os.path.join("app", "storage", "logs"),
        os.path.join("app", "storage", "master_files"),
    ]:
        os.makedirs(_dir, exist_ok=True)

    await connect_to_mongo()
    validate_aws_credentials()


@app.on_event("shutdown")
async def shutdown_event():
    await close_mongo_connection()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/")
def read_root():
    return {
        "status": "running",
        "message": "Kiirus Automation Backend Active",
    }
