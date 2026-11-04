from datetime import date
import json

import pytest

from backend.app import create_app
from backend.search import InvalidQuery, SearchFilters, parse_query, search_listings

TODAY = date(2026, 9, 4)


def listing(id="1", source="MLS_A", price=450000, listed="2026-09-04", **changes):
    return {
        "id": id, "source": source, "address": "123 Main St", "city": "Springfield",
        "state": "VA", "zip": "22150", "price": price, "bedrooms": 3,
        "bathrooms": 2.0, "sqft": 1300, "latitude": 38.7, "longitude": -77.1,
        "listedDate": listed, "status": "active", "description": "Bright kitchen. No pets.",
        **changes,
    }


def search(items, **query):
    return search_listings(items, parse_query(query), TODAY)


@pytest.mark.parametrize("query", [
    {"minPrice": "450000"}, {"maxPrice": "450000"}, {"minBedrooms": "3"},
    {"city": "  SPRINGFIELD "}, {"keyword": " KITCHEN "}, {"keyword": "pets"},
])
def test_filter_boundaries_and_text_matching(query):
    assert search([listing()], **query)["total"] == 1


@pytest.mark.parametrize("query", [
    {"minPrice": "450001"}, {"maxPrice": "449999"}, {"minBedrooms": "4"},
    {"city": "Fairfax"}, {"keyword": "garage"},
])
def test_filters_exclude_nonmatches(query):
    result = search([listing()], **query)
    assert result["items"] == []
    assert result["total"] == result["totalPages"] == 0


def test_filters_combine_with_and():
    items = [listing("1"), listing("2", city="Fairfax"), listing("3", price=600000),
             listing("4", bedrooms=2), listing("5", description="Garage")]
    result = search(items, minPrice="400000", maxPrice="500000", minBedrooms="3",
                    city="Springfield", keyword="kitchen")
    assert [item["id"] for item in result["items"]] == ["1"]


def test_budget_prefers_closest_and_is_not_a_filter():
    result = search([listing("far", price=700000), listing("near", price=450000)], targetBudget="450000")
    assert [item["id"] for item in result["items"]] == ["near", "far"]
    assert result["items"][0]["relevanceScore"] == pytest.approx(100)


def test_recency_and_budget_weight_formula():
    result = search([listing("old", listed="2026-08-05"), listing("new")], targetBudget="450000")
    assert [item["id"] for item in result["items"]] == ["new", "old"]
    assert result["items"][1]["relevanceScore"] == pytest.approx(85)


def test_recency_only_and_future_dates():
    result = search([listing("old", listed="2026-08-05"), listing("new"),
                     listing("future", listed="2026-09-05")])
    assert [item["id"] for item in result["items"]] == ["future", "new", "old"]
    assert [item["relevanceScore"] for item in result["items"]] == [100, 100, 50]


def test_budget_fit_cannot_be_negative():
    result = search([listing(price=1000000)], targetBudget="100000")
    assert result["items"][0]["relevanceScore"] == pytest.approx(30)


def test_ties_sort_by_source_then_id_without_mutating_input():
    items = [listing("2", source="MLS_B"), listing("2"), listing("1")]
    result = search(items)
    assert [(item["source"], item["id"]) for item in result["items"]] == [
        ("MLS_A", "1"), ("MLS_A", "2"), ("MLS_B", "2")]
    assert "relevanceScore" not in items[0]
    assert items[0]["source"] == "MLS_B"


def test_pagination_after_ranking():
    items = [listing("old", listed="2026-08-05"), listing("new"), listing("middle", listed="2026-09-01")]
    first = search(items, pageSize="2")
    last = search(items, page="2", pageSize="2")
    beyond = search(items, page="3", pageSize="2")
    assert [item["id"] for item in first["items"]] == ["new", "middle"]
    assert [item["id"] for item in last["items"]] == ["old"]
    assert first["total"] == last["total"] == beyond["total"] == 3
    assert last["totalPages"] == 2
    assert beyond["items"] == [] and beyond["page"] == 3


def test_blank_inputs_use_defaults():
    assert parse_query({"minPrice": " ", "city": " ", "keyword": ""}) == SearchFilters()
    assert parse_query({"page": "", "pageSize": ""}) == SearchFilters()


@pytest.mark.parametrize("field,value", [
    ("minPrice", "-1"), ("maxPrice", "-1"), ("minBedrooms", "-1"),
    ("targetBudget", "0"), ("targetBudget", "-1"), ("page", "0"),
    ("pageSize", "0"), ("pageSize", "-1"), ("pageSize", "101"),
    ("minBedrooms", "2.5"), ("minBedrooms", "2.0"), ("page", "1.5"),
    ("pageSize", "nope"), ("minPrice", "hello"), ("maxPrice", "NaN"),
    ("targetBudget", "Infinity"), ("minPrice", "-Infinity"), ("maxPrice", "1e999"),
    ("page", "9" * 5000),
])
def test_invalid_inputs(field, value):
    with pytest.raises(InvalidQuery) as caught:
        parse_query({field: value})
    assert field in caught.value.fields


def test_inverted_price_range():
    with pytest.raises(InvalidQuery) as caught:
        parse_query({"minPrice": "500000", "maxPrice": "400000"})
    assert "maxPrice" in caught.value.fields


@pytest.fixture
def client():
    return create_app({"TESTING": True, "TODAY": lambda: TODAY}).test_client()


def test_api_defaults_and_fields(client):
    response = client.get("/api/listings")
    assert response.status_code == 200
    body = response.get_json()
    assert set(body) == {"items", "total", "page", "pageSize", "totalPages"}
    assert (body["total"], body["page"], body["pageSize"], body["totalPages"]) == (12, 1, 5, 3)
    assert len(body["items"]) == 5
    assert {"id", "source", "address", "price", "bedrooms", "description", "relevanceScore"} <= body["items"][0].keys()


def test_api_combined_query(client):
    response = client.get("/api/listings", query_string={
        "city": " springFIELD ", "minBedrooms": "3", "keyword": "kitchen", "maxPrice": "526000"})
    assert [item["id"] for item in response.get_json()["items"]] == ["A2"]


def test_api_empty_and_out_of_range(client):
    empty = client.get("/api/listings?city=Unknown").get_json()
    assert empty["items"] == [] and empty["totalPages"] == 0
    beyond = client.get("/api/listings?page=99").get_json()
    assert beyond["items"] == [] and beyond["total"] == 12 and beyond["totalPages"] == 3


def test_api_readable_errors(client):
    response = client.get("/api/listings?minPrice=-1&pageSize=0&targetBudget=NaN")
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["message"]
    assert set(error["fields"]) == {"minPrice", "pageSize", "targetBudget"}


def test_statuses_and_feeds_preserved(client):
    items = client.get("/api/listings?pageSize=100").get_json()["items"]
    assert len(items) == 12
    assert any(item["status"] == "pending" for item in items)
    assert {"A1", "B7"} <= {item["id"] for item in items}


def test_dataset_loaded_once(tmp_path):
    path = tmp_path / "listings.json"
    path.write_text(json.dumps([listing()]), encoding="utf-8")
    app = create_app({"TESTING": True, "DATA_PATH": path, "TODAY": lambda: TODAY})
    path.write_text("[]", encoding="utf-8")
    assert app.test_client().get("/api/listings").get_json()["total"] == 1
