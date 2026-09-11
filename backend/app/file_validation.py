from __future__ import annotations

import zipfile
from pathlib import Path
from xml.etree import ElementTree

from fastapi import HTTPException

from .config import settings

OOXML_SIGNATURE = b"PK\x03\x04"
OLE_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")


def validate_extension(filename: str, kind: str) -> str:
    extension = Path(filename).suffix.lower()
    allowed = {".xlsx", ".xls"} if kind == "order" else {".docx", ".xlsx", ".xls"}
    if extension in {".docm", ".xlsm", ".xlam", ".exe", ".com", ".bat"}:
        raise HTTPException(status_code=415, detail="不支持宏或可执行文件")
    if extension not in allowed:
        supported = "、".join(sorted(allowed))
        raise HTTPException(status_code=415, detail=f"文件格式不支持，请上传 {supported}")
    return extension


def validate_file(path: Path, extension: str) -> None:
    with path.open("rb") as handle:
        signature = handle.read(8)
    if extension == ".xls":
        if signature != OLE_SIGNATURE:
            raise HTTPException(status_code=415, detail="文件内容不是有效的 XLS 文件")
        return
    if not signature.startswith(OOXML_SIGNATURE):
        if signature == OLE_SIGNATURE:
            raise HTTPException(status_code=415, detail="文件可能已加密或扩展名不正确")
        raise HTTPException(status_code=415, detail="文件内容不是有效的 Office 文件")
    try:
        with zipfile.ZipFile(path) as archive:
            total_size = 0
            for entry in archive.infolist():
                parts = Path(entry.filename).parts
                if entry.filename.startswith("/") or ".." in parts:
                    raise HTTPException(status_code=415, detail="Office 文件包含不安全路径")
                total_size += entry.file_size
                if total_size > settings.max_unpacked_bytes:
                    raise HTTPException(status_code=413, detail="Office 文件展开后超过安全限制")
            names = set(archive.namelist())
            required = "word/document.xml" if extension == ".docx" else "xl/workbook.xml"
            if required not in names:
                raise HTTPException(status_code=415, detail="Office 文件结构不完整")
            if any(name.endswith("vbaProject.bin") for name in names):
                raise HTTPException(status_code=415, detail="不支持包含宏的 Office 文件")
            for name in names:
                if not name.endswith(".rels"):
                    continue
                try:
                    relationships = ElementTree.fromstring(archive.read(name))
                except ElementTree.ParseError as exc:
                    raise HTTPException(status_code=415, detail="Office 关系文件已损坏") from exc
                if any(
                    relation.attrib.get("TargetMode", "").lower() == "external"
                    for relation in relationships
                ):
                    raise HTTPException(
                        status_code=415,
                        detail="Office 文件包含外部链接，请先移除后再上传",
                    )
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=415, detail="Office 文件已损坏") from exc
