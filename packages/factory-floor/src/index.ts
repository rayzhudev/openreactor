export { FactoryFloorElement } from "./component";
export type {
  AutomationStatusPayload,
  FloorConfig,
  FloorState,
  WorkflowNode,
  WorkflowEdge,
  WorkItem,
  ActorSnapshot,
  ExecutionSnapshot,
  IncidentSnapshot,
  ServiceSnapshot,
} from "./types";

import { FactoryFloorElement as _Cls } from "./component";

if (typeof customElements !== "undefined" && !customElements.get("openreactor-factory-floor")) {
  customElements.define("openreactor-factory-floor", _Cls);
}
