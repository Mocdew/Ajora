"""The four user-facing endpoints.

Handlers stay thin: resolve the provider, delegate to :mod:`api.service`, and map a
missing user to a 404. All engine logic lives behind the service layer.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from . import explanations, service
from .audit import AuditLog
from .consent import ConsentRecord, ConsentStore, account_institutions
from .deps import get_audit_log, get_consent_store, get_provider
from .providers import DataProvider, UserNotFound
from .schemas import (
    AuditResponse,
    CashflowResponse,
    ConsentsResponse,
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
    user_id: str,
    provider: DataProvider = Depends(get_provider),
    consent_store: ConsentStore = Depends(get_consent_store),
    audit_log: AuditLog = Depends(get_audit_log),
) -> TransactionsResponse:
    """Raw normalized transactions for the user (the pre-dedup ledger)."""
    try:
        return service.get_transactions(provider, consent_store, audit_log, user_id)
    except UserNotFound:
        raise _not_found(user_id)


@router.get("/{user_id}/cashflow", response_model=CashflowResponse)
def get_cashflow(
    user_id: str,
    provider: DataProvider = Depends(get_provider),
    consent_store: ConsentStore = Depends(get_consent_store),
    audit_log: AuditLog = Depends(get_audit_log),
) -> CashflowResponse:
    """Deduped income/spending with the before/after totals."""
    try:
        return service.get_cashflow(provider, consent_store, audit_log, user_id)
    except UserNotFound:
        raise _not_found(user_id)


@router.get("/{user_id}/insights", response_model=InsightsResponse)
def get_insights(
    user_id: str,
    provider: DataProvider = Depends(get_provider),
    consent_store: ConsentStore = Depends(get_consent_store),
    audit_log: AuditLog = Depends(get_audit_log),
) -> InsightsResponse:
    """Communal insights (ajo/esusu, dependents, lending, remittance)."""
    try:
        return service.get_insights(provider, consent_store, audit_log, user_id)
    except UserNotFound:
        raise _not_found(user_id)


@router.get("/{user_id}/graph", response_model=GraphResponse)
def get_graph(
    user_id: str,
    provider: DataProvider = Depends(get_provider),
    consent_store: ConsentStore = Depends(get_consent_store),
    audit_log: AuditLog = Depends(get_audit_log),
) -> GraphResponse:
    """Relationship graph nodes + edges for Cytoscape."""
    try:
        return service.get_graph(provider, consent_store, audit_log, user_id)
    except UserNotFound:
        raise _not_found(user_id)


@router.get("/{user_id}/explanations", response_model=ExplanationsResponse)
def get_explanations(
    user_id: str,
    provider: DataProvider = Depends(get_provider),
    consent_store: ConsentStore = Depends(get_consent_store),
    audit_log: AuditLog = Depends(get_audit_log),
) -> ExplanationsResponse:
    """Grounded GenAI narration of the user's real engine output."""
    try:
        return explanations.explanations_for(provider, consent_store, audit_log, user_id)
    except UserNotFound:
        raise _not_found(user_id)


# --- trust layer: consent + audit --------------------------------------------------
# Consent is per connected account. Revoking an account stops its data reaching the
# pipeline (see api.consent.consented_batch), so /cashflow and /insights visibly
# change. Every data access above writes one append-only audit entry.


def _seed_consent(
    provider: DataProvider, consent_store: ConsentStore, user_id: str
) -> None:
    """Lazily seed consent from the provider's data (raises UserNotFound for a bad id)."""
    batch = provider.get_batch(user_id)
    consent_store.ensure_seeded(user_id, account_institutions(batch))


def _require_account(consent_store: ConsentStore, user_id: str, account_id: str) -> None:
    if not consent_store.knows_account(user_id, account_id):
        raise HTTPException(
            status_code=404,
            detail=f"Account {account_id!r} is not a connected account of user {user_id!r}.",
        )


@router.post("/{user_id}/accounts/{account_id}/revoke", response_model=ConsentRecord)
def revoke_account(
    user_id: str,
    account_id: str,
    provider: DataProvider = Depends(get_provider),
    consent_store: ConsentStore = Depends(get_consent_store),
) -> ConsentRecord:
    """Revoke consent for one account; its data stops flowing into the pipeline."""
    try:
        _seed_consent(provider, consent_store, user_id)
    except UserNotFound:
        raise _not_found(user_id)
    _require_account(consent_store, user_id, account_id)
    return consent_store.revoke(user_id, account_id)


@router.post("/{user_id}/accounts/{account_id}/grant", response_model=ConsentRecord)
def grant_account(
    user_id: str,
    account_id: str,
    provider: DataProvider = Depends(get_provider),
    consent_store: ConsentStore = Depends(get_consent_store),
) -> ConsentRecord:
    """Re-grant consent for a previously revoked account (toggles it back on)."""
    try:
        _seed_consent(provider, consent_store, user_id)
    except UserNotFound:
        raise _not_found(user_id)
    _require_account(consent_store, user_id, account_id)
    return consent_store.grant(user_id, account_id)


@router.get("/{user_id}/consents", response_model=ConsentsResponse)
def get_consents(
    user_id: str,
    provider: DataProvider = Depends(get_provider),
    consent_store: ConsentStore = Depends(get_consent_store),
) -> ConsentsResponse:
    """The user's per-account consent records (granted/revoked)."""
    try:
        _seed_consent(provider, consent_store, user_id)
    except UserNotFound:
        raise _not_found(user_id)
    return ConsentsResponse(user_id=user_id, consents=consent_store.records_for(user_id))


@router.get("/{user_id}/audit", response_model=AuditResponse)
def get_audit(
    user_id: str,
    provider: DataProvider = Depends(get_provider),
    audit_log: AuditLog = Depends(get_audit_log),
) -> AuditResponse:
    """The append-only access log for this user — proof of what was read, and when."""
    try:
        provider.get_batch(user_id)
    except UserNotFound:
        raise _not_found(user_id)
    return AuditResponse(user_id=user_id, entries=audit_log.entries_for(user_id))
