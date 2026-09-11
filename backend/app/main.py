from __future__ import annotations

import asyncio
import os
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Body, FastAPI, Header, HTTPException, Request, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .config import settings
from .file_validation import validate_extension, validate_file
from .generator import generate_contract, sanitize_output_name
from .mapping import validate_mapping
from .models import (
    GenerateRequest,
    InspectRequest,
    JobResponse,
    MappingRequest,
    SessionResponse,
    UploadResponse,
)
from .office import OfficeConversionError, binary_status, convert_xls_to_xlsx
from .parsers import inspect_order, inspect_template, read_order_rows
from .storage import Session, store, utc_iso

API_PREFIX = "/hetong-api"
V1_PREFIX = f"{API_PREFIX}/v1"


class CreateRateLimiter:
    def __init__(self) -> None:
        self.events: dict[str, deque[float]] = defaultdict(deque)
        self.lock = asyncio.Lock()

    async def check(self, address: str) -> None:
        now = time.time()
        async with self.lock:
            queue = self.events[address]
            while queue and queue[0] <= now - 3600:
                queue.popleft()
            if len(queue) >= settings.create_limit_per_hour:
                raise HTTPException(status_code=429, detail="创建任务过于频繁，请稍后再试")
            queue.append(now)


rate_limiter = CreateRateLimiter()
job_queue: asyncio.Queue[tuple[str, str, dict]] = asyncio.Queue(maxsize=settings.queue_size)


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(300)
        await asyncio.to_thread(store.cleanup_expired)


async def job_worker() -> None:
    while True:
        session_id, token, payload = await job_queue.get()
        try:
            session = store.get(session_id, token)
            job = store.read_job(session) or {}
            job.update(status="running", message="正在生成合同")
            store.write_job(session, job)
            request = GenerateRequest.model_validate(payload)
            order_path = _session_file(session, "order")
            template_path = _template_working_path(session, request.template_sheet)
            _, rows = read_order_rows(order_path, request.order_sheet)
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    generate_contract,
                    template_path,
                    request,
                    rows,
                    session.path / "result",
                    session.path / "preview",
                ),
                timeout=settings.job_timeout_seconds + 10,
            )
            job.update(
                status="completed",
                message="合同已生成",
                files=result["files"],
                preview_pages=result["preview_pages"],
                output_name=result["output_name"],
            )
            store.write_job(session, job)
        except Exception as exc:  # Worker must retain an actionable failure state.
            try:
                session = store.get(session_id, token, allow_expired=True)
                job = store.read_job(session) or {"id": payload.get("job_id", "")}
                job.update(status="failed", message=_public_error(exc))
                store.write_job(session, job)
            except Exception:
                pass
        finally:
            job_queue.task_done()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    await asyncio.to_thread(store.cleanup_expired)
    worker = asyncio.create_task(job_worker())
    cleanup = asyncio.create_task(cleanup_loop())
    yield
    for task in (worker, cleanup):
        task.cancel()
    await asyncio.gather(worker, cleanup, return_exceptions=True)


app = FastAPI(
    title="合同生成",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get(f"{API_PREFIX}/health")
def health() -> dict:
    binaries = binary_status()
    return {
        "status": "ok" if all(binaries.values()) else "degraded",
        "version": os.getenv("HETONG_VERSION", "development"),
        "components": binaries,
        "queue": {"waiting": job_queue.qsize(), "capacity": settings.queue_size},
    }


@app.post(f"{V1_PREFIX}/sessions", response_model=SessionResponse)
async def create_session(request: Request) -> SessionResponse:
    address = request.client.host if request.client else "unknown"
    await rate_limiter.check(address)
    session, token = store.create()
    return SessionResponse(id=session.id, token=token, expires_at=utc_iso(session.expires_at))


@app.put(f"{V1_PREFIX}/sessions/{{session_id}}/order", response_model=UploadResponse)
def upload_order(
    session_id: str,
    file: UploadFile,
    token: Annotated[str, Header(alias="X-Session-Token")],
) -> UploadResponse:
    return _save_upload(session_id, token, file, "order")


@app.put(f"{V1_PREFIX}/sessions/{{session_id}}/template", response_model=UploadResponse)
def upload_template(
    session_id: str,
    file: UploadFile,
    token: Annotated[str, Header(alias="X-Session-Token")],
) -> UploadResponse:
    return _save_upload(session_id, token, file, "template")


@app.post(f"{V1_PREFIX}/sessions/{{session_id}}/inspect")
def inspect_files(
    session_id: str,
    payload: Annotated[InspectRequest, Body()],
    token: Annotated[str, Header(alias="X-Session-Token")],
) -> dict:
    session = store.get(session_id, token)
    order_path = _session_file(session, "order")
    template_path = _template_working_path(session, payload.template_sheet)
    order = inspect_order(order_path)
    template = inspect_template(template_path, payload.template_sheet)
    return {"order": order, "template": template, "expires_at": utc_iso(session.expires_at)}


@app.post(f"{V1_PREFIX}/sessions/{{session_id}}/mapping/validate")
def validate_session_mapping(
    session_id: str,
    payload: Annotated[MappingRequest, Body()],
    token: Annotated[str, Header(alias="X-Session-Token")],
):
    session = store.get(session_id, token)
    order_path = _session_file(session, "order")
    template_path = _template_working_path(session, payload.template_sheet)
    headers, rows = read_order_rows(order_path, payload.order_sheet)
    template = inspect_template(template_path, payload.template_sheet)
    return validate_mapping(payload, headers, rows, template)


@app.post(f"{V1_PREFIX}/sessions/{{session_id}}/generate", response_model=JobResponse)
async def generate(
    session_id: str,
    payload: Annotated[GenerateRequest, Body()],
    token: Annotated[str, Header(alias="X-Session-Token")],
) -> JobResponse:
    session = store.get(session_id, token)
    sanitize_output_name(payload.output_name)
    order_path = _session_file(session, "order")
    template_path = _template_working_path(session, payload.template_sheet)
    headers, rows = read_order_rows(order_path, payload.order_sheet)
    template = inspect_template(template_path, payload.template_sheet)
    validation = validate_mapping(payload, headers, rows, template)
    if not validation.valid:
        raise HTTPException(
            status_code=422, detail={"message": "映射验证失败", **validation.model_dump()}
        )
    if validation.warnings and not payload.warnings_confirmed:
        raise HTTPException(
            status_code=422, detail={"message": "请先确认模板风险提示", **validation.model_dump()}
        )
    existing = store.read_job(session)
    if existing and existing.get("status") in {"queued", "running"}:
        raise HTTPException(status_code=409, detail="当前任务正在生成")
    if job_queue.full():
        raise HTTPException(status_code=429, detail="服务器生成队列已满，请稍后再试")
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "session_id": session.id,
        "status": "queued",
        "message": "已进入生成队列",
        "files": {},
        "preview_pages": [],
        "warnings": validation.warnings,
    }
    store.write_job(session, job)
    queued_payload = payload.model_dump(mode="json")
    queued_payload["job_id"] = job_id
    await job_queue.put((session.id, token, queued_payload))
    return _job_response(job)


@app.get(f"{V1_PREFIX}/jobs/{{job_id}}", response_model=JobResponse)
def get_job(job_id: str, token: Annotated[str, Header(alias="X-Session-Token")]) -> JobResponse:
    session, job = _find_job(job_id, token)
    if session.expires_at <= time.time():
        raise HTTPException(status_code=410, detail="任务文件已过期")
    return _job_response(job)


@app.get(f"{V1_PREFIX}/jobs/{{job_id}}/preview")
def get_pdf_preview(job_id: str, token: Annotated[str, Header(alias="X-Session-Token")]):
    session, job = _find_job(job_id, token)
    filename = (job.get("files") or {}).get("pdf")
    if job.get("status") != "completed" or not filename:
        raise HTTPException(status_code=409, detail="PDF 尚未生成")
    path = session.path / "result" / Path(filename).name
    return FileResponse(path, media_type="application/pdf", content_disposition_type="inline")


@app.get(f"{V1_PREFIX}/jobs/{{job_id}}/preview/pages/{{page_name}}")
def get_preview_page(
    job_id: str,
    page_name: str,
    token: Annotated[str, Header(alias="X-Session-Token")],
):
    session, job = _find_job(job_id, token)
    safe_name = Path(page_name).name
    if safe_name not in job.get("preview_pages", []):
        raise HTTPException(status_code=404, detail="预览页不存在")
    return FileResponse(session.path / "preview" / safe_name, media_type="image/png")


@app.get(f"{V1_PREFIX}/jobs/{{job_id}}/download/{{kind}}")
def download_result(
    job_id: str,
    kind: str,
    token: Annotated[str, Header(alias="X-Session-Token")],
):
    session, job = _find_job(job_id, token)
    filename = (job.get("files") or {}).get(kind)
    if job.get("status") != "completed" or not filename:
        raise HTTPException(status_code=404, detail="下载文件不存在")
    media_types = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    if kind not in media_types:
        raise HTTPException(status_code=404, detail="下载格式不存在")
    path = session.path / "result" / Path(filename).name
    return FileResponse(path, media_type=media_types[kind], filename=filename)


def _save_upload(session_id: str, token: str, file: UploadFile, kind: str) -> UploadResponse:
    session = store.get(session_id, token)
    filename = file.filename or ""
    extension = validate_extension(filename, kind)
    max_bytes = settings.order_max_bytes if kind == "order" else settings.template_max_bytes
    record = store.save_upload(session, kind, extension, file.file, max_bytes, filename)
    path = session.path / record["path"]
    try:
        validate_file(path, extension)
    except Exception:
        path.unlink(missing_ok=True)
        session.meta.get("files", {}).pop(kind, None)
        store.update_meta(session, files=session.meta.get("files", {}))
        raise
    return UploadResponse(
        filename=record["original_name"],
        **{key: record[key] for key in ("sha256", "size", "extension")},
    )


def _session_file(session: Session, kind: str) -> Path:
    record = session.meta.get("files", {}).get(kind)
    if not record:
        raise HTTPException(
            status_code=409, detail=f"请先上传{('订单' if kind == 'order' else '合同模板')}"
        )
    path = session.path / record["path"]
    if not path.is_file():
        raise HTTPException(status_code=410, detail="任务文件已过期")
    return path


def _template_working_path(session: Session, selected_sheet: str | None) -> Path:
    source = _session_file(session, "template")
    if source.suffix.lower() != ".xls":
        return source
    converted = session.path / "work" / "converted" / f"{source.stem}.xlsx"
    if not converted.is_file():
        try:
            converted = convert_xls_to_xlsx(source, converted.parent)
        except OfficeConversionError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return converted


def _find_job(job_id: str, token: str) -> tuple[Session, dict]:
    try:
        normalized = str(uuid.UUID(job_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="生成任务不存在") from exc
    for directory in store.root.iterdir():
        job_path = directory / "job.json"
        if not job_path.is_file():
            continue
        session_id = directory.name
        try:
            session = store.get(session_id, token, allow_expired=True)
        except HTTPException:
            continue
        job = store.read_job(session)
        if job and job.get("id") == normalized:
            if session.expires_at <= time.time():
                raise HTTPException(status_code=410, detail="文件已过期")
            return session, job
    raise HTTPException(status_code=404, detail="生成任务不存在")


def _job_response(job: dict) -> JobResponse:
    job_id = job["id"]
    files = {
        kind: f"{V1_PREFIX}/jobs/{job_id}/download/{kind}" for kind in (job.get("files") or {})
    }
    pages = [
        f"{V1_PREFIX}/jobs/{job_id}/preview/pages/{name}" for name in job.get("preview_pages", [])
    ]
    return JobResponse(
        id=job_id,
        status=job.get("status", "failed"),
        message=job.get("message"),
        files=files,
        preview_pages=pages,
        warnings=job.get("warnings", []),
    )


def _public_error(exc: Exception) -> str:
    if isinstance(exc, (ValueError, OfficeConversionError, asyncio.TimeoutError)):
        return str(exc) or "生成任务超时"
    return "生成失败，请检查模板结构或稍后重试"
