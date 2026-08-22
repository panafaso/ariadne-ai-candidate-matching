@echo off
setlocal
cd /d "%~dp0backend"

rem Use the enriched candidate dataset bundled with this ARIADNE package.
set "ARIADNE_DATASET_PATH=%~dp0data\ARIADNE_candidate_profiles_20k_enriched.parquet"

rem Quick Search: use the NVIDIA GPU for Jina embedding + reranking.
set "ARIADNE_JINA_DEVICE=cuda"
set "ARIADNE_JINA_RERANKER_DEVICE=cuda"

rem Advanced Match: lighter quantized Ollama model for the local demo.
set "ARIADNE_OLLAMA_MODEL=ministral-3:3b"
set "ARIADNE_OLLAMA_NUM_CTX=4096"
set "ARIADNE_OLLAMA_NUM_PREDICT=1200"

if exist "C:\hermesenv\Scripts\python.exe" (
  set "PY=C:\hermesenv\Scripts\python.exe"
) else (
  set "PY=python"
)

echo ==============================================
echo ARIADNE backend
echo Python: %PY%
echo URL: http://127.0.0.1:8000
echo ==============================================
"%PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
