import type { FloorState, WorkItem, ActorSnapshot } from "../types";

export interface StateDiff {
  addedItems: string[];
  removedItems: string[];
  movedItems: Map<string, { fromNodeId: string; toNodeId: string }>;
  changedItems: string[];

  addedActors: string[];
  removedActors: string[];
  changedActors: string[];

  addedNodes: string[];
  removedNodes: string[];

  addedIncidents: string[];
  removedIncidents: string[];
}

export function diffStates(
  prev: FloorState | null,
  next: FloorState
): StateDiff {
  const diff: StateDiff = {
    addedItems: [],
    removedItems: [],
    movedItems: new Map(),
    changedItems: [],
    addedActors: [],
    removedActors: [],
    changedActors: [],
    addedNodes: [],
    removedNodes: [],
    addedIncidents: [],
    removedIncidents: [],
  };

  if (!prev) {
    diff.addedItems = [...next.items.keys()];
    diff.addedActors = [...next.actors.keys()];
    diff.addedNodes = [...next.nodes.keys()];
    diff.addedIncidents = [...next.incidents.keys()];
    return diff;
  }

  for (const id of next.items.keys()) {
    const prevItem = prev.items.get(id);
    if (!prevItem) {
      diff.addedItems.push(id);
    } else {
      const nextItem = next.items.get(id)!;
      if (prevItem.currentNodeId !== nextItem.currentNodeId && prevItem.currentNodeId && nextItem.currentNodeId) {
        diff.movedItems.set(id, {
          fromNodeId: prevItem.currentNodeId,
          toNodeId: nextItem.currentNodeId,
        });
      }
      if (prevItem.state !== nextItem.state) {
        diff.changedItems.push(id);
      }
    }
  }
  for (const id of prev.items.keys()) {
    if (!next.items.has(id)) diff.removedItems.push(id);
  }

  for (const id of next.actors.keys()) {
    if (!prev.actors.has(id)) {
      diff.addedActors.push(id);
    } else {
      const prevActor = prev.actors.get(id)!;
      const nextActor = next.actors.get(id)!;
      if (prevActor.status !== nextActor.status || prevActor.currentItemId !== nextActor.currentItemId) {
        diff.changedActors.push(id);
      }
    }
  }
  for (const id of prev.actors.keys()) {
    if (!next.actors.has(id)) diff.removedActors.push(id);
  }

  for (const id of next.nodes.keys()) {
    if (!prev.nodes.has(id)) diff.addedNodes.push(id);
  }
  for (const id of prev.nodes.keys()) {
    if (!next.nodes.has(id)) diff.removedNodes.push(id);
  }

  for (const id of next.incidents.keys()) {
    if (!prev.incidents.has(id)) diff.addedIncidents.push(id);
  }
  for (const id of prev.incidents.keys()) {
    if (!next.incidents.has(id)) diff.removedIncidents.push(id);
  }

  return diff;
}
