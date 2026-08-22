from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.schemas import (
    CandidateProfile,
    FilterOptionsResponse,
    SearchRequest,
    SearchResponse,
    AdvancedEligibilityRequest,
    AdvancedEligibilityResponse,
    AdvancedRetrieveRequest,
    AdvancedRetrieveResponse,
    AdvancedScoreRequest,
    AdvancedScoreResponse,
)
from app.services.search_engine import AriadneSearchEngine


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.engine = await asyncio.to_thread(AriadneSearchEngine)
    yield
    app.state.engine = None


app = FastAPI(
    title="ARIADNE Candidate Matching API",
    version="1.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/filter-options", response_model=FilterOptionsResponse)
async def filter_options(request: Request):
    engine: AriadneSearchEngine = request.app.state.engine
    return await run_in_threadpool(engine.get_filter_options)


@app.post("/api/search", response_model=SearchResponse)
async def search(payload: SearchRequest, request: Request):
    engine: AriadneSearchEngine = request.app.state.engine
    filters = payload.filters.model_dump(exclude_none=True) if payload.filters else None
    try:
        return await run_in_threadpool(engine.search, payload.query, filters)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/advanced/eligibility", response_model=AdvancedEligibilityResponse)
async def advanced_eligibility(payload: AdvancedEligibilityRequest, request: Request):
    engine: AriadneSearchEngine = request.app.state.engine
    try:
        return await run_in_threadpool(
            engine.advanced_eligibility,
            payload.eligibility.model_dump(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/advanced/retrieve", response_model=AdvancedRetrieveResponse)
async def advanced_retrieve(payload: AdvancedRetrieveRequest, request: Request):
    engine: AriadneSearchEngine = request.app.state.engine
    try:
        return await run_in_threadpool(
            engine.advanced_retrieve,
            payload.eligibility.model_dump(),
            payload.target_role,
            [criterion.model_dump() for criterion in payload.criteria],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/advanced/score", response_model=AdvancedScoreResponse)
async def advanced_score(payload: AdvancedScoreRequest, request: Request):
    engine: AriadneSearchEngine = request.app.state.engine
    try:
        return await run_in_threadpool(
            engine.advanced_score,
            payload.target_role,
            [criterion.model_dump() for criterion in payload.criteria],
            [candidate.model_dump() for candidate in payload.candidates],
            payload.shortlist_threshold,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/candidates/{candidate_id}", response_model=CandidateProfile)
async def candidate_profile(candidate_id: str, request: Request):
    engine: AriadneSearchEngine = request.app.state.engine
    try:
        return await run_in_threadpool(engine.get_candidate, candidate_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Candidate not found") from exc
