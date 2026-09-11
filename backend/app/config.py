from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path(os.getenv("HETONG_DATA_DIR", "/tmp/hetong-data"))
    session_ttl_seconds: int = int(os.getenv("HETONG_SESSION_TTL_SECONDS", "1800"))
    order_max_bytes: int = int(os.getenv("HETONG_ORDER_MAX_BYTES", str(20 * 1024 * 1024)))
    template_max_bytes: int = int(os.getenv("HETONG_TEMPLATE_MAX_BYTES", str(30 * 1024 * 1024)))
    max_unpacked_bytes: int = int(os.getenv("HETONG_MAX_UNPACKED_BYTES", str(200 * 1024 * 1024)))
    max_source_rows: int = int(os.getenv("HETONG_MAX_SOURCE_ROWS", "20000"))
    max_detail_rows: int = int(os.getenv("HETONG_MAX_DETAIL_ROWS", "1000"))
    job_timeout_seconds: int = int(os.getenv("HETONG_JOB_TIMEOUT_SECONDS", "300"))
    create_limit_per_hour: int = int(os.getenv("HETONG_CREATE_LIMIT_PER_HOUR", "10"))
    queue_size: int = int(os.getenv("HETONG_QUEUE_SIZE", "3"))
    libreoffice_binary: str = os.getenv("HETONG_LIBREOFFICE", "libreoffice")
    pdftoppm_binary: str = os.getenv("HETONG_PDFTOPPM", "pdftoppm")


settings = Settings()
