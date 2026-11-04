"""Flask transport layer. Start: python -m flask --app backend.app run --port 5001"""

from datetime import date
import json
from pathlib import Path

from flask import Flask, jsonify, request

from backend.search import InvalidQuery, parse_query, search_listings


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_mapping(
        DATA_PATH=Path(__file__).parent / "data" / "sample_listings.json",
        TODAY=date.today,
    )
    if test_config:
        app.config.update(test_config)
    # Load once per application instance, rather than on every request.
    with open(app.config["DATA_PATH"], encoding="utf-8") as data_file:
        listings = json.load(data_file)

    @app.get("/api/listings")
    def get_listings():
        try:
            filters = parse_query(request.args)
        except InvalidQuery as error:
            return jsonify(error={"message": str(error), "fields": error.fields}), 400
        return jsonify(search_listings(listings, filters, app.config["TODAY"]()))

    return app
