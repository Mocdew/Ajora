"""Ajora HTTP API — a thin FastAPI layer over the engine library.

The API owns no business logic: it loads a user's transactions through a
:class:`~api.providers.DataProvider`, runs the pure engine pipeline
(dedup -> communal insights -> relationship graph), and serves typed Pydantic
responses. Consistent with the project's stateless, no-database architecture, it
persists nothing — every request recomputes from the (file-backed) source.
"""
