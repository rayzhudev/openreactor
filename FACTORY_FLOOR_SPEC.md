# Factory Floor Renderer Spec

Version: `0.3-draft`

Data contract: [AUTOMATION_STATUS_SPEC.md](./AUTOMATION_STATUS_SPEC.md)

## Purpose

`@openreactor/factory-floor` is an embeddable visualization library that
renders any `automation-status/v1` payload as an animated factory floor.

It is intended to:

- work as a standalone package on any website,
- consume the generic automation-status contract without assuming a specific
  autonomous system,
- provide a richer operational view than tables or status cards,
- power the OpenReactor homepage through the built artifact copied into
  `public/factory-floor/`.

The visual metaphor is a top-down factory floor inspired by Factorio — machines,
conveyor belts, workers, and resources on a grid. The purpose is operational: an
operator should glance at the visualization and immediately see whether the
system is healthy, where bottlenecks are, what is broken, and what needs
attention.

---

## Package & Integration

- **Package name:** `@openreactor/factory-floor`
- **Ships as:** vanilla JS web component (`<openreactor-factory-floor>`)
- **Works with:** any framework (React, Vue, Svelte, plain HTML)
- **Zero dependencies** on the host site's CSS or design system

### Usage

```html
<openreactor-factory-floor
  url="https://openreactor.net/api/openreactor-status"
  poll-interval="5000"
  width="100%"
  height="600px"
  pan="true"
  zoom="true"
  zoom-min="0.25"
  zoom-max="4"
  origin-x="0"
  origin-y="0"
  minimap="false"
  grid-visible="true"
  theme="default"
  muted="true"
/>
```

### Configuration API

| Attribute       | Type    | Default  | Description                                      |
|-----------------|---------|----------|--------------------------------------------------|
| `url`           | string  | —        | Status API endpoint (optional if using `.update()`) |
| `poll-interval` | number  | 5000     | Polling interval in ms (future: WebSocket)       |
| `width`         | string  | "100%"   | Component width (CSS value)                      |
| `height`        | string  | "600px"  | Component height (CSS value)                     |
| `pan`           | boolean | true     | Allow panning                                    |
| `zoom`          | boolean | true     | Allow zooming                                    |
| `zoom-min`      | number  | 0.25     | Minimum zoom level                               |
| `zoom-max`      | number  | 4        | Maximum zoom level                               |
| `origin-x`      | number  | 0        | Default viewport X offset                        |
| `origin-y`      | number  | 0        | Default viewport Y offset                        |
| `minimap`       | boolean | false    | Show minimap overlay                             |
| `grid-visible`  | boolean | true     | Show grid lines                                  |
| `theme`         | string  | "default"| Theme name or JSON override                      |
| `muted`         | boolean | true     | Mute all sound effects                           |

### Programmatic API

```js
const floor = document.querySelector('openreactor-factory-floor');

// Push data directly (alternative to URL polling)
floor.update(automationStatusPayload);

// Viewport control
floor.panTo(x, y);
floor.zoomTo(level);
floor.fitToContent();

// Events
floor.addEventListener('entity-click', (e) => {
  console.log(e.detail); // { type: 'item', data: { id: '...', label: '...' } }
});
floor.addEventListener('entity-hover', (e) => { ... });

// Sound (assets provided by integrator, not bundled)
floor.sounds = {
  beltLoop: '/sounds/conveyor-hum.mp3',
  process: '/sounds/machine-click.mp3',
  complete: '/sounds/completion.mp3',
  error: '/sounds/alert.mp3',
  spawn: '/sounds/spawn.mp3',
};
floor.muted = false;

// Cleanup
floor.destroy();
```

---

## Grid System

- **Cell size:** 25×25 pixels at 1× zoom.
- **Coordinate system:** integer grid positions. (0,0) is top-left of the
  content bounding box.
- **Entities span multiple cells.** A processor node might occupy 4×3 cells. A
  belt segment occupies 1 cell minimum.
- **All entities snap to grid.** No sub-grid positioning.
- **World is unbounded.** Content floats in infinite space like draw.io. The
  user can pan freely beyond the content bounds.
- **Grid lines** are thin, low-opacity. Visible by default. Subtle enough not
  to compete with entities.

---

## Relationship to the Status API

This package is a renderer, not the source of truth.

The renderer:

- consumes `automation-status/v1` payloads,
- derives layout from `topology.nodes` and `topology.edges`,
- positions items from `snapshot.items[].currentNodeId` /
  `snapshot.items[].currentEdgeId`,
- positions actors from `snapshot.actors[].currentNodeId`,
- overlays incidents from `snapshot.incidents[].scope`,
- reads services from `snapshot.services[]`,
- must not require renderer-specific fields in the payload.

System-specific details (issue numbers, PR links, tool labels) are read from
`extensions.*` in drill-down views only. The renderer's spatial layout, node
placement, and health visualization are driven entirely by the generic contract.

---

## Visual Primitive Mapping

The renderer maps generic `automation-status/v1` entities to visual primitives.

### Node kind → visual primitive

| Node kind     | Visual primitive     | Description                              |
|---------------|----------------------|------------------------------------------|
| `source`      | Source pipe / inlet   | Where items enter the system             |
| `processor`   | Station / machine     | Transforms items                         |
| `queue`       | Queue lane / rack     | Buffers items awaiting movement          |
| `router`      | Splitter / diverter   | Branch point dispatching items           |
| `sink`        | Output bin / dock     | Terminal outcome accumulator             |
| `store`       | Storage vault         | Persistent data store                    |
| `supervisor`  | Repair bay / control  | Monitors and repairs the system          |
| `scheduler`   | Timer station         | Schedules work on intervals              |
| `integration` | Connector port        | External service interface               |
| `human-gate`  | Approval desk         | Requires human decision to proceed       |

### Edge kind → visual connection

| Edge kind    | Visual connection                                        |
|--------------|----------------------------------------------------------|
| `flow`       | Standard conveyor belt (solid dashes, animated forward)  |
| `retry`      | Loop belt (wider dash gaps, distinct style)              |
| `handoff`    | Transfer path (thinner, different color)                 |
| `dependency` | Dependency line (dotted, muted)                          |
| `control`    | Supervisory link (thin, distinct color)                  |

### Snapshot entities → visual elements

| Snapshot entity | Visual element                                          |
|-----------------|---------------------------------------------------------|
| `items[]`       | Tokens — colored tiles positioned at their node/edge    |
| `actors[]`      | Workers — character figures anchored at their node      |
| `executions[]`  | Execution metadata shown in actor/item drill-down views |
| `incidents[]`   | Overlays on scoped nodes, edges, items, actors, services|
| `services[]`    | Service indicator panels in the HUD area                |

---

## Layout Algorithm

The renderer owns layout. The API provides no coordinates.

### Graph interpretation

1. **Read `topology.nodes` and `topology.edges`.**
2. **Compute a topological sort** of nodes following `flow` edges to determine
   the primary left-to-right order.
3. **Identify forward flow** (`flow` edges) as the main horizontal axis.
4. **Identify branches** (nodes reachable by `handoff` or secondary `flow`
   edges) and place them on secondary rows above or below the main axis.
5. **Identify retry loops** (`retry` edges) and route them as U-shaped paths
   below the main flow.
6. **Identify supervisors** (`supervisor` nodes) and place them adjacent to the
   nodes they control (determined by `control` edges).
7. **Place sinks** toward the right edge.
8. **Place service indicators** in a HUD area above the main floor.

### Concrete placement rules

All positions are in grid cells (25px each).

**Horizontal lanes:**
- Nodes are placed left-to-right in topological order.
- Horizontal gap between nodes: 3 cells minimum.
- Belt routing columns occupy 2 cells between node groups.

**Vertical stacking:**
- Processor nodes with `capacity.maxConcurrency > 1` expand into a vertical
  cluster: one visual bay per concurrency slot, stacked vertically with 1-cell
  gaps.
- Actors are assigned to bays based on `currentNodeId` matching the processor.

**Retry loops:**
- Retry edges route below the main flow as a U-shaped SVG path.
- The loop descends 4 cells below the lowest node in the retry subgraph.

**Supervisor placement:**
- Supervisor nodes are placed adjacent to the node cluster they supervise,
  offset to the side or below.

**Sink grouping:**
- Multiple sink nodes sharing the same column are stacked vertically.
- If items at a sink have different `outcome` values, the renderer may visually
  subdivide the sink into labeled sections.

**Disconnected subgraphs:**
- Nodes not reachable from the primary flow are placed in a separate cluster
  below the main floor, with a visual gap.

### Entity sizing

| Visual primitive       | Grid size (cells) |
|------------------------|-------------------|
| Source pipe             | 3 × 3             |
| Station / processor    | 4 × 3             |
| Queue lane             | 4 × 2             |
| Router / splitter      | 3 × 3             |
| Output bin / sink      | 3 × 4             |
| Supervisor bay         | 4 × 4             |
| Human-gate desk        | 4 × 3             |
| Actor bay (within processor) | 5 × 4       |
| Token                  | 1 × 1             |
| Service indicator      | 6 × 2             |

---

## Visual Primitives — Rendering Detail

All primitives are rendered as DOM elements (HTML divs + inline SVG). The
renderer uses DOM + SVG, not Canvas.

### Source pipe

Represents `source` nodes.

**Visual:** A tapered rectangular chute — wider at the left, narrowing to where
it meets the first belt. Interior is darker to suggest depth. A label and item
count sit above.

**DOM:**
```html
<div class="ff-entity ff-source ff-source--active"
     data-node-id="intake">
  <div class="ff-source__body">
    <div class="ff-source__interior"></div>
    <div class="ff-source__mouth"></div>
  </div>
  <div class="ff-entity__label">Intake</div>
  <div class="ff-entity__count">4 queued</div>
</div>
```

**CSS:** `clip-path: polygon(...)` for taper. Interior: darker background with
inset `box-shadow`. Active: pulsing dot at mouth via pseudo-element animation.

**States:**
- **Active** — items present. Pulse dot, accent count.
- **Idle** — static, muted colors.
- **Degraded/Down** — error-red border, warning badge.

**Data source:** `topology.nodes[kind=source]`, item count from
`node.counts.totalItems`.

### Station (processor / queue / router)

Represents `processor`, `queue`, `router` nodes.

**Visual:** A rounded rectangle with 1px border. Inside: inline SVG icon above
label. Left edge has an input slot, right edge has an output slot where belts
connect. Active border = accent color. Count badge at top-right.

**DOM:**
```html
<div class="ff-entity ff-station ff-station--active"
     data-node-id="triage-planning"
     data-node-kind="processor">
  <div class="ff-station__slot ff-station__slot--in"></div>
  <div class="ff-station__body">
    <svg class="ff-station__icon"><!-- procedural icon --></svg>
    <span class="ff-station__label">Triage</span>
    <div class="ff-station__tray"><!-- tokens inside --></div>
  </div>
  <div class="ff-station__slot ff-station__slot--out"></div>
  <div class="ff-entity__badge">2</div>
</div>
```

**CSS:** `background: var(--ff-station)`, `border: 1px solid
var(--ff-station-border)`, `border-radius: 6px`. Slots: small darker rectangles
on edges. Active: `animation: ff-station-pulse 2s ease-in-out infinite`.

**Icon selection** is driven by node kind:
- `processor` → gear icon
- `queue` → stacked-lines icon
- `router` → fork/split icon

**States:**
- **Active** — accent border, icon color = accent, badge visible.
- **Idle** — muted border, muted icon, no badge.
- **Degraded** — amber border, warning overlay.
- **Down** — error-red border, reduced opacity.

**Data source:** `topology.nodes[]`. Count from `node.counts.totalItems`.

### Actor bay (worker desk)

Represents an actor occupying a processor node. One bay per concurrency slot.

**Visual:** A larger rounded rectangle with a procedural character (circle head,
rectangle body, rectangle arms). Color-coded by `actor.role`. Workspace area
holds the current token. Nameplate shows the actor label and current item.
Iteration badge and status light.

**DOM:**
```html
<div class="ff-entity ff-actor-bay ff-actor-bay--working"
     data-actor-id="openreactor:actor:201"
     data-actor-role="ui">
  <div class="ff-actor-bay__desk">
    <div class="ff-character" style="--actor-color: var(--ff-actor-ui)">
      <div class="ff-character__head"></div>
      <div class="ff-character__body"></div>
      <div class="ff-character__arm ff-character__arm--l"></div>
      <div class="ff-character__arm ff-character__arm--r"></div>
    </div>
    <div class="ff-actor-bay__workspace"><!-- active token --></div>
  </div>
  <div class="ff-actor-bay__nameplate">
    <span class="ff-actor-bay__name">Codex UI agent</span>
    <span class="ff-actor-bay__task">#201 Polish queue cards</span>
  </div>
  <div class="ff-actor-bay__status-light"></div>
  <div class="ff-entity__badge">2/8</div>
  <div class="ff-actor-bay__slot ff-actor-bay__slot--in"></div>
  <div class="ff-actor-bay__slot ff-actor-bay__slot--out"></div>
</div>
```

**Character CSS:**
- Head: `16px` circle, `border-radius: 50%`, `background: var(--actor-color)`.
- Body: `20×24px`, `border-radius: 4px`, `background: var(--actor-color)`,
  `opacity: 0.8`.
- Arms: `6×16px`, `border-radius: 3px`, positioned beside body.
- Working: arms rotate ±15° via `animation: ff-working 0.8s ease-in-out
  infinite alternate`.
- Idle: subtle body pulse via `animation: ff-idle 3s ease-in-out infinite`.
- Stalled: `animation-play-state: paused`, `opacity: 0.4`.
- Failed: `opacity: 0.3`, red `✕` overlay.

**Actor color** derives from `actor.role` or `actor.kind`:
- Role not set / general: factory orange `#c6643f`
- `planning`: green `#508f6e`
- `ui`: purple `#7c6ccf`
- `service`: steel blue `#506d89`
- `human`: neutral grey `#6b7280`

**Actor placement:**
1. Read `actor.currentNodeId` to find which processor node the actor belongs to.
2. Read `actor.currentItemId` to find the item on the actor's desk.
3. If `actor.status === "idle"`, the bay shows an empty workspace.
4. If `actor.currentNodeId` is missing, the actor appears in a "roster" panel in
   the HUD rather than on the factory floor.

**Execution metadata** (from `snapshot.executions[]` matched by
`execution.actorId`) provides attempt count, started time, and outcome for
the badge and drill-down tooltip.

**States:**
- **Idle** — workspace empty, muted colors, status light grey.
- **Working** — character animating, token in workspace, status light green.
- **Stalled** — frozen character, status light amber. Derived from
  `actor.status === "stalled"` or heartbeat age exceeding a threshold.
- **Failed** — dimmed character, status light red.
- **Unavailable** — "OUT OF ORDER" overlay, character hidden.

**Data source:** `snapshot.actors[]`, `snapshot.executions[]`.

### Conveyor belt

Represents edges between nodes.

**Visual:** An SVG `<path>` with thick dashed stroke (1 grid cell wide). Dashes
animate in the flow direction. Arrowhead marker at the end. Belts route
orthogonally (horizontal then vertical) with rounded corners at turns.

**SVG:**
```html
<path class="ff-belt ff-belt--active"
      d="M 75 62 H 200 Q 212 62 212 74 V 112"
      marker-end="url(#ff-arrow)"
      data-edge-id="intake-to-triage" />
```

**CSS:**
```css
.ff-belt {
  fill: none;
  stroke: var(--ff-belt);
  stroke-width: 20;
  stroke-dasharray: 12 8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke 300ms;
}
.ff-belt--active {
  stroke: var(--ff-belt-active);
  animation: ff-belt-flow 1s linear infinite;
}
@keyframes ff-belt-flow {
  to { stroke-dashoffset: -20; }
}
```

**Edge kind styling:**
- `flow`: standard belt (solid dashes, animated).
- `retry`: wider gaps (`stroke-dasharray: 6 10`), `opacity: 0.7` when idle.
- `handoff`: thinner stroke (`stroke-width: 14`), distinct color.
- `dependency`: dotted line (`stroke-dasharray: 3 6`), muted color.
- `control`: thin solid line (`stroke-dasharray: none`, `stroke-width: 2`),
  muted accent color.

**Routing:** Belts connect entity slot positions. Horizontal from source slot,
90° turn with `Q` curve, vertical to target slot. Multiple belts sharing a
vertical column offset by 1 cell to avoid overlap.

**States:**
- **Active** — accent color, dashes animate.
- **Idle** — muted color, `animation-play-state: paused`.
- **Blocked** — error-red stroke, slower animation.

Belt status derives from the edge's `status` field and from whether the edge has
items in transit (`edge.counts.inTransit > 0` or items with matching
`currentEdgeId`).

**Data source:** `topology.edges[]`.

### Token (item)

Represents a `WorkItem` from `snapshot.items[]`.

**Visual:** A small colored square (1 grid cell) with rounded corners and
centered label text in white. Background color indicates state. At 2× zoom and
above, the token expands to 2×1 cells and shows a truncated `item.label`.

**DOM:**
```html
<div class="ff-token ff-token--running"
     data-item-id="openreactor:issue:201">
  <span class="ff-token__label">#201</span>
  <span class="ff-token__title">Polish queue cards</span>
</div>
```

**CSS:** `width: 25px; height: 25px; border-radius: 4px`. Color from state.
`transition: transform 500ms ease-out, background-color 300ms`.
At 2× zoom: `.ff-world--zoomed-in .ff-token { width: 50px }` and title visible.
Hover: `filter: brightness(1.15)`. Selected: `outline: 2px solid
var(--ff-station-active); outline-offset: 2px`.

**Token label** reads from `item.label`. The renderer may shorten it or extract
a number if the label follows a pattern like "Issue #42: ...". System-specific
display (showing `extensions.openreactor.issueNumber` as `#42`) is done by an
optional label formatter that the integrator can provide.

**State → color mapping:**

| Item state   | CSS class             | Color                    |
|--------------|-----------------------|--------------------------|
| `queued`     | `ff-token--queued`    | steel blue `#506d89`     |
| `assigned`   | `ff-token--assigned`  | amber `#9d5b20`          |
| `running`    | `ff-token--running`   | amber `#9d5b20`          |
| `waiting`    | `ff-token--waiting`   | grey `#9ca3af`           |
| `blocked`    | `ff-token--blocked`   | grey `#9ca3af`           |
| `retrying`   | `ff-token--retrying`  | orange-red `#9d4331`     |
| `paused`     | `ff-token--paused`    | grey `#9ca3af`           |
| `succeeded`  | `ff-token--succeeded` | green `#2f6d56`          |
| `failed`     | `ff-token--failed`    | dark red `#9d4331`       |
| `cancelled`  | `ff-token--cancelled` | faint grey `#d1d5db`     |
| `deferred`   | `ff-token--deferred`  | muted blue `#7c8fa0`     |

**Token placement:**
1. If `item.currentNodeId` is set, the token renders inside that node's entity
   (in its tray, workspace, or item grid depending on node kind).
2. If `item.currentEdgeId` is set, the token rides the corresponding belt path.
   Position is calculated in JS via `SVGGeometryElement.getPointAtLength()`,
   applied as `transform`, with CSS transition for smoothing.
3. If neither is set, the token appears in a "limbo" area at the bottom of the
   floor with a visual indicator that its location is unknown.

**Overflow:** If a node has more items than visually fit, the renderer shows the
first N tokens plus a "+X more" badge. The badge uses `node.counts.totalItems`
for the true total and `node.samples.items.visibleCount` for how many are
individually rendered.

**Data source:** `snapshot.items[]`.

### Output bin (sink)

Represents `sink` nodes.

**Visual:** A rectangular container with an open top edge (dashed top border).
Completed items accumulate inside as small colored dots. Count label below.
Inset shadow suggests depth.

**DOM:**
```html
<div class="ff-entity ff-output-bin"
     data-node-id="completed">
  <div class="ff-output-bin__container">
    <div class="ff-output-bin__items">
      <div class="ff-output-bin__dot" style="background: var(--ff-token-succeeded)"></div>
      ...
    </div>
  </div>
  <div class="ff-entity__label">Completed</div>
  <div class="ff-entity__count">14</div>
</div>
```

**CSS:** `border: 1px solid; border-top: 1px dashed; border-radius: 0 0 6px 6px;
box-shadow: inset 0 2px 4px rgba(0,0,0,0.06)`. Dots: `8px` squares, flex-wrap
filling from bottom.

If the sink's items have different `outcome` values, the renderer groups dots by
outcome and shows a small label per group.

**Data source:** `topology.nodes[kind=sink]`, `snapshot.items[]` at that node.

### Supervisor bay

Represents `supervisor` nodes.

**Visual:** Similar to an actor bay but with a distinct maintenance style:
thicker border, wrench icon, tool rack. Contains a repair worker character.

**DOM:**
```html
<div class="ff-entity ff-supervisor ff-supervisor--idle"
     data-node-id="watchdog">
  <div class="ff-supervisor__station">
    <div class="ff-supervisor__tool-rack">
      <svg><!-- wrench --></svg>
      <svg><!-- first-aid --></svg>
      <svg><!-- clipboard --></svg>
    </div>
    <div class="ff-character ff-character--supervisor">
      <div class="ff-character__head"></div>
      <div class="ff-character__body"></div>
      <div class="ff-character__arm ff-character__arm--l"></div>
      <div class="ff-character__arm ff-character__arm--r"></div>
    </div>
  </div>
  <div class="ff-entity__label">Watchdog</div>
  <div class="ff-supervisor__status-light"></div>
  <div class="ff-entity__badge"><!-- cooldown timer --></div>
</div>
```

**Repair animation:** When an incident targets a node that the supervisor
controls (linked via `control` edge), the supervisor's character div is
reparented to the world-level entity layer and transitions to the target node's
coordinates via `transform` with `transition: transform 800ms ease-in-out`. At
the target, the active tool animates. When done, the character transitions back
and is reparented into the supervisor bay.

**Data source:** `topology.nodes[kind=supervisor]`, incident scoping, `control`
edges.

### Service indicator

Represents a `ServiceSnapshot` from `snapshot.services[]`.

**Visual:** A compact horizontal panel in the HUD area. Status dot, service
name, key metric, and timer.

**DOM:**
```html
<div class="ff-service-indicator ff-service-indicator--healthy"
     data-service-id="reactor">
  <div class="ff-service-indicator__dot"></div>
  <div class="ff-service-indicator__info">
    <span class="ff-service-indicator__name">Reactor</span>
    <span class="ff-service-indicator__metric">2/3 agents</span>
  </div>
  <div class="ff-service-indicator__timer">12s</div>
</div>
```

**Status → dot color:** healthy = green, degraded = amber, down = red
(flashing), cooldown = blue, paused = grey, unknown = grey outline.

**Data source:** `snapshot.services[]`. Capacity metrics from
`metrics.capacities`.

---

## Incident Overlays

Incidents are not separate spatial entities. They are visual overlays applied to
the entities they scope.

### Scope resolution

An `IncidentSnapshot` has a `scope` object that may reference:
- `system: true` — overlay on the system health indicator.
- `nodeIds` — overlay on the named nodes.
- `edgeIds` — overlay on the named edges.
- `itemIds` — overlay on the named tokens.
- `actorIds` — overlay on the named actor bays.
- `serviceIds` — overlay on the named service indicators.

### Visual treatment by severity

| Severity   | Visual effect                                                |
|------------|--------------------------------------------------------------|
| `info`     | Small info badge on the entity. Blue tint.                   |
| `warning`  | Amber border glow. Warning triangle badge.                   |
| `error`    | Red border glow. Pulsing warning badge. Belt turns red.      |
| `critical` | Red border, flashing. Entity background tinted red.          |

### Overlay DOM

Incident overlays are applied as additional CSS classes and badge elements on the
affected entity:

```html
<div class="ff-entity ff-station ff-station--active ff-incident--error"
     data-node-id="blocked">
  <!-- normal station content -->
  <div class="ff-incident-badge ff-incident-badge--error">
    <svg><!-- warning triangle --></svg>
    <span>Provider outage</span>
  </div>
</div>
```

Multiple incidents on the same entity stack badges vertically. The highest
severity determines the entity's border/glow treatment.

### Incident details

Clicking an incident badge opens a detail tooltip showing:
- `incident.label`
- `incident.severity` and `incident.status`
- `incident.reason` (if present)
- `incident.startedAt` and duration
- Scoped entities listed as links

**Data source:** `snapshot.incidents[]`.

---

## Interactions

### Click / Select

- Click any entity to select it.
- Selected entity shows a **detail tooltip** in world space, positioned near the
  entity. If the tooltip would overflow the viewport, it repositions to the
  opposite side.
- Click empty space to deselect.
- Tooltip content varies by entity type:
  - **Tokens:** item label, state, current node, time in state, assigned actor,
    retry count, related resource URLs, and extensions data.
  - **Actors:** label, role, status, current item, provider, model, heartbeat
    age, execution attempt count. Extensions data.
  - **Nodes:** label, kind, status, item count (true total from counts), items
    list (scrollable from samples), capacity.
  - **Sinks:** total count, items grouped by outcome.
  - **Supervisors:** status, active incidents, control edges.
  - **Service indicators:** status, restarts, cooldown timer, extensions data.
  - **Incident badges:** incident details as described above.

### Hover

- Lightweight tooltip with entity name, status, and count.
- Hovered entity: `filter: brightness(1.15)` with `transition: 150ms`.

### Pan

- Click and drag on empty space.
- Mouse wheel without Ctrl to scroll vertically.
- Touch: single finger drag.

### Zoom

- Ctrl + mouse wheel.
- Pinch to zoom on touch.
- Range: 0.25× to 4×.
- Centers on cursor position.

### Minimap (optional)

- Bottom-right corner.
- Shows full layout as tiny colored dots.
- Viewport indicator rectangle.
- Click to jump.

---

## Theming

### Default theme

Minimal, flat. Clean white floor.

```js
{
  floor: '#ffffff',
  grid: '#e5e7eb',
  gridOpacity: 0.4,

  station: '#f9fafb',
  stationBorder: '#d1d5db',
  stationActive: '#c6643f',
  belt: '#d1d5db',
  beltActive: '#c6643f',

  tokenQueued: '#506d89',
  tokenRunning: '#9d5b20',
  tokenSucceeded: '#2f6d56',
  tokenFailed: '#9d4331',
  tokenPaused: '#9ca3af',

  actorGeneral: '#c6643f',
  actorPlanning: '#508f6e',
  actorUi: '#7c6ccf',
  actorService: '#506d89',
  actorHuman: '#6b7280',

  healthy: '#2f6d56',
  degraded: '#9d5b20',
  error: '#9d4331',
  cooldown: '#506d89',

  text: '#111827',
  textSoft: '#4b5563',
  textFaint: '#9ca3af',

  hazardStripe1: '#9d5b20',
  hazardStripe2: '#111827',
}
```

### Custom themes

Override via attribute or CSS custom properties:

```html
<openreactor-factory-floor theme='{"floor":"#1a1a2e","text":"#e0e0e0"}' />
```

```css
openreactor-factory-floor {
  --ff-floor: #1a1a2e;
  --ff-text: #e0e0e0;
}
```

---

## Animation

All animations are CSS-based (keyframes + transitions). `requestAnimationFrame`
is used only for camera sync during pan/zoom and for belt-riding token position
calculation.

### Belt animation

SVG `stroke-dashoffset` via CSS `@keyframes` (infinite linear loop). Active
belts animate forward. Speed proportional to throughput —
`animation-duration` shortened for busy edges. Idle belts: `animation-play-state:
paused`.

### Token movement

`transition: transform 500ms ease-out` on token divs. When `currentNodeId`
changes between polls, the new `translate()` triggers a smooth transition.
Belt-riding tokens: position calculated in JS via
`SVGGeometryElement.getPointAtLength()`, applied as `transform`. Spawning:
`animation: ff-spawn 400ms ease-out` (scale + opacity). Completing:
`animation: ff-complete 400ms ease-in` (shrink + fade).

### Worker animation

Idle: `animation: ff-idle 3s ease-in-out infinite`. Working: arm rotation.
Stalled: animations paused. Failed: `animation: ff-error-flash 1s` then hold.

### Supervisor repair animation

Character transitions to target node coordinates, animates tool at target,
transitions back. All via CSS `transition` on `transform`.

### Status transitions

`transition: background-color 300ms, border-color 300ms, opacity 300ms`.
Error flash: `animation: ff-error-pulse 0.5s ease-in-out 3`.
Respects `prefers-reduced-motion`. Adaptive performance reduces animation
complexity at low FPS.

---

## Rendering Architecture

### Layer stack

```
<openreactor-factory-floor> (shadow DOM root)
  .ff-viewport (overflow: hidden)
    .ff-world (transform: translate3d(panX, panY, 0) scale(zoom))
      .ff-floor (CSS grid background pattern)
      .ff-belts (SVG — one <path> per edge)
      .ff-entities (div per entity, positioned via translate(x, y))
    .ff-hud (fixed overlay — tooltips, service indicators, controls)
```

**Shadow DOM** isolates all styles. Single `transform` on `.ff-world` handles
pan and zoom. Entity divs use `transform: translate(${gx * 25}px, ${gy * 25}px)`.
HUD is outside the world transform.

**Performance:** `will-change: transform` on `.ff-world`. CSS transitions
disabled during pan/zoom via `.ff-world--panning`. `requestAnimationFrame`
batching for camera updates. Adaptive quality reduces animations at low FPS.
Entity hover via CSS `:hover`.

---

## Data Flow

```
[Poll / .update()] → [Validate] → [Map to internal state] → [Diff] → [DOM updates + animations]
     ↑                                                                          │
     └─────────────────── poll-interval ms ─────────────────────────────────────┘
```

### Internal state

```typescript
interface FloorState {
  nodes: Map<string, NodeState>;      // from topology.nodes
  edges: Map<string, EdgeState>;      // from topology.edges
  items: Map<string, ItemState>;      // from snapshot.items
  actors: Map<string, ActorState>;    // from snapshot.actors
  executions: Map<string, ExecState>; // from snapshot.executions
  incidents: Map<string, IncidentState>; // from snapshot.incidents
  services: Map<string, ServiceState>;   // from snapshot.services
}
```

### Diff logic

On each poll, the mapper produces a new `FloorState`. The differ compares old
and new:

- **New entity** → create DOM node, play spawn animation.
- **Removed entity** → play exit animation, remove DOM node.
- **State change** → update CSS classes (triggers transitions).
- **Position change** (item's `currentNodeId` changed) → update `transform`
  (triggers CSS transition).
- **Data change** → update text content, badges, counts.

### Token transit detection

When an item's `currentNodeId` changes between polls, the differ records the
previous node. If a matching edge exists between the two nodes, the token
briefly animates along the belt path before arriving at the new node.

---

## Edge Cases

**Empty system:** All entities render idle. Belts static. Quiet factory.

**API unreachable:** HUD banner: "Connection lost — retrying in Xs". Last state
stays rendered with subtle desaturation. Exponential backoff (5s → 60s max).

**Malformed data:** HUD error banner. Last good state preserved.

**First load:** Skeleton layout — entity outlines with pulsing placeholder
animation.

**Missing location on items:** Items without `currentNodeId` or `currentEdgeId`
render in a "limbo" area with a visual unknown-location indicator.

**Missing location on actors:** Actors without `currentNodeId` appear in a HUD
roster panel rather than on the floor.

---

## Sound

The component supports optional sound effects. Audio files are provided by the
integrator, not bundled. Ships with a mute toggle (muted by default).

Sound triggers:
- Item spawning at a source node.
- Item arriving at a sink node.
- Incident created (error/critical severity).
- Actor starting work.
- Belt becoming active.

---

## Accessibility

v1:
- ARIA labels on all entities: `aria-label="Triage station: 2 items, active"`.
- `prefers-reduced-motion` respected — all animations pause or simplify.
- Focus-visible outline on interactive entities.
- Keyboard: Tab cycles entities, Enter selects, Escape dismisses tooltip.

---

## Project Structure

```
packages/
  factory-floor/
    package.json
    tsconfig.json
    src/
      index.ts                # Web component registration & exports
      component.ts            # <openreactor-factory-floor> custom element
      viewport/
        Viewport.ts           # Pan, zoom, coordinate transforms
        input.ts              # Mouse, wheel, touch, pinch handlers
        performance.ts        # FPS monitoring, adaptive quality
      entities/
        Entity.ts             # Base entity class
        SourcePipe.ts         # source nodes
        Station.ts            # processor, queue, router nodes
        ActorBay.ts           # Actor desk within processor
        Token.ts              # Work items
        OutputBin.ts          # sink nodes
        SupervisorBay.ts      # supervisor nodes
        HumanGate.ts          # human-gate nodes
        ServiceIndicator.ts   # Service health panels
        IncidentOverlay.ts    # Incident badge and glow
        Timer.ts              # Clock/countdown overlay
      belts/
        BeltLayer.ts          # SVG layer managing all edge paths
        Belt.ts               # Individual belt
        routing.ts            # Orthogonal path routing
      layout/
        graph-layout.ts       # Topology → grid positions
        grid.ts               # Grid math
      data/
        poller.ts             # API polling
        mapper.ts             # automation-status/v1 → FloorState
        differ.ts             # Diff old/new state for animations
      theme/
        default.ts
        types.ts
        inject.ts             # CSS custom property injection
      sound/
        SoundManager.ts
      icons/
        procedural.ts         # Inline SVG icon generators
      styles/
        base.css
        floor.css
        entities.css
        belts.css
        hud.css
        animations.css
        adaptive.css
      types.ts
    dist/
    demo/
      index.html
      mock-data.json          # Sample automation-status/v1 payload
```

---

## Worked Example: OpenReactor

OpenReactor is the first system to use this renderer. Here is how its
`automation-status/v1` payload maps to the factory floor.

### Topology → layout

| Node id            | Kind        | Visual                    | Position          |
|--------------------|-------------|---------------------------|-------------------|
| `intake`           | `source`    | Source pipe                | Far left          |
| `triage-planning`  | `processor` | Station (clipboard icon)   | Left of center    |
| `execution`        | `processor` | Actor bay cluster (3 bays) | Center            |
| `retry`            | `queue`     | Queue lane below execution | Below center      |
| `blocked`          | `queue`     | Queue lane below retry     | Below center      |
| `completed`        | `sink`      | Output bin                 | Far right         |
| `watchdog`         | `supervisor`| Supervisor bay             | Adjacent to blocked |

Edges:
- `intake → triage-planning` (flow belt)
- `triage-planning → execution` (flow belt)
- `execution → retry` (retry loop down)
- `retry → execution` (retry loop back up)
- `execution → blocked` (handoff belt)
- `execution → completed` (flow belt)
- `watchdog → blocked` (control link)

### Actors → bays

The `execution` node has `capacity.maxConcurrency = 3`, so the renderer creates
3 actor bays stacked vertically. Active actors (from `snapshot.actors[]` with
`currentNodeId = "execution"`) are assigned to bays. Idle bays remain empty.

### Incidents → overlays

- A `paused-issue` incident scoping `nodeIds: ["blocked"]` and
  `itemIds: ["openreactor:issue:186"]` causes: amber glow on the blocked queue
  lane, warning badge on the specific token, and the token visually shows a
  timer based on `incident.startedAt`.
- A `service-cooldown` incident scoping `serviceIds: ["watchdog"]` causes: blue
  status dot on the watchdog service indicator, cooldown timer badge.

### Extensions in drill-down

When a user clicks token `#201`, the detail tooltip shows generic fields (label,
state, node, actor) plus OpenReactor-specific fields from
`item.extensions.openreactor`: issue number, branch name, tool label, PR URL.

---

## v1 Scope

v1 must support:

- [ ] Graph-driven layout from `topology.nodes` and `topology.edges`
- [ ] Visual primitives for all node kinds (source, processor, queue, router,
      sink, supervisor, human-gate)
- [ ] Conveyor belts for all edge kinds (flow, retry, handoff, dependency,
      control)
- [ ] Tokens positioned from `snapshot.items[].currentNodeId` /
      `currentEdgeId`
- [ ] Actors positioned from `snapshot.actors[].currentNodeId` with bay
      assignment
- [ ] Incident overlays from `snapshot.incidents[].scope`
- [ ] Service indicators from `snapshot.services[]`
- [ ] Truthful counts from `node.counts` with bounded visible samples
- [ ] Click-to-inspect with drill-down tooltips (including extensions data)
- [ ] Pan and zoom
- [ ] Default theme with override capability
- [ ] Grid-snapped layout
- [ ] Belt flow animation and token movement transitions
- [ ] Health state visualization (node/edge/actor status colors)
- [ ] Sound support (muted by default, integrator-provided assets)
- [ ] Keyboard navigation and ARIA labels
- [ ] `prefers-reduced-motion` support
- [ ] Embeddable web component packaging

v1 should not depend on:

- [ ] Sprite art
- [ ] Isometric mode
- [ ] Manual layout persistence
- [ ] Renderer-specific API fields

## v2 (Future)

- [ ] Minimap
- [ ] Isometric perspective toggle
- [ ] Sprite-based rendering for richer visuals
- [ ] WebSocket real-time updates
- [ ] Multiple source pipe styles for different integration kinds
- [ ] Custom layout persistence (drag to rearrange)
- [ ] Activity timeline / replay
- [ ] Disconnected subgraph clustering
