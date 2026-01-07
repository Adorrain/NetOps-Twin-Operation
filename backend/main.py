import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import topology, ops
from app.database import engine, Base
from app.models import db_models

# Initialize Database Tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="NetOps API", description="Network Operations & Simulation Platform Backend API")

# CORS Configuration
origins = [
    "http://localhost:3000",
    "http://localhost:5173", # Vite default
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(topology.router, prefix="/api", tags=["Topology Management"])
app.include_router(ops.router, prefix="/api/ops", tags=["Network Operations"])

# TODO: Implement network and ops routers as needed
# from app.routers import network, ops
# app.include_router(network.router, prefix="/api/network", tags=["Network Device Management"])
# app.include_router(ops.router, prefix="/api/ops", tags=["Operations"])

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
