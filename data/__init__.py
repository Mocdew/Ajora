"""Data layer — providers and schema adapters that feed the engine.

Providers fetch raw bank payloads (mock files now; Mono/Okra later) and adapters
normalize each provider's wire shape into the canonical ``engine.models`` schema.
Nothing here persists raw bank data — normalization happens in memory, per request.
"""

from data.adapters import mono_to_transaction, okra_to_transaction
from data.loader import available_personas, load_persona
from data.provider import DataProvider, MockProvider

__all__ = [
    "DataProvider",
    "MockProvider",
    "mono_to_transaction",
    "okra_to_transaction",
    "load_persona",
    "available_personas",
]
