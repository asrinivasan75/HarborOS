"""HarborOS — Maritime Awareness Platform API."""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.api.routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()

    # Auto-start live ingestion if API key is available
    api_key = os.environ.get("AISSTREAM_API_KEY", "")
    if api_key:
        from app.services.ingestion_service import create_ingestion_service
        service = create_ingestion_service(api_key=api_key)
        await service.start()
        logging.getLogger("harboros").info("Live AIS ingestion started")
    else:
        logging.getLogger("harboros").info(
            "No AISSTREAM_API_KEY set — running with seeded data only. "
            "Set the env var and use POST /api/ingestion/start to enable live data."
        )

    yield

    # Shutdown
    if api_key:
        from app.services.ingestion_service import get_ingestion_service
        service = get_ingestion_service()
        await service.stop()


app = FastAPI(
    title="HarborOS",
    description="Maritime awareness and operator decision-support platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/")
def root():
    return {
        "name": "HarborOS",
        "version": "0.1.0",
        "status": "operational",
        "description": "Maritime awareness and operator decision-support platform",
    }
