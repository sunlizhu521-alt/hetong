from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from .config import settings
from .models import MappingItem, MappingMode, MappingRequest, ValidationResult
from .parsers import display_value


def validate_mapping(
    request: MappingRequest,
    headers: list[str],
    rows: list[dict[str, Any]],
    template: dict,
) -> ValidationResult:
    errors = list(template.get("blocking_errors", []))
    warnings = list(template.get("warnings", []))
    conflicts: dict[str, list[str]] = {}
    target_ids = {target["id"] for target in template.get("targets", [])}
    seen_targets: set[str] = set()
    if not request.items:
        errors.append("至少需要配置一个字段映射。")
    for item in request.items:
        if item.target_id not in target_ids:
            errors.append(f"模板目标不存在：{item.target_id}")
        if item.target_id in seen_targets:
            errors.append(f"同一模板位置不能重复映射：{item.target_id}")
        seen_targets.add(item.target_id)
        if item.mode == MappingMode.manual:
            if item.manual_value is None:
                errors.append(f"手工值不能为空：{item.target_id}")
            continue
        if not item.source_column or item.source_column not in headers:
            errors.append(f"订单字段不存在：{item.source_column or '未选择'}")
            continue
        values = unique_values(rows, item.source_column)
        if item.mode == MappingMode.first_non_empty and len(values) > 1:
            conflicts[item.target_id] = values[:20]
            errors.append(f"“{item.source_column}”存在多个不同值，请选择合并、指定值或求和。")
        if item.mode == MappingMode.selected_value:
            if item.selected_value is None or item.selected_value not in values:
                errors.append(f"“{item.source_column}”必须指定一个存在的值。")
        if item.mode == MappingMode.sum:
            try:
                for row in rows:
                    value = row.get(item.source_column)
                    if value not in (None, ""):
                        Decimal(str(value).replace(",", ""))
            except InvalidOperation:
                errors.append(f"“{item.source_column}”包含非数字内容，不能求和。")
    detail_items = [item for item in request.items if item.mode == MappingMode.detail]
    if detail_items and len(rows) > settings.max_detail_rows:
        errors.append(f"明细共 {len(rows)} 行，超过单份合同 {settings.max_detail_rows} 行限制。")
    return ValidationResult(
        valid=not errors,
        errors=_dedupe(errors),
        warnings=_dedupe(warnings),
        conflicts=conflicts,
    )


def resolve_scalar(item: MappingItem, rows: list[dict[str, Any]]) -> str:
    if item.mode == MappingMode.manual:
        return item.manual_value or ""
    if not item.source_column:
        return ""
    values = unique_values(rows, item.source_column)
    if item.mode == MappingMode.first_non_empty:
        return values[0] if values else ""
    if item.mode == MappingMode.selected_value:
        return item.selected_value or ""
    if item.mode == MappingMode.join_unique:
        return "、".join(values)
    if item.mode == MappingMode.sum:
        total = sum(
            (
                Decimal(str(row.get(item.source_column)).replace(",", ""))
                for row in rows
                if row.get(item.source_column) not in (None, "")
            ),
            Decimal("0"),
        )
        return (
            format(total, "f").rstrip("0").rstrip(".")
            if "." in format(total, "f")
            else format(total, "f")
        )
    return ""


def unique_values(rows: list[dict[str, Any]], column: str) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for row in rows:
        value = display_value(row.get(column)).strip()
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))
