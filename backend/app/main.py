from fastapi import FastAPI

from app.api.routes.remove_background import router as remove_background_router

app = FastAPI(title="vitrin-ai backend")
app.include_router(remove_background_router)
