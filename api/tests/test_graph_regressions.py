"""Graph identities must preserve each typed relationship with a counterparty."""

from datetime import date

from api.service import USER_NODE_ID, _graph_elements
from engine.schemas.communal import CommunalInsight, CommunalInsights
from engine.schemas.transaction import UserProfile


def _insight(relationship_type, *, total_out=0, total_in=0):
    return CommunalInsight(
        counterparty="TEST CONTACT", relationship_type=relationship_type,
        confidence=0.9, tier="high", total_out_ngn=total_out, total_in_ngn=total_in,
        net_position_ngn=total_out - total_in, count=1, cadence="one-off",
        first_seen=date(2026, 6, 1), last_seen=date(2026, 6, 1),
        months_active=1, pct_of_net_income=10,
    )


def test_same_person_can_have_multiple_relationships_without_graph_id_collisions():
    insights = CommunalInsights(
        net_income_ngn=100_000,
        insights=[_insight("dependent", total_out=20_000),
                  _insight("informal_lending", total_out=50_000)],
    )
    nodes, edges = _graph_elements(
        UserProfile(user_id="user", full_name="Account Holder"), insights,
    )
    ids = [item.id for item in [*nodes, *edges]]
    assert len(set(ids)) == len(ids)
    assert len(nodes) == 3 and len(edges) == 2
    assert {node.label for node in nodes if node.kind == "counterparty"} == {"TEST CONTACT"}
    node_ids = {node.id for node in nodes}
    assert all(edge.source in node_ids and edge.target in node_ids for edge in edges)


def test_incoming_relationship_points_from_counterparty_to_user():
    nodes, edges = _graph_elements(
        UserProfile(user_id="user", full_name="Account Holder"),
        CommunalInsights(net_income_ngn=100_000, insights=[_insight("remittance", total_in=20_000)]),
    )
    counterparty = next(node for node in nodes if node.kind == "counterparty")
    assert (edges[0].source, edges[0].target) == (counterparty.id, USER_NODE_ID)
