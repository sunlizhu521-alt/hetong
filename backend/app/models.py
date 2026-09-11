from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class MappingMode(StrEnum):
    first_non_empty = "first_non_empty"
    selected_value = "selected_value"
    join_unique = "join_unique"
    sum = "sum"
    manual = "manual"
    detail = "detail"


class MappingItem(BaseModel):
    target_id: str = Field(min_length=1, max_length=300)
    source_column: str | None = Field(default=None, max_length=300)
    mode: MappingMode = MappingMode.first_non_empty
    manual_value: str | None = Field(default=None, max_length=10000)
    selected_value: str | None = Field(default=None, max_length=10000)

    @field_validator("target_id")
    @classmethod
    def target_is_structured(cls, value: str) -> str:
        if not value.startswith(("p:", "t:", "c:")):
            raise ValueError("目标位置无效")
        return value


class InspectRequest(BaseModel):
    order_sheet: str | None = None
    template_sheet: str | None = None


class MappingRequest(BaseModel):
    order_sheet: str
    template_sheet: str | None = None
    items: list[MappingItem] = Field(default_factory=list, max_length=5000)


class GenerateRequest(MappingRequest):
    output_name: str = Field(min_length=1, max_length=100)
    warnings_confirmed: bool = False


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    conflicts: dict[str, list[str]] = Field(default_factory=dict)


class SessionResponse(BaseModel):
    id: str
    token: str
    expires_at: str


class UploadResponse(BaseModel):
    filename: str
    sha256: str
    size: int
    extension: str


class JobResponse(BaseModel):
    id: str
    status: Literal["queued", "running", "completed", "failed"]
    message: str | None = None
    files: dict[str, str] = Field(default_factory=dict)
    preview_pages: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


JsonDict = dict[str, Any]
