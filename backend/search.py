"""Pure search logic and explicit query validation; no Flask dependency."""

from dataclasses import dataclass
from datetime import date
import math
import re
from typing import Mapping


class InvalidQuery(ValueError):
    def __init__(self, fields: dict[str, str]):
        super().__init__("Please correct the search inputs.")
        self.fields = fields


@dataclass(frozen=True)
class SearchFilters:
    min_price: float | None = None
    max_price: float | None = None
    min_bedrooms: int | None = None
    city: str = ""
    keyword: str = ""
    target_budget: float | None = None
    page: int = 1
    page_size: int = 5


def parse_query(query: Mapping[str, str]) -> SearchFilters:
    errors: dict[str, str] = {}

    def number(name: str, *, integer=False, minimum=0, maximum=None,
               default=None, positive=False):
        raw = query.get(name, "").strip()
        if not raw:
            return default
        try:
            if integer and not re.fullmatch(r"[+-]?[0-9]+", raw):
                raise ValueError
            value = int(raw) if integer else float(raw)
            if not math.isfinite(value):
                raise ValueError
        except (ValueError, OverflowError):
            errors[name] = "Enter a finite whole number." if integer else "Enter a finite number."
            return default
        if positive and value <= 0:
            errors[name] = "Must be greater than zero."
        elif value < minimum:
            errors[name] = f"Must be at least {minimum}."
        elif maximum is not None and value > maximum:
            errors[name] = f"Must be at most {maximum}."
        return value

    min_price = number("minPrice")
    max_price = number("maxPrice")
    min_bedrooms = number("minBedrooms", integer=True)
    budget = number("targetBudget", positive=True)
    page = number("page", integer=True, minimum=1, default=1)
    page_size = number("pageSize", integer=True, minimum=1, maximum=100, default=5)
    if min_price is not None and max_price is not None and min_price > max_price:
        errors["maxPrice"] = "Maximum price must be at least the minimum price."
    if errors:
        raise InvalidQuery(errors)
    return SearchFilters(
        min_price=min_price, max_price=max_price, min_bedrooms=min_bedrooms,
        city=query.get("city", "").strip().casefold(),
        keyword=query.get("keyword", "").strip().casefold(),
        target_budget=budget, page=page, page_size=page_size,
    )


def search_listings(listings: list[dict], filters: SearchFilters, today: date) -> dict:
    ranked = []
    for listing in listings:
        if filters.min_price is not None and listing["price"] < filters.min_price:
            continue
        if filters.max_price is not None and listing["price"] > filters.max_price:
            continue
        if filters.min_bedrooms is not None and listing["bedrooms"] < filters.min_bedrooms:
            continue
        if filters.city and listing["city"].strip().casefold() != filters.city:
            continue
        if filters.keyword and filters.keyword not in listing["description"].casefold():
            continue

        listed = date.fromisoformat(listing["listedDate"])
        age = max(0, (today - listed).days)
        recency = 1 / (1 + age / 30)
        if filters.target_budget is None:
            score = 100 * recency
        else:
            budget_fit = max(0, 1 - abs(listing["price"] - filters.target_budget) / filters.target_budget)
            score = 100 * (0.7 * budget_fit + 0.3 * recency)
        ranked.append({**listing, "relevanceScore": score})

    ranked.sort(key=lambda item: (
        -item["relevanceScore"], -date.fromisoformat(item["listedDate"]).toordinal(),
        item["source"], item["id"],
    ))
    total = len(ranked)
    start = (filters.page - 1) * filters.page_size
    return {
        "items": ranked[start:start + filters.page_size],
        "total": total,
        "page": filters.page,
        "pageSize": filters.page_size,
        "totalPages": (total + filters.page_size - 1) // filters.page_size,
    }
