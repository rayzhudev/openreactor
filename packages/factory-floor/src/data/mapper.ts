import type { AutomationStatusPayload, FloorState } from "../types";
import { computeLayout } from "../layout/graph-layout";

export function mapPayloadToState(payload: AutomationStatusPayload): FloorState {
  const { nodes, edges } = computeLayout(
    payload.topology.nodes,
    payload.topology.edges
  );

  const items = new Map(
    payload.snapshot.items.map((item) => [item.id, item])
  );

  const actors = new Map(
    payload.snapshot.actors.map((actor) => [actor.id, actor])
  );

  const executions = new Map(
    (payload.snapshot.executions ?? []).map((exec) => [exec.id, exec])
  );

  const incidents = new Map(
    payload.snapshot.incidents.map((inc) => [inc.id, inc])
  );

  const services = new Map(
    payload.snapshot.services.map((svc) => [svc.id, svc])
  );

  return { nodes, edges, items, actors, executions, incidents, services };
}
