from app.mapping import validate_mapping
from app.models import MappingItem, MappingMode, MappingRequest


def template(target_id: str = "p:0") -> dict:
    return {"targets": [{"id": target_id}], "warnings": [], "blocking_errors": []}


def test_conflicting_scalar_requires_explicit_rule():
    request = MappingRequest(
        order_sheet="订单",
        items=[
            MappingItem(target_id="p:0", source_column="供应商", mode=MappingMode.first_non_empty)
        ],
    )
    result = validate_mapping(request, ["供应商"], [{"供应商": "甲"}, {"供应商": "乙"}], template())
    assert not result.valid
    assert result.conflicts["p:0"] == ["甲", "乙"]


def test_join_unique_resolves_conflict():
    request = MappingRequest(
        order_sheet="订单",
        items=[MappingItem(target_id="p:0", source_column="供应商", mode=MappingMode.join_unique)],
    )
    result = validate_mapping(request, ["供应商"], [{"供应商": "甲"}, {"供应商": "乙"}], template())
    assert result.valid
    assert not result.conflicts


def test_sum_rejects_non_numeric_values():
    request = MappingRequest(
        order_sheet="订单",
        items=[MappingItem(target_id="p:0", source_column="数量", mode=MappingMode.sum)],
    )
    result = validate_mapping(request, ["数量"], [{"数量": 2}, {"数量": "无"}], template())
    assert not result.valid
    assert "不能求和" in result.errors[0]
