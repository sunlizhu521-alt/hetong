from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, status

from .config import settings


def utc_iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, UTC).isoformat()


@dataclass
class Session:
    id: str
    path: Path
    meta: dict

    @property
    def expires_at(self) -> float:
        return float(self.meta["expires_at"])


class SessionStore:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or settings.data_dir
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)

    def create(self) -> tuple[Session, str]:
        session_id = str(uuid.uuid4())
        token = secrets.token_urlsafe(32)
        now = time.time()
        path = self.root / session_id
        path.mkdir(mode=0o700)
        for name in ("original", "work", "result", "preview"):
            (path / name).mkdir(mode=0o700)
        meta = {
            "id": session_id,
            "created_at": now,
            "expires_at": now + settings.session_ttl_seconds,
            "token_hash": hashlib.sha256(token.encode()).hexdigest(),
            "files": {},
        }
        self._write_json(path / "meta.json", meta)
        return Session(session_id, path, meta), token

    def get(self, session_id: str, token: str, *, allow_expired: bool = False) -> Session:
        try:
            normalized = str(uuid.UUID(session_id))
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="任务不存在") from exc
        path = self.root / normalized
        meta_path = path / "meta.json"
        if not meta_path.is_file():
            raise HTTPException(status_code=404, detail="任务不存在")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        expected = str(meta.get("token_hash", ""))
        actual = hashlib.sha256(token.encode()).hexdigest()
        if not token or not secrets.compare_digest(expected, actual):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="任务访问令牌无效")
        if not allow_expired and float(meta["expires_at"]) <= time.time():
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="任务文件已过期")
        return Session(normalized, path, meta)

    def save_upload(
        self,
        session: Session,
        kind: str,
        extension: str,
        source: BinaryIO,
        max_bytes: int,
        original_name: str,
    ) -> dict:
        destination = session.path / "original" / f"{kind}{extension}"
        temporary = session.path / "work" / f".{kind}.upload"
        sha = hashlib.sha256()
        size = 0
        with temporary.open("wb") as handle:
            while chunk := source.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    handle.close()
                    temporary.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"{kind}文件超过大小限制")
                sha.update(chunk)
                handle.write(chunk)
        os.chmod(temporary, 0o600)
        temporary.replace(destination)
        record = {
            "path": str(destination.relative_to(session.path)),
            "original_name": Path(original_name).name,
            "sha256": sha.hexdigest(),
            "size": size,
            "extension": extension,
        }
        session.meta.setdefault("files", {})[kind] = record
        self._write_json(session.path / "meta.json", session.meta)
        return record

    def update_meta(self, session: Session, **values: object) -> None:
        session.meta.update(values)
        self._write_json(session.path / "meta.json", session.meta)

    def write_job(self, session: Session, job: dict) -> None:
        self._write_json(session.path / "job.json", job)

    def read_job(self, session: Session) -> dict | None:
        path = session.path / "job.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None

    def cleanup_expired(self, now: float | None = None) -> int:
        current = now or time.time()
        removed = 0
        for child in self.root.iterdir():
            if not child.is_dir():
                continue
            try:
                meta = json.loads((child / "meta.json").read_text(encoding="utf-8"))
                expired = float(meta["expires_at"]) <= current
            except (OSError, ValueError, KeyError, json.JSONDecodeError):
                expired = child.stat().st_mtime < current - settings.session_ttl_seconds * 2
            if expired:
                shutil.rmtree(child, ignore_errors=True)
                removed += 1
        return removed

    @staticmethod
    def _write_json(path: Path, value: dict) -> None:
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        os.chmod(temporary, 0o600)
        temporary.replace(path)


store = SessionStore()
