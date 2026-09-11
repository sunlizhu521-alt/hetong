from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from .config import settings


class OfficeConversionError(RuntimeError):
    pass


def binary_status() -> dict[str, bool]:
    return {
        "libreoffice": shutil.which(settings.libreoffice_binary) is not None,
        "pdftoppm": shutil.which(settings.pdftoppm_binary) is not None,
    }


def convert_xls_to_xlsx(source: Path, output_dir: Path) -> Path:
    return _libreoffice_convert(source, output_dir, "xlsx")


def convert_to_pdf(source: Path, output_dir: Path) -> Path:
    return _libreoffice_convert(source, output_dir, "pdf")


def _libreoffice_convert(source: Path, output_dir: Path, output_format: str) -> Path:
    binary = shutil.which(settings.libreoffice_binary)
    if not binary:
        raise OfficeConversionError("服务器未安装 LibreOffice")
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="lo-profile-", dir=source.parent) as profile:
        profile_uri = Path(profile).resolve().as_uri()
        command = [
            binary,
            f"-env:UserInstallation={profile_uri}",
            "--headless",
            "--nologo",
            "--nodefault",
            "--norestore",
            "--nolockcheck",
            "--convert-to",
            output_format,
            "--outdir",
            str(output_dir),
            str(source),
        ]
        environment = os.environ.copy()
        environment["HOME"] = str(source.parent)
        try:
            result = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=settings.job_timeout_seconds,
                env=environment,
            )
        except subprocess.TimeoutExpired as exc:
            raise OfficeConversionError("Office 转换超过5分钟，任务已停止") from exc
    expected = output_dir / f"{source.stem}.{output_format}"
    if result.returncode != 0 or not expected.is_file() or expected.stat().st_size == 0:
        message = (result.stderr or result.stdout or "未知错误").strip()[-1000:]
        raise OfficeConversionError(f"Office 转换失败：{message}")
    return expected


def render_pdf_pages(pdf: Path, output_dir: Path) -> list[Path]:
    binary = shutil.which(settings.pdftoppm_binary)
    if not binary:
        raise OfficeConversionError("服务器未安装 Poppler 预览组件")
    output_dir.mkdir(parents=True, exist_ok=True)
    prefix = output_dir / "page"
    try:
        result = subprocess.run(
            [binary, "-png", "-r", "120", str(pdf), str(prefix)],
            check=False,
            capture_output=True,
            text=True,
            timeout=settings.job_timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise OfficeConversionError("PDF 页面预览生成超时") from exc
    pages = sorted(output_dir.glob("page-*.png"))
    if result.returncode != 0 or not pages:
        message = (result.stderr or result.stdout or "未知错误").strip()[-1000:]
        raise OfficeConversionError(f"PDF 页面预览失败：{message}")
    return pages
