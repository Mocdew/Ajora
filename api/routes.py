"""The four user-facing endpoints.

Handlers stay thin: resolve the provider, delegate to :mod:`api.service`, and map a
missing user to a 404. All engine logic lives behind the service layer.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from . import explanations, service
from .deps import get_provider
from .providers import DataProvider, UserNotFound
from .schemas import (
    CashflowResponse,
    ExplanationsResponse,
    GraphResponse,
    InsightsResponse,
    TransactionsResponse,
    UserSummary,
)

router = APIRouter(prefix="/users", tags=["users"])


def _not_found(user_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"No data for user {user_id!r}.")


@router.get("", response_model=List[UserSummary])
def list_users(provider: DataProvider = Depends(get_provider)) -> List[UserSummary]:
    """The demo roster — every persona this instance can serve."""
    return explanations.list_user_profiles(provider)


@router.get("/{user_id}/transactions", response_model=TransactionsResponse)
def get_transactions(
    user_id: str, provider: DataProvider = Depends(get_provider)
) -> TransactionsResponse:
    """Raw normalized transactions for the user (the pre-dedup ledger)."""
    try:
        return service.get_transactions(provider, user_id)
    except UserNotFound:
        raise _not_found(user_id)


@router.get("/{user_id}/cashflow", response_model=CashflowResponse)
def get_cashflow(
    user_id: str, provider: DataProvider = Depends(get_provider)
) -> CashflowResponse:
    """Deduped income/spending with the before/after totals."""
    try:
        return service.get_cashflow(provider, user_id)
    except UserNotFound:
        raise _not_found(user_id)


@router.get("/{user_id}/insights", response_model=InsightsResponse)
def get_insights(
    user_id: str, provider: DataProvider = Depends(get_provider)
) -> InsightsResponse:
    """Communal insights (ajo/esusu, dependents, lending, remittance)."""
    try:
        return service.get_insights(provider, user_id)
    except UserNotFound:
        raise _not_found(user_id)


@router.get("/{user_id}/graph", response_model=GraphResponse)
def get_graph(
    user_id: str, provider: DataProvider = Depends(get_provider)
) -> GraphResponse:
    """Relationship graph nodes + edges for Cytoscape."""
    try:
        return service.get_graph(provider, user_id)
    except UserNotFound:
        raise _not_found(user_id)


@router.get("/{user_id}/explanations", response_model=ExplanationsResponse)
def get_explanations(
    user_id: str, provider: DataProvider = Depends(get_provider)
) -> ExplanationsResponse:
    """Grounded GenAI narration of the user's real engine output."""
    try:
        return explanations.explanations_for(provider, user_id)
    except UserNotFound:
        raise _not_found(user_id)
