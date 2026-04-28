var Ot = Object.defineProperty;
var Ht = (n, e, t) => e in n ? Ot(n, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : n[e] = t;
var p = (n, e, t) => Ht(n, typeof e != "symbol" ? e + "" : e, t);
const jt = {
  cellSize: 25,
  panEnabled: !0,
  zoomEnabled: !0,
  zoomMin: 0.25,
  zoomMax: 4,
  originX: 0,
  originY: 0,
  gridVisible: !0,
  muted: !0
};
class Dt {
  constructor(e, t, o) {
    p(this, "panX", 0);
    p(this, "panY", 0);
    p(this, "zoom", 1);
    p(this, "isPanning", !1);
    p(this, "lastPointer", { x: 0, y: 0 });
    p(this, "world");
    p(this, "container");
    p(this, "config");
    p(this, "onPointerDown", (e) => {
      const t = e.target;
      t.closest("[data-entity-type]") || t.closest("[data-node-id]") || (this.isPanning = !0, this.lastPointer = { x: e.clientX, y: e.clientY }, this.world.classList.add("ff-world--panning"), this.container.setPointerCapture(e.pointerId));
    });
    p(this, "onPointerMove", (e) => {
      if (!this.isPanning) return;
      const t = e.clientX - this.lastPointer.x, o = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY }, this.panX += t, this.panY += o, this.applyTransform();
    });
    p(this, "onPointerUp", () => {
      this.isPanning = !1, this.world.classList.remove("ff-world--panning");
    });
    p(this, "onWheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) {
        this.panX -= e.deltaX, this.panY -= e.deltaY, this.applyTransform(), e.preventDefault();
        return;
      }
      e.preventDefault();
      const t = this.container.getBoundingClientRect(), o = e.clientX - t.left, s = e.clientY - t.top, i = e.deltaY < 0 ? 1.15 : 1 / 1.15, a = Math.min(
        this.config.zoomMax,
        Math.max(this.config.zoomMin, this.zoom * i)
      ), r = a / this.zoom;
      this.panX = o - r * (o - this.panX), this.panY = s - r * (s - this.panY), this.zoom = a, this.applyTransform();
    });
    this.container = e, this.world = t, this.config = o, this.panX = o.originX, this.panY = o.originY, o.panEnabled && (e.addEventListener("pointerdown", this.onPointerDown), e.addEventListener("pointermove", this.onPointerMove), e.addEventListener("pointerup", this.onPointerUp), e.addEventListener("pointerleave", this.onPointerUp)), o.zoomEnabled && e.addEventListener("wheel", this.onWheel, { passive: !1 }), this.applyTransform();
  }
  applyTransform() {
    this.world.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.zoom})`;
  }
  getZoom() {
    return this.zoom;
  }
  panTo(e, t) {
    this.panX = -e, this.panY = -t, this.applyTransform();
  }
  zoomTo(e) {
    this.zoom = Math.min(this.config.zoomMax, Math.max(this.config.zoomMin, e)), this.applyTransform();
  }
  fitToContent(e, t) {
    const o = this.container.getBoundingClientRect();
    if (o.width === 0 || o.height === 0 || e === 0 || t === 0) {
      this.zoom = 1, this.panX = 20, this.panY = 20, this.applyTransform();
      return;
    }
    const s = o.width / e, i = o.height / t;
    this.zoom = Math.min(
      this.config.zoomMax,
      Math.max(0.5, Math.min(s, i) * 0.85)
    ), this.panX = (o.width - e * this.zoom) / 2, this.panY = (o.height - t * this.zoom) / 2, this.applyTransform();
  }
  destroy() {
    this.container.removeEventListener("pointerdown", this.onPointerDown), this.container.removeEventListener("pointermove", this.onPointerMove), this.container.removeEventListener("pointerup", this.onPointerUp), this.container.removeEventListener("pointerleave", this.onPointerUp), this.container.removeEventListener("wheel", this.onWheel);
  }
}
const I = 25, X = 12;
function $(n) {
  return { x: n.gx * I, y: n.gy * I, w: n.gw * I, h: n.gh * I };
}
function L(n, e) {
  const t = n.gy + Math.floor(n.gh / 2), o = n.gx + Math.floor(n.gw / 2);
  switch (e) {
    case "left":
      return { x: n.gx * I, y: t * I + X };
    case "right":
      return { x: (n.gx + n.gw) * I, y: t * I + X };
    case "top":
      return { x: o * I + X, y: n.gy * I };
    case "bottom":
      return { x: o * I + X, y: (n.gy + n.gh) * I };
  }
}
function U(n) {
  return Math.round((n - X) / I) * I + X;
}
const F = 25, Mt = 12, Vt = 2, Gt = 4;
function Kt(n, e, t, o) {
  if (t)
    return Zt(n, e, o);
  const s = n.gy + n.gh <= e.gy, i = e.gy + e.gh <= n.gy;
  return s || i ? Qt(n, e, s) : Wt(n, e);
}
function Wt(n, e) {
  const t = L(n, "right"), o = L(e, "left"), s = { gx: n.gx + n.gw, gy: n.gy + Math.floor(n.gh / 2) }, i = { gx: e.gx - 1, gy: e.gy + Math.floor(e.gh / 2) };
  if (s.gy === i.gy)
    return j([s, i], "right", "right");
  const a = U((t.x + o.x) / 2), r = N(a);
  return j(
    [
      s,
      { gx: r, gy: s.gy },
      { gx: r, gy: i.gy },
      i
    ],
    "right",
    "right"
  );
}
function Qt(n, e, t) {
  const o = L(n, t ? "bottom" : "top"), s = L(e, t ? "top" : "bottom"), i = {
    gx: n.gx + Math.floor(n.gw / 2),
    gy: t ? n.gy + n.gh - 1 : n.gy - 1
  }, a = {
    gx: e.gx + Math.floor(e.gw / 2),
    gy: t ? e.gy - 1 : e.gy + e.gh
  };
  if (i.gx === a.gx)
    return j([i, a], t ? "down" : "up", t ? "down" : "up");
  const r = U((o.y + s.y) / 2), f = N(r), l = t ? "down" : "up", c = a.gx > i.gx ? "right" : "left";
  return j(
    [
      i,
      { gx: i.gx, gy: f },
      { gx: a.gx, gy: f },
      a
    ],
    l,
    l,
    c
  );
}
function Zt(n, e, t) {
  if ((t == null ? void 0 : t.kind) === "human-gate")
    return Jt(n, t);
  const o = Ct(n), s = L(e, "left"), i = U(
    Math.max(o.y, s.y) + Gt * F
  ), a = U(s.x - 2 * F), r = {
    gx: N(o.x),
    gy: n.gy + n.gh - 1
  }, f = {
    gx: e.gx - 1,
    gy: e.gy + Math.floor(e.gh / 2)
  };
  return j(
    [
      r,
      { gx: r.gx, gy: N(i) },
      { gx: N(a), gy: N(i) },
      { gx: N(a), gy: f.gy },
      f
    ],
    "down",
    "right"
  );
}
function Jt(n, e) {
  const t = Ct(n), o = N(t.x), s = n.gy + n.gh - 1, i = e.gy + Math.floor(e.gh / 2), a = e.gx, f = e.gx + e.gw - 1 + 1, l = a - 1, c = N(
    U(L(n, "left").x - 2 * F)
  ), h = n.gy + 1, u = n.gx - 1, x = [];
  for (let y = s; y <= i; y += 1)
    x.push({
      gx: o,
      gy: y,
      enter: "down",
      exit: y === i ? "left" : "down"
    });
  for (let y = o - 1; y >= f; y -= 1)
    x.push({
      gx: y,
      gy: i,
      enter: "left",
      exit: "left"
    });
  for (let y = l; y >= c; y -= 1)
    x.push({
      gx: y,
      gy: i,
      enter: "left",
      exit: y === c ? "up" : "left"
    });
  for (let y = i - 1; y >= h; y -= 1)
    x.push({
      gx: c,
      gy: y,
      enter: "up",
      exit: y === h ? "right" : "up"
    });
  for (let y = c + 1; y <= u; y += 1)
    x.push({
      gx: y,
      gy: h,
      enter: "right",
      exit: "right"
    });
  return x;
}
function Ct(n) {
  const e = L(n, "bottom"), t = (n.gx + n.gw - 1) * F + Mt;
  return {
    x: Math.min(e.x + Vt * F, t),
    y: e.y
  };
}
function j(n, e, t, o) {
  const s = te(n), i = [];
  for (let a = 0; a < s.length - 1; a += 1) {
    const r = s[a], f = s[a + 1], l = Math.sign(f.gx - r.gx), c = Math.sign(f.gy - r.gy);
    if (l !== 0 && c !== 0 || l === 0 && c === 0)
      continue;
    a === 0 && i.push(r);
    let h = r.gx, u = r.gy;
    for (; h !== f.gx || u !== f.gy; )
      h += l, u += c, i.push({ gx: h, gy: u });
  }
  return i.map((a, r) => {
    const f = r === 0 ? e : yt(i[r - 1], a) ?? e, l = r === i.length - 1 ? t : yt(a, i[r + 1]) ?? o ?? t;
    return {
      gx: a.gx,
      gy: a.gy,
      enter: f,
      exit: l
    };
  });
}
function te(n) {
  const e = [];
  for (const t of n) {
    const o = e[e.length - 1];
    (!o || o.gx !== t.gx || o.gy !== t.gy) && e.push(t);
  }
  return e;
}
function yt(n, e) {
  return e.gx > n.gx ? "right" : e.gx < n.gx ? "left" : e.gy > n.gy ? "down" : e.gy < n.gy ? "up" : null;
}
function N(n) {
  return Math.round((n - Mt) / F);
}
const A = 25, xt = A, ee = 0.5522847498, oe = A / 760;
class ne {
  constructor(e) {
    p(this, "cellLayer");
    p(this, "cells", /* @__PURE__ */ new Map());
    p(this, "animFrame", null);
    p(this, "animStart", 0);
    p(this, "reducedMotionQuery", null);
    p(this, "onReducedMotionChange", () => {
      var e;
      this.syncMotionPreference(), this.layoutMotion(
        rt(this.animStart, ((e = this.reducedMotionQuery) == null ? void 0 : e.matches) ?? !1)
      );
    });
    p(this, "tickMotion", () => {
      var e;
      this.animFrame = null, this.layoutMotion(rt(performance.now() - this.animStart, !1)), (((e = this.reducedMotionQuery) == null ? void 0 : e.matches) ?? !1) || (this.animFrame = requestAnimationFrame(this.tickMotion));
    });
    this.cellLayer = document.createElement("div"), this.cellLayer.classList.add("ff-belts"), this.cellLayer.style.position = "absolute", this.cellLayer.style.inset = "0", this.cellLayer.style.pointerEvents = "none", e.appendChild(this.cellLayer), typeof window < "u" && "matchMedia" in window && (this.reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)"), this.reducedMotionQuery.addEventListener("change", this.onReducedMotionChange)), this.animStart = performance.now(), this.syncMotionPreference();
  }
  update(e) {
    var s;
    const t = se(e), o = /* @__PURE__ */ new Set();
    for (const i of t) {
      const a = St(i.gx, i.gy);
      o.add(a);
      let r = this.cells.get(a);
      if (!r) {
        const f = document.createElement("div");
        f.classList.add("ff-belt-cell"), this.cellLayer.appendChild(f), r = vt(f, i), this.cells.set(a, r);
      }
      r.signature !== Pt(i) && (r.host.replaceChildren(), r = vt(r.host, i), this.cells.set(a, r)), r.host.className = [
        "ff-belt-cell",
        i.visualKind === "straight" ? "ff-belt-cell--straight" : "ff-belt-cell--corner"
      ].join(" "), r.host.classList.toggle("ff-belt-cell--active", i.isActive), r.host.classList.toggle("ff-belt-cell--degraded", i.isDegraded), r.host.style.width = `${xt}px`, r.host.style.height = `${xt}px`, r.host.style.left = `${i.gx * A}px`, r.host.style.top = `${i.gy * A}px`, r.host.style.transform = "";
    }
    for (const [i, a] of this.cells)
      o.has(i) || (a.host.remove(), this.cells.delete(i));
    this.layoutMotion(
      rt(performance.now() - this.animStart, ((s = this.reducedMotionQuery) == null ? void 0 : s.matches) ?? !1)
    );
  }
  destroy() {
    var e;
    this.animFrame !== null && cancelAnimationFrame(this.animFrame), (e = this.reducedMotionQuery) == null || e.removeEventListener("change", this.onReducedMotionChange), this.cellLayer.remove();
  }
  layoutMotion(e) {
    var t;
    for (const o of this.cells.values()) {
      const s = (t = this.reducedMotionQuery) != null && t.matches ? o.motionLength * 0.5 : At(e, o.motionLength);
      ue(o.motionPath, o.motionLength, o.motionArrow, s);
    }
  }
  syncMotionPreference() {
    var t;
    if (((t = this.reducedMotionQuery) == null ? void 0 : t.matches) ?? !1) {
      this.animFrame !== null && (cancelAnimationFrame(this.animFrame), this.animFrame = null);
      return;
    }
    this.animFrame === null && (this.animFrame = requestAnimationFrame(this.tickMotion));
  }
}
function se(n) {
  const e = /* @__PURE__ */ new Map();
  for (const t of n.edges.values()) {
    const o = n.nodes.get(t.from), s = n.nodes.get(t.to);
    if (!o || !s || !pe(t.kind) || o.kind === "human-gate" || s.kind === "human-gate" || s.kind === "source") continue;
    const i = [...n.edges.values()].some(
      (c) => c.kind === "retry" && c.from === t.to && c.to === t.from
    ), a = t.kind === "retry" && i && o.gy >= s.gy, r = a ? ie(n, o) : null, f = Kt(o, s, a, r), l = he(t, n);
    for (const c of f) {
      const h = St(c.gx, c.gy), u = e.get(h) ?? [];
      u.push({
        enter: c.enter,
        exit: c.exit,
        isActive: l,
        status: t.status,
        edgeKind: t.kind
      }), e.set(h, u);
    }
  }
  return [...e.entries()].map(([t, o]) => re(t, o)).sort((t, o) => t.gy - o.gy || t.gx - o.gx);
}
function ie(n, e) {
  return [...n.nodes.values()].find(
    (t) => t.kind === "human-gate" && t.gx >= e.gx && t.gx + t.gw <= e.gx + e.gw && t.gy > e.gy
  ) ?? null;
}
function re(n, e) {
  const [t, o] = n.split(":").map(Number), s = ae(e);
  return {
    gx: t,
    gy: o,
    enter: s.enter,
    exit: s.exit,
    incomingSide: zt(s.enter),
    outgoingSide: Rt(s.exit),
    visualKind: ce(s.enter, s.exit),
    isActive: e.some((i) => i.isActive),
    isDegraded: e.some((i) => i.status === "degraded" || i.status === "down")
  };
}
function ae(n) {
  const e = n.filter((t) => Tt(t.enter, t.exit) !== null).sort((t, o) => Q(t) - Q(o));
  return e.length > 0 ? e[0] : [...n].sort((t, o) => Q(t) - Q(o))[0];
}
function Q(n) {
  const e = n.isActive ? 0 : 10, t = n.edgeKind === "flow" ? 0 : n.edgeKind === "handoff" ? 1 : 2;
  return e + t;
}
function vt(n, e) {
  const t = e.visualKind === "straight" ? fe(e.incomingSide, e.outgoingSide) : de(e.incomingSide, e.outgoingSide);
  return n.appendChild(t.svg), {
    host: n,
    motionArrow: t.motionArrow,
    motionPath: t.motionPath,
    motionLength: t.motionPath.getTotalLength(),
    signature: Pt(e)
  };
}
function lt(n) {
  return document.createElementNS("http://www.w3.org/2000/svg", n);
}
function fe(n, e) {
  const t = Nt(), o = Xt(n, e), s = o === "horizontal" ? "M -1 12.5 H 26" : "M 12.5 -1 V 26", i = C(ge(n, e), "none", 0, {
    opacity: "0"
  }), a = 3.75, r = o === "horizontal" ? [`M -1 ${12.5 - a} H 26`, `M -1 ${12.5 + a} H 26`] : [`M ${12.5 - a} -1 V 26`, `M ${12.5 + a} -1 V 26`];
  t.appendChild(C(s, "var(--ff-belt-shadow)", 19, {
    opacity: "0.2"
  })), t.appendChild(C(s, "var(--ff-belt-bed)", 17)), t.appendChild(C(s, "var(--ff-belt-rail)", 13)), t.appendChild(C(s, "var(--ff-belt-lane)", 9));
  for (const l of r)
    t.appendChild(C(l, "none", 0, {
      stroke: "var(--ff-belt-divider)",
      strokeWidth: "1",
      opacity: "0.68"
    }));
  t.appendChild(i);
  const f = $t();
  return t.appendChild(f), {
    svg: t,
    motionPath: i,
    motionArrow: f
  };
}
function de(n, e) {
  const t = Nt(), o = Z(n, e, 12.5), s = [
    Z(n, e, 8.75),
    Z(n, e, 16.25)
  ], i = C(Z(n, e, 12.5), "none", 0, {
    opacity: "0"
  });
  t.appendChild(C(o, "var(--ff-belt-shadow)", 19, {
    opacity: "0.2",
    strokeLinejoin: "round"
  })), t.appendChild(C(o, "var(--ff-belt-bed)", 17, {
    strokeLinejoin: "round"
  })), t.appendChild(C(o, "var(--ff-belt-rail)", 13, {
    strokeLinejoin: "round"
  })), t.appendChild(C(o, "var(--ff-belt-lane)", 9, {
    strokeLinejoin: "round"
  }));
  for (const r of s)
    t.appendChild(C(r, "none", 0, {
      stroke: "var(--ff-belt-divider)",
      strokeWidth: "1",
      opacity: "0.7",
      strokeLinejoin: "round"
    }));
  t.appendChild(i);
  const a = $t();
  return t.appendChild(a), {
    svg: t,
    motionPath: i,
    motionArrow: a
  };
}
function $t() {
  const n = lt("polygon");
  return n.setAttribute("class", "ff-belt-cell__arrow"), n.setAttribute("points", "1.6,0 -4.8,-3.5 -3.1,0 -4.8,3.5"), n.setAttribute("fill", "var(--ff-belt-motion)"), n.setAttribute("stroke", "rgba(34, 28, 22, 0.72)"), n.setAttribute("stroke-width", "0.9"), n.setAttribute("stroke-linecap", "round"), n.setAttribute("stroke-linejoin", "round"), n;
}
function Nt() {
  const n = lt("svg");
  return n.setAttribute("viewBox", `0 0 ${A} ${A}`), n.setAttribute("width", String(A)), n.setAttribute("height", String(A)), n.classList.add("ff-belt-cell__svg"), n;
}
function C(n, e, t, o) {
  const s = lt("path");
  if (s.setAttribute("d", n), s.setAttribute("fill", "none"), t > 0 && (s.setAttribute("stroke", e), s.setAttribute("stroke-width", String(t)), s.setAttribute("stroke-linecap", "butt")), o)
    for (const [i, a] of Object.entries(o))
      s.setAttribute(i, a);
  return s;
}
function ce(n, e) {
  return Tt(n, e) !== null ? "straight" : le(n, e) ? "corner-right" : "corner-left";
}
function le(n, e) {
  switch (`${n}->${e}`) {
    case "up->right":
    case "right->down":
    case "down->left":
    case "left->up":
      return !0;
    default:
      return !1;
  }
}
function he(n, e) {
  var i;
  const t = [...e.items.values()].some(
    (a) => a.currentEdgeId === n.id
  ), o = e.nodes.get(n.from), s = o && (((i = o.node.counts) == null ? void 0 : i.totalItems) ?? 0) > 0;
  return t || !!s;
}
function pe(n) {
  return n === "flow" || n === "handoff" || n === "retry";
}
function rt(n, e) {
  return e ? 0 : n * oe;
}
function St(n, e) {
  return `${n}:${e}`;
}
function At(n, e) {
  return (n % e + e) % e;
}
function ue(n, e, t, o) {
  const s = At(o, e), i = n.getPointAtLength(s), a = n.getPointAtLength(Math.min(s + 0.6, e)), r = Math.atan2(a.y - i.y, a.x - i.x) * 180 / Math.PI;
  t.setAttribute(
    "transform",
    `translate(${i.x}, ${i.y}) rotate(${r})`
  );
}
function Pt(n) {
  return `${n.visualKind}:${n.incomingSide}->${n.outgoingSide}`;
}
function zt(n) {
  switch (n) {
    case "up":
      return "bottom";
    case "right":
      return "left";
    case "down":
      return "top";
    case "left":
      return "right";
  }
}
function Rt(n) {
  switch (n) {
    case "up":
      return "top";
    case "right":
      return "right";
    case "down":
      return "bottom";
    case "left":
      return "left";
  }
}
function Tt(n, e) {
  return Xt(zt(n), Rt(e));
}
function Xt(n, e) {
  return n === "left" && e === "right" || n === "right" && e === "left" ? "horizontal" : n === "top" && e === "bottom" || n === "bottom" && e === "top" ? "vertical" : null;
}
function ge(n, e) {
  const t = wt(n, 0), o = wt(e, 0);
  return `M ${t.x} ${t.y} L ${o.x} ${o.y}`;
}
function Z(n, e, t) {
  const o = me(n, e), s = _t(n, o, t), i = _t(e, o, t), a = t * ee, r = bt(s, ye(n), a), f = bt(i, ve(xe(e)), a);
  return `M ${s.x} ${s.y} C ${r.x} ${r.y} ${f.x} ${f.y} ${i.x} ${i.y}`;
}
function wt(n, e) {
  switch (n) {
    case "top":
      return { x: 12.5, y: e };
    case "right":
      return { x: 25 - e, y: 12.5 };
    case "bottom":
      return { x: 12.5, y: 25 - e };
    case "left":
      return { x: e, y: 12.5 };
  }
}
function me(n, e) {
  const t = n === "top" || e === "top", o = n === "right" || e === "right", s = n === "bottom" || e === "bottom", i = n === "left" || e === "left";
  return t && i ? { x: 0, y: 0 } : t && o ? { x: 25, y: 0 } : s && o ? { x: 25, y: 25 } : s && i ? { x: 0, y: 25 } : { x: 12.5, y: 12.5 };
}
function _t(n, e, t) {
  switch (n) {
    case "top":
      return { x: e.x === 0 ? t : e.x - t, y: 0 };
    case "right":
      return { x: 25, y: e.y === 0 ? t : e.y - t };
    case "bottom":
      return { x: e.x === 0 ? t : e.x - t, y: 25 };
    case "left":
      return { x: 0, y: e.y === 0 ? t : e.y - t };
  }
}
function ye(n) {
  switch (n) {
    case "top":
      return { x: 0, y: 1 };
    case "right":
      return { x: -1, y: 0 };
    case "bottom":
      return { x: 0, y: -1 };
    case "left":
      return { x: 1, y: 0 };
  }
}
function xe(n) {
  switch (n) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
}
function bt(n, e, t) {
  return {
    x: n.x + e.x * t,
    y: n.y + e.y * t
  };
}
function ve(n) {
  return { x: -n.x, y: -n.y };
}
const we = "" + new URL("assets/claude-BIhNfWP_.svg", import.meta.url).href, _e = "" + new URL("assets/codex-B-IJAY5s.svg", import.meta.url).href, be = "" + new URL("assets/drone-base-neutral-DkpyV6gt.png", import.meta.url).href, ke = "" + new URL("assets/drone-rotor-left-DF-dmKCc.png", import.meta.url).href, Ee = "" + new URL("assets/drone-rotor-right-2pKbVBat.png", import.meta.url).href, Ie = "" + new URL("assets/overlay-role-general-CpFlHW5U.png", import.meta.url).href, Le = "" + new URL("assets/overlay-role-planner-BOCv_Hy9.png", import.meta.url).href, Me = "" + new URL("assets/overlay-role-triage-BsD1O3sm.png", import.meta.url).href, Ce = "" + new URL("assets/overlay-role-ui-DuMeWtB4.png", import.meta.url).href, $e = "" + new URL("assets/pile-merged-ChogZ4-m.png", import.meta.url).href, Ne = "" + new URL("assets/pile-rejected-5jqxDZ0Q.png", import.meta.url).href, Se = "" + new URL("assets/station-execution-B6tRBMVU.png", import.meta.url).href, Ae = "" + new URL("assets/station-intake-BepqQgRl.png", import.meta.url).href, Pe = "" + new URL("assets/station-triage-CkB3LDSo.png", import.meta.url).href, ze = "" + new URL("assets/watchdog-idle-BcXWac74.png", import.meta.url).href, Re = "" + new URL("assets/watchdog-spraying-Sfpc8TMX.png", import.meta.url).href;
function Te(n) {
  if (n.id === "execution")
    return Se;
  if (n.id === "triage-planning")
    return Pe;
  if (n.id === "completed")
    return $e;
  if (n.id === "rejected")
    return Ne;
  switch (n.kind) {
    case "source":
      return Ae;
    default:
      return null;
  }
}
function Ut(n) {
  return {
    base: be,
    rotorLeft: ke,
    rotorRight: Ee,
    providerOverlay: Xe(n.provider),
    roleOverlay: Ue(n)
  };
}
function ct(n) {
  return n ? Re : ze;
}
function Xe(n) {
  const e = String(n ?? "").trim().toLowerCase();
  return e === "codex" || e === "openai" || e === "chatgpt" || e === "gpt" ? _e : e === "claude" || e === "anthropic" ? we : null;
}
function Ue(n) {
  var s;
  const e = String(n.role ?? "").trim().toLowerCase(), t = (s = n.extensions) == null ? void 0 : s.openreactor, o = `${n.label} ${String((t == null ? void 0 : t.toolLabel) ?? "")}`.toLowerCase();
  return o.includes("triage") ? Me : e === "ui" ? Ce : e === "planning" || o.includes("planner") ? Le : e === "general" ? Ie : null;
}
const J = 25;
class Fe {
  constructor(e) {
    p(this, "container");
    p(this, "nodeEls", /* @__PURE__ */ new Map());
    p(this, "actorEls", /* @__PURE__ */ new Map());
    p(this, "watchdogEl", null);
    p(this, "watchMarkers", /* @__PURE__ */ new Map());
    p(this, "watchdogRestX", 0);
    p(this, "watchdogRestY", 0);
    p(this, "watchdogTargetNodeId", null);
    this.container = document.createElement("div"), this.container.classList.add("ff-entities"), this.container.style.position = "absolute", this.container.style.inset = "0", e.appendChild(this.container);
  }
  update(e) {
    this.renderNodes(e), this.renderActors(e), this.renderWatchdog(e), this.applyWatchMarkers(e), this.applyIncidents(e);
  }
  renderNodes(e) {
    const t = /* @__PURE__ */ new Set(), o = qe(e);
    for (const [s, i] of e.nodes) {
      if (i.kind === "supervisor" || i.kind === "queue" || o.has(s)) continue;
      t.add(s);
      let a = this.nodeEls.get(s);
      a || (a = Oe(i), this.container.appendChild(a), this.nodeEls.set(s, a)), He(a, i);
    }
    for (const [s, i] of this.nodeEls)
      t.has(s) || (i.remove(), this.nodeEls.delete(s));
  }
  renderActors(e) {
    const t = /* @__PURE__ */ new Set();
    for (const [o, s] of e.actors) {
      t.add(o);
      let i = this.actorEls.get(o);
      i || (i = je(s), this.container.appendChild(i), this.actorEls.set(o, i)), De(i, s, e);
    }
    for (const [o, s] of this.actorEls)
      t.has(o) || (s.remove(), this.actorEls.delete(o));
  }
  renderWatchdog(e) {
    var c;
    const t = [...e.nodes.values()].find((h) => h.kind === "supervisor");
    if (!t) {
      (c = this.watchdogEl) == null || c.remove(), this.watchdogEl = null;
      return;
    }
    this.watchdogEl || (this.watchdogEl = Be(), this.container.appendChild(this.watchdogEl));
    const o = [...e.services.values()].find(
      (h) => h.id === "watchdog" || h.label.toLowerCase().includes("watchdog")
    ), s = o ? o.status === "healthy" : t.status === "healthy", i = o ? o.status === "down" || !o.active : t.status === "down";
    this.watchdogEl.classList.toggle("ff-watchdog--healthy", s && !this.watchdogTargetNodeId), this.watchdogEl.classList.toggle("ff-watchdog--degraded", !s && !i), this.watchdogEl.classList.toggle("ff-watchdog--down", i);
    const a = kt(e);
    let r = 0, f = 0;
    for (const h of a) {
      const u = e.nodes.get(h);
      if (u) {
        const x = $(u);
        r = Math.max(r, x.x + x.w), f = Math.max(f, x.y + x.h);
      }
    }
    if (r === 0) {
      const h = $(t);
      r = h.x, f = h.y;
    }
    this.watchdogRestX = r + J * 6, this.watchdogRestY = f + J * 3;
    const l = Ye(e, a);
    if (l && !i) {
      const h = e.nodes.get(l);
      if (h) {
        const u = $(h), x = u.x + u.w + 2, y = u.y;
        this.watchdogTargetNodeId !== l && (this.watchdogTargetNodeId = l, this.watchdogEl.classList.add("ff-watchdog--responding")), this.watchdogEl.classList.add("ff-watchdog--spraying");
        const w = this.watchdogEl.querySelector(".ff-watchdog__sprite");
        w && (w.src = ct(!0)), this.watchdogEl.style.transform = `translate(${x}px, ${y}px)`;
      }
    } else {
      this.watchdogTargetNodeId && (this.watchdogTargetNodeId = null, this.watchdogEl.classList.remove("ff-watchdog--responding")), this.watchdogEl.classList.remove("ff-watchdog--spraying");
      const h = this.watchdogEl.querySelector(".ff-watchdog__sprite");
      h && (h.src = ct(!1)), this.watchdogEl.style.transform = `translate(${this.watchdogRestX}px, ${this.watchdogRestY}px)`;
    }
  }
  applyWatchMarkers(e) {
    const t = kt(e), o = [...e.services.values()].find(
      (a) => a.id === "watchdog" || a.label.toLowerCase().includes("watchdog")
    ), s = o ? o.status === "down" || !o.active : !1, i = /* @__PURE__ */ new Set();
    for (const a of t) {
      i.add(a);
      const r = this.nodeEls.get(a);
      if (!r) continue;
      let f = this.watchMarkers.get(a);
      f || (f = document.createElement("div"), f.classList.add("ff-watch-marker"), f.innerHTML = '<svg viewBox="0 0 24 16" width="16" height="11"><path d="M12 2C6 2 1.5 8 1.5 8s4.5 6 10.5 6 10.5-6 10.5-6S18 2 12 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>', r.appendChild(f), this.watchMarkers.set(a, f)), f.classList.toggle("ff-watch-marker--down", s);
    }
    for (const [a, r] of this.watchMarkers)
      i.has(a) || (r.remove(), this.watchMarkers.delete(a));
  }
  applyIncidents(e) {
    var t;
    for (const o of this.nodeEls.values())
      o.classList.remove("ff-incident--info", "ff-incident--warning", "ff-incident--error", "ff-incident--critical"), (t = o.querySelector(".ff-incident-badge")) == null || t.remove();
    for (const o of e.incidents.values())
      if (o.status !== "resolved")
        for (const s of o.scope.nodeIds ?? []) {
          const i = this.nodeEls.get(s);
          i && (i.classList.add(`ff-incident--${o.severity}`), Ge(i, o));
        }
  }
  destroy() {
    this.container.remove();
  }
}
function qe(n) {
  const e = /* @__PURE__ */ new Set();
  for (const [t, o] of n.nodes) {
    const s = [...n.edges.values()].some(
      (a) => (a.from === t || a.to === t) && a.kind !== "retry"
    ), i = [...n.edges.values()].some(
      (a) => (a.from === t || a.to === t) && a.kind === "retry"
    );
    !s && i && e.add(t);
  }
  return e;
}
function kt(n) {
  const e = /* @__PURE__ */ new Set();
  for (const t of n.edges.values())
    if (t.kind === "control") {
      const o = n.nodes.get(t.from);
      if ((o == null ? void 0 : o.kind) === "supervisor") {
        e.add(t.to);
        for (const s of n.edges.values())
          (s.kind === "handoff" || s.kind === "retry") && s.to === t.to && e.add(s.from);
      }
    }
  for (const t of n.edges.values())
    if (t.kind === "retry") {
      const o = n.nodes.get(t.from);
      (o == null ? void 0 : o.kind) === "processor" && e.add(t.from);
    }
  return e;
}
function Ye(n, e) {
  let t = null;
  const o = { critical: 4, error: 3, warning: 2, info: 1 };
  for (const s of n.incidents.values()) {
    if (s.status === "resolved") continue;
    const i = o[s.severity] ?? 0;
    for (const a of s.scope.nodeIds ?? []) {
      let r = a;
      const f = n.nodes.get(a);
      if (f && f.kind === "queue") {
        for (const l of n.edges.values())
          if ((l.kind === "handoff" || l.kind === "retry") && l.to === a) {
            const c = n.nodes.get(l.from);
            if ((c == null ? void 0 : c.kind) === "processor") {
              r = l.from;
              break;
            }
          }
      }
      e.has(r) && (!t || i > t.severity) && (t = { nodeId: r, severity: i });
    }
  }
  return (t == null ? void 0 : t.nodeId) ?? null;
}
function Be() {
  const n = document.createElement("div");
  return n.classList.add("ff-watchdog"), n.dataset.nodeKind = "supervisor", n.innerHTML = `
    <div class="ff-watchdog__robot">
      <img class="ff-watchdog__sprite" src="${ct(!1)}" alt="" draggable="false" />
      <div class="ff-watchdog__status"></div>
      <div class="ff-watchdog__spray">
        <div class="ff-watchdog__spray-particle"></div>
        <div class="ff-watchdog__spray-particle"></div>
        <div class="ff-watchdog__spray-particle"></div>
        <div class="ff-watchdog__spray-particle"></div>
        <div class="ff-watchdog__spray-particle"></div>
      </div>
    </div>
    <div class="ff-watchdog__label">Watchdog</div>
  `, n;
}
function Oe(n) {
  var a;
  const e = document.createElement("div");
  e.classList.add("ff-entity", "ff-node", `ff-node--${n.kind}`), e.dataset.nodeId = n.id, e.dataset.nodeKind = n.kind;
  const t = document.createElement("div");
  t.classList.add("ff-node__body");
  const o = Te(n);
  if (o) {
    e.classList.add("ff-node--sprite"), t.classList.add("ff-node__body--sprite");
    const r = document.createElement("img");
    r.classList.add("ff-node__sprite"), r.src = o, r.alt = "", r.draggable = !1, t.appendChild(r);
  } else if (n.kind === "processor") {
    const r = ((a = n.node.capacity) == null ? void 0 : a.maxConcurrency) ?? 3, f = document.createElement("div");
    f.classList.add("ff-node__seats");
    for (let l = 0; l < r; l++) {
      const c = document.createElement("div");
      c.classList.add("ff-node__seat"), f.appendChild(c);
    }
    t.appendChild(f);
  } else if (n.kind !== "human-gate") {
    const r = document.createElement("div");
    r.classList.add("ff-node__icon"), r.textContent = Ke(n.kind), t.appendChild(r);
  }
  const s = document.createElement("span");
  s.classList.add("ff-node__label"), s.textContent = n.label, t.appendChild(s), e.appendChild(t);
  const i = document.createElement("div");
  return i.classList.add("ff-entity__badge"), e.appendChild(i), e;
}
function He(n, e, t) {
  var a;
  const o = $(e);
  n.style.transform = `translate(${o.x}px, ${o.y}px)`, n.style.width = `${o.w}px`, n.style.height = `${o.h}px`;
  const s = ((a = e.node.counts) == null ? void 0 : a.totalItems) ?? 0;
  n.classList.toggle("ff-node--active", e.status === "healthy" && s > 0), n.classList.toggle("ff-node--degraded", e.status === "degraded"), n.classList.toggle("ff-node--down", e.status === "down"), n.classList.toggle("ff-node--idle", e.status === "healthy" && s === 0);
  const i = n.querySelector(".ff-entity__badge");
  i && (i.textContent = s > 0 ? String(s) : "", i.style.display = s > 0 ? "" : "none"), n.querySelector(".ff-node__label").textContent = e.label;
}
function je(n) {
  const e = document.createElement("div");
  e.classList.add("ff-drone"), e.dataset.actorId = n.id;
  const t = Ut(n);
  return e.innerHTML = `
    <div class="ff-drone__unit">
      <div class="ff-drone__sprite-stack">
        <img class="ff-drone__sprite ff-drone__sprite--base" src="${t.base}" alt="" draggable="false" />
        <img class="ff-drone__sprite ff-drone__sprite--rotor-left" src="${t.rotorLeft}" alt="" draggable="false" />
        <img class="ff-drone__sprite ff-drone__sprite--rotor-right" src="${t.rotorRight}" alt="" draggable="false" />
        <img class="ff-drone__sprite ff-drone__sprite--provider" src="${t.providerOverlay ?? ""}" alt="" draggable="false" />
        <img class="ff-drone__sprite ff-drone__sprite--role" src="${t.roleOverlay ?? ""}" alt="" draggable="false" />
      </div>
      <div class="ff-drone__shadow"></div>
    </div>
    <div class="ff-drone__label"></div>
  `, e;
}
function De(n, e, t) {
  var a;
  n.className = `ff-drone ff-drone--${e.status}`, e.role && n.classList.add(`ff-drone--role-${e.role}`);
  const o = (a = e.extensions) == null ? void 0 : a.openreactor;
  o != null && o.providerFallback && n.classList.add("ff-drone--fallback"), n.dataset.actorId = e.id, n.dataset.provider = e.provider ?? "";
  const s = Ut(e);
  B(n, ".ff-drone__sprite--base", s.base), B(n, ".ff-drone__sprite--rotor-left", s.rotorLeft), B(n, ".ff-drone__sprite--rotor-right", s.rotorRight), B(n, ".ff-drone__sprite--provider", s.providerOverlay), B(n, ".ff-drone__sprite--role", s.roleOverlay);
  const i = n.querySelector(".ff-drone__label");
  if (i.textContent = e.provider ?? e.label, e.currentNodeId) {
    const r = t.nodes.get(e.currentNodeId);
    if (r) {
      const f = Ve(e, r, t);
      n.style.transform = `translate(${f.x}px, ${f.y}px)`;
    }
  }
}
function Ve(n, e, t) {
  var h;
  const o = $(e), s = ((h = e.node.capacity) == null ? void 0 : h.maxConcurrency) ?? 3, a = [...t.actors.values()].filter(
    (u) => u.currentNodeId === e.id
  ).indexOf(n), r = Math.max(0, a), f = J * 2, l = s * f;
  return {
    x: o.x + (o.w - l) / 2 + r * f,
    y: o.y - J
  };
}
function Ge(n, e) {
  if (n.querySelector(`.ff-incident-badge[data-incident-id="${e.id}"]`)) return;
  const t = document.createElement("div");
  t.classList.add("ff-incident-badge", `ff-incident-badge--${e.severity}`), t.dataset.incidentId = e.id, t.textContent = `⚠ ${e.label}`, n.appendChild(t);
}
function B(n, e, t) {
  const o = n.querySelector(e);
  if (o) {
    if (t) {
      o.src = t, o.style.display = "";
      return;
    }
    o.removeAttribute("src"), o.style.display = "none";
  }
}
function Ke(n) {
  switch (n) {
    case "source":
      return "▸";
    case "processor":
      return "⚙";
    case "queue":
      return "☰";
    case "router":
      return "⑂";
    case "sink":
      return "✓";
    case "supervisor":
      return "🔧";
    case "human-gate":
      return "✋";
    case "store":
      return "▪";
    case "scheduler":
      return "⏱";
    case "integration":
      return "⇄";
    default:
      return "●";
  }
}
function Ft(n) {
  var s;
  const e = n.kind.trim().toLowerCase();
  if (e === "pull-request" || e === "pull_request" || e === "pullrequest" || e === "pr")
    return "pull-request";
  const t = (s = n.extensions) == null ? void 0 : s.openreactor, o = String((t == null ? void 0 : t.artifactKind) ?? "").trim().toLowerCase();
  return o === "pull-request" || o === "pull_request" || o === "pullrequest" || o === "pr" || t != null && t.ciPending || t != null && t.pullRequestUrl || t != null && t.prUrl ? "pull-request" : "issue";
}
const _ = 25, q = 12, R = 21, v = Math.floor((_ - R) / 2), z = 5, We = 3;
class Qe {
  constructor(e) {
    p(this, "container");
    p(this, "tokenEls", /* @__PURE__ */ new Map());
    p(this, "stackEls", /* @__PURE__ */ new Map());
    p(this, "sinkLabelEls", /* @__PURE__ */ new Map());
    p(this, "prevNodeMap", /* @__PURE__ */ new Map());
    p(this, "activeAnims", /* @__PURE__ */ new Map());
    p(this, "animFrame", null);
    p(this, "state", null);
    this.container = document.createElement("div"), this.container.classList.add("ff-tokens"), this.container.style.position = "absolute", this.container.style.inset = "0", e.appendChild(this.container);
  }
  update(e) {
    this.state, this.state = e;
    const t = /* @__PURE__ */ new Set();
    for (const [o, s] of e.items) {
      t.add(o);
      let i = this.tokenEls.get(o);
      i || (i = fo(s), this.container.appendChild(i), this.tokenEls.set(o, i)), co(i, s);
      const a = this.prevNodeMap.get(o), r = s.currentNodeId;
      if (a && r && a !== r && !this.activeAnims.has(o)) {
        const f = so(a, r, e);
        f.length >= 2 ? this.startTransit(o, f) : this.positionToken(i, s, e);
      } else this.activeAnims.has(o) || this.positionToken(i, s, e);
      this.prevNodeMap.set(o, r ?? "");
    }
    for (const [o, s] of this.tokenEls)
      t.has(o) || (s.remove(), this.tokenEls.delete(o), this.prevNodeMap.delete(o), this.activeAnims.delete(o));
    this.updateStacks(e), this.updateSinkLabels(e), this.activeAnims.size > 0 && this.animFrame === null && (this.animFrame = requestAnimationFrame(() => this.tickAnims()));
  }
  updateStacks(e) {
    const t = /* @__PURE__ */ new Set();
    for (const [o, s] of e.nodes) {
      const i = qt(o, e), a = i.length;
      if (a <= z) {
        for (const c of i) {
          const h = this.tokenEls.get(c.id);
          h && (h.style.display = "");
        }
        continue;
      }
      t.add(o);
      for (let c = 0; c < i.length; c++) {
        const h = this.tokenEls.get(i[c].id);
        h && (c >= z ? h.style.display = "none" : h.style.display = "");
      }
      const r = a - z;
      let f = this.stackEls.get(o);
      f || (f = document.createElement("div"), f.classList.add("ff-token-stack"), this.container.appendChild(f), this.stackEls.set(o, f)), f.innerHTML = `
        <div class="ff-token-stack__cards">
          <div class="ff-token-stack__card"></div>
          <div class="ff-token-stack__card"></div>
          <div class="ff-token-stack__card"></div>
        </div>
        <div class="ff-token-stack__count">+${r}</div>
      `, f.className = `ff-token-stack ff-token-stack--${Ft(i[0])}`;
      const l = eo(s);
      f.style.transform = `translate(${l.x}px, ${l.y}px)`;
    }
    for (const [o, s] of this.stackEls)
      t.has(o) || (s.remove(), this.stackEls.delete(o));
  }
  positionToken(e, t, o) {
    var l;
    if (!t.currentNodeId) return;
    e.classList.remove("ff-token--belt"), e.classList.remove("ff-token--static");
    const s = at(t, o), i = o.nodes.get(s);
    if (!i) return;
    if (e.style.display = "", i.kind === "sink") {
      e.classList.add("ff-token--static");
      const c = oo(i, t, o);
      if (!c) {
        e.style.display = "none";
        return;
      }
      e.style.transform = `translate(${c.x}px, ${c.y}px)`;
      return;
    }
    if (t.state === "paused" || t.state === "waiting" || t.state === "blocked") {
      if (i.kind === "human-gate") {
        e.classList.add("ff-token--static");
        const w = $(i), Y = [...o.items.values()].filter(
          (S) => (S.state === "paused" || S.state === "waiting" || S.state === "blocked") && at(S, o) === s
        ), D = Y.indexOf(t);
        if (Y.length <= 1) {
          e.style.transform = `translate(${w.x + Math.round((w.w - R) / 2)}px, ${w.y + Math.round((w.h - R) / 2)}px)`;
          return;
        }
        const ot = D % 2, V = Math.floor(D / 2);
        e.style.transform = `translate(${w.x + 11 + ot * 22}px, ${w.y + 11 + V * 22}px)`;
        return;
      }
      const c = $(i);
      e.classList.add("ff-token--static");
      const u = [...o.items.values()].filter(
        (w) => (w.state === "paused" || w.state === "waiting" || w.state === "blocked") && at(w, o) === s
      ).indexOf(t), x = u % 4, y = Math.floor(u / 4);
      e.style.transform = `translate(${c.x + x * _ + v}px, ${c.y + c.h + _ + y * _ + v}px)`;
      return;
    }
    if (t.assignedActorId) {
      const c = o.actors.get(t.assignedActorId);
      if (c != null && c.currentNodeId) {
        const h = o.nodes.get(c.currentNodeId);
        if (h) {
          e.classList.add("ff-token--static");
          const u = no(c, h, o);
          e.style.transform = `translate(${u.x}px, ${u.y}px)`;
          return;
        }
      }
    }
    const r = (l = t.extensions) == null ? void 0 : l.openreactor;
    if (r != null && r.ciPending) {
      e.classList.add("ff-token--belt");
      const c = Je(i, t, o);
      e.style.transform = `translate(${c.x}px, ${c.y}px)`;
      return;
    }
    e.classList.add("ff-token--belt");
    const f = to(i, t, o);
    e.style.transform = `translate(${f.x}px, ${f.y}px)`;
  }
  startTransit(e, t) {
    let o = 0;
    for (let r = 1; r < t.length; r++)
      o += Math.hypot(
        t[r].x - t[r - 1].x,
        t[r].y - t[r - 1].y
      );
    const i = Math.max(400, o / 150 * 1e3);
    this.activeAnims.set(e, {
      itemId: e,
      pathPoints: t,
      totalLength: o,
      startTime: performance.now(),
      duration: i
    });
    const a = this.tokenEls.get(e);
    a && (a.classList.add("ff-token--transit"), a.classList.add("ff-token--belt"), a.classList.remove("ff-token--static"), a.style.transition = "none");
  }
  tickAnims() {
    this.animFrame = null;
    const e = performance.now(), t = [];
    for (const [o, s] of this.activeAnims) {
      const i = this.tokenEls.get(o);
      if (!i) {
        t.push(o);
        continue;
      }
      const a = e - s.startTime, r = Math.min(1, a / s.duration), f = r < 1 ? r * (2 - r) : 1, l = ao(s.pathPoints, s.totalLength, f);
      if (i.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px)`, r >= 1 && (t.push(o), i.classList.remove("ff-token--transit"), i.style.transition = "", this.state)) {
        const c = this.state.items.get(o);
        c && this.positionToken(i, c, this.state);
      }
    }
    for (const o of t)
      this.activeAnims.delete(o);
    this.activeAnims.size > 0 && (this.animFrame = requestAnimationFrame(() => this.tickAnims()));
  }
  updateSinkLabels(e) {
    const t = /* @__PURE__ */ new Set();
    for (const [o, s] of e.nodes) {
      if (s.kind !== "sink") continue;
      t.add(o);
      const i = [...e.items.values()].filter(
        (l) => l.currentNodeId === o
      );
      let a = this.sinkLabelEls.get(o);
      a || (a = document.createElement("div"), a.classList.add("ff-sink-label"), this.container.appendChild(a), this.sinkLabelEls.set(o, a));
      const r = $(s);
      a.style.transform = `translate(${r.x}px, ${r.y + _ + v}px)`;
      const f = s.label || o;
      a.textContent = i.length > 0 ? `${f} (${i.length})` : f;
    }
    for (const [o, s] of this.sinkLabelEls)
      t.has(o) || (s.remove(), this.sinkLabelEls.delete(o));
  }
  destroy() {
    this.animFrame !== null && cancelAnimationFrame(this.animFrame), this.container.remove();
  }
}
function at(n, e) {
  if (!n.currentNodeId) return "";
  const t = e.nodes.get(n.currentNodeId);
  if (!t) return n.currentNodeId;
  if (t.kind === "queue") {
    for (const o of e.edges.values())
      if ((o.kind === "retry" || o.kind === "handoff" || o.kind === "flow") && o.to === n.currentNodeId) {
        const s = e.nodes.get(o.from);
        if ((s == null ? void 0 : s.kind) === "processor") return o.from;
      }
  }
  return n.currentNodeId;
}
function qt(n, e) {
  return [...e.items.values()].filter((t) => {
    var s;
    if (t.currentNodeId !== n || t.state === "succeeded" || t.assignedActorId && e.actors.has(t.assignedActorId)) return !1;
    const o = (s = t.extensions) == null ? void 0 : s.openreactor;
    return !(o != null && o.ciPending || t.state === "paused" || t.state === "waiting" || t.state === "blocked");
  });
}
function Ze(n, e) {
  return [...e.items.values()].filter((t) => {
    var s;
    if (t.currentNodeId !== n) return !1;
    const o = (s = t.extensions) == null ? void 0 : s.openreactor;
    return !!(o != null && o.ciPending);
  });
}
function Je(n, e, t) {
  const o = Ze(n.id, t), s = Math.min(o.indexOf(e), z - 1), i = L(n, "right");
  return {
    x: i.x + (s + 1) * _ + v,
    y: i.y - q + v
  };
}
function to(n, e, t) {
  const o = qt(n.id, t), s = Math.min(o.indexOf(e), z - 1);
  if (n.kind === "source") {
    const a = L(n, "right");
    return {
      x: a.x + s * _ + v,
      y: a.y - q + v
    };
  }
  const i = L(n, "left");
  return {
    x: i.x - (s + 1) * _ + v,
    y: i.y - q + v
  };
}
function eo(n, e) {
  if (n.kind === "source") {
    const o = L(n, "right");
    return {
      x: o.x + z * _ + v,
      y: o.y - q + v
    };
  }
  const t = L(n, "left");
  return {
    x: t.x - (z + 1) * _ + v,
    y: t.y - q + v
  };
}
function oo(n, e, t) {
  const o = $(n), s = [...t.items.values()].filter(
    (c) => c.currentNodeId === n.id
  ), i = s.indexOf(e), a = Math.max(0, s.length - We);
  if (i < a) return null;
  const r = i - a, f = [
    { x: 10, y: 10 },
    { x: 32, y: 18 },
    { x: 20, y: 36 }
  ], l = f[r] ?? f[f.length - 1];
  return {
    x: o.x + l.x,
    y: o.y + l.y
  };
}
function no(n, e, t) {
  var c;
  const o = $(e), s = ((c = e.node.capacity) == null ? void 0 : c.maxConcurrency) ?? 3, i = [...t.actors.values()].filter(
    (h) => h.currentNodeId === e.id
  ), a = Math.max(0, i.findIndex((h) => h.id === n.id)), r = _ * 2, f = s * r;
  return {
    x: o.x + (o.w - f) / 2 + a * r + v,
    y: o.y + v
  };
}
function so(n, e, t) {
  const o = t.nodes.get(n), s = t.nodes.get(e);
  if (!o || !s) return [];
  if (o.kind === "processor" && s.kind === "human-gate")
    return io(o, s);
  if (o.kind === "human-gate" && s.kind === "processor")
    return ro(o, s);
  const i = L(o, "right"), a = L(s, "left"), r = -q + v, f = i.y + r, l = a.y + r;
  if (Math.abs(f - l) < 2)
    return [{ x: i.x, y: f }, { x: a.x, y: l }];
  const c = U((i.x + a.x) / 2), h = 12, u = l > f ? 1 : -1;
  return [
    { x: i.x, y: f },
    { x: c - h, y: f },
    { x: c, y: f + h * u },
    { x: c, y: l - h * u },
    { x: c + h, y: l },
    { x: a.x, y: l }
  ];
}
function io(n, e) {
  const t = n.gx + n.gw - 2, o = n.gy + n.gh, s = $(e), i = {
    x: s.x + Math.round((s.w - R) / 2),
    y: s.y + Math.round((s.h - R) / 2)
  }, a = (e.gy + Math.floor(e.gh / 2)) * _ + v;
  return [
    { x: t * _ + v, y: o * _ + v },
    { x: t * _ + v, y: a },
    { x: i.x, y: a },
    i
  ];
}
function ro(n, e) {
  const t = $(n), o = {
    x: t.x + Math.round((t.w - R) / 2),
    y: t.y + Math.round((t.h - R) / 2)
  }, s = n.gx - 1, i = e.gx - 2, a = e.gy + 1, r = (n.gy + Math.floor(n.gh / 2)) * _ + v;
  return [
    o,
    { x: s * _ + v, y: r },
    { x: i * _ + v, y: r },
    { x: i * _ + v, y: a * _ + v },
    { x: (e.gx - 1) * _ + v, y: a * _ + v }
  ];
}
function ao(n, e, t) {
  if (n.length < 2) return n[0] ?? { x: 0, y: 0 };
  let o = t * e;
  for (let s = 1; s < n.length; s++) {
    const i = Math.hypot(
      n[s].x - n[s - 1].x,
      n[s].y - n[s - 1].y
    );
    if (o <= i) {
      const a = i > 0 ? o / i : 0;
      return {
        x: n[s - 1].x + (n[s].x - n[s - 1].x) * a,
        y: n[s - 1].y + (n[s].y - n[s - 1].y) * a
      };
    }
    o -= i;
  }
  return n[n.length - 1];
}
function fo(n) {
  const e = document.createElement("div");
  e.classList.add("ff-token"), e.dataset.itemId = n.id;
  const t = document.createElement("span");
  t.classList.add("ff-token__glyph"), e.appendChild(t);
  const o = document.createElement("span");
  o.classList.add("ff-token__label"), e.appendChild(o);
  const s = document.createElement("span");
  return s.classList.add("ff-token__title"), e.appendChild(s), e;
}
function co(n, e) {
  var u;
  const t = Ft(e), o = ["ff-token", `ff-token--${e.state}`, `ff-token--${t}`];
  e.outcome === "rejected" && o.push("ff-token--outcome-rejected"), e.outcome === "decomposed" && o.push("ff-token--outcome-decomposed"), e.outcome === "banked" && o.push("ff-token--outcome-banked"), e.state === "waiting" && o.push("ff-token--handoff");
  const s = (u = e.extensions) == null ? void 0 : u.openreactor;
  s != null && s.stalledHeartbeat && o.push("ff-token--stalled"), s != null && s.providerFallback && o.push("ff-token--fallback"), s != null && s.ciPending && o.push("ff-token--ci-pending"), (s == null ? void 0 : s.lastFailureKind) === "ci-failure" && o.push("ff-token--ci-failure"), (s == null ? void 0 : s.lastFailureKind) === "merge-conflict" && o.push("ff-token--merge-conflict"), n.className = o.join(" "), n.dataset.itemId = e.id;
  const i = n.querySelector(".ff-token__glyph");
  i.dataset.kind !== t && (i.dataset.kind = t, i.innerHTML = ho(t));
  const a = n.querySelector(".ff-token__label");
  a.textContent = lo(e);
  let r = n.querySelector(".ff-token__icon");
  const f = s == null ? void 0 : s.lastFailureKind, l = e.state === "retrying" && f;
  e.state === "waiting" || e.outcome === "decomposed" || e.outcome === "rejected" || e.outcome === "banked" || (s == null ? void 0 : s.stalledHeartbeat) || l ? (r || (r = document.createElement("span"), r.classList.add("ff-token__icon"), n.appendChild(r)), l && f === "ci-failure" ? r.textContent = "❌" : l && f === "merge-conflict" ? r.textContent = "⇄" : e.state === "waiting" ? r.textContent = "✋" : e.outcome === "decomposed" ? r.textContent = "⑂" : e.outcome === "rejected" ? r.textContent = "✕" : e.outcome === "banked" ? r.textContent = "⏸" : s != null && s.stalledHeartbeat && (r.textContent = "⚠")) : r == null || r.remove();
  const h = n.querySelector(".ff-token__title");
  h.textContent = e.label;
}
function lo(n) {
  var o;
  const e = (o = n.extensions) == null ? void 0 : o.openreactor;
  if (typeof (e == null ? void 0 : e.issueNumber) == "number") return Et(e.issueNumber);
  const t = n.label.match(/#(\d+)/);
  return t ? Et(Number(t[1])) : n.label.slice(0, 4);
}
function Et(n) {
  return Number.isFinite(n) ? n < 100 ? String(n) : String(n % 100).padStart(2, "0") : "";
}
function ho(n) {
  return n === "pull-request" ? `
      <svg class="ff-token__svg ff-token__svg--pull-request" viewBox="0 0 16 16" aria-hidden="true">
        <path class="ff-token__svg-solid" d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
      </svg>
    ` : `
    <svg class="ff-token__svg ff-token__svg--issue" viewBox="0 0 24 24" aria-hidden="true">
      <path class="ff-token__svg-body" d="M7 4.5H17C18.1046 4.5 19 5.39543 19 6.5V14.5L13.5 20H7C5.89543 20 5 19.1046 5 18V6.5C5 5.39543 5.89543 4.5 7 4.5Z" />
      <path class="ff-token__svg-accent" d="M9 2.25H15C15.8284 2.25 16.5 2.92157 16.5 3.75V6H7.5V3.75C7.5 2.92157 8.17157 2.25 9 2.25Z" />
      <path class="ff-token__svg-detail" d="M14 20V14.8H19" />
      <path class="ff-token__svg-detail" d="M8.5 10.25H15.5" />
      <path class="ff-token__svg-detail" d="M8.5 13H15" />
    </svg>
  `;
}
class po {
  constructor(e) {
    p(this, "el");
    p(this, "container");
    p(this, "selectedId", null);
    p(this, "selectedType", null);
    this.container = e, this.el = document.createElement("div"), this.el.classList.add("ff-tooltip"), this.el.hidden = !0, e.appendChild(this.el);
  }
  show(e, t, o, s) {
    this.selectedId = o, this.selectedType = t;
    const i = uo(t, o, s);
    if (!i) {
      this.hide();
      return;
    }
    this.el.innerHTML = i, this.el.hidden = !1;
    const a = e.getBoundingClientRect(), r = this.container.getBoundingClientRect(), f = this.el.getBoundingClientRect();
    let l = a.right - r.left + 8, c = a.top - r.top;
    l + f.width > r.width && (l = a.left - r.left - f.width - 8), c + f.height > r.height && (c = r.height - f.height - 8), this.el.style.left = `${Math.max(0, l)}px`, this.el.style.top = `${Math.max(0, c)}px`;
  }
  hide() {
    this.el.hidden = !0, this.selectedId = null, this.selectedType = null;
  }
  isVisible() {
    return !this.el.hidden;
  }
  getSelectedId() {
    return this.selectedId;
  }
  destroy() {
    this.el.remove();
  }
}
function uo(n, e, t) {
  switch (n) {
    case "node":
      return go(e, t);
    case "item":
      return mo(e, t);
    case "actor":
      return yo(e, t);
    case "service":
      return xo(e, t);
    case "incident":
      return vo(e, t);
    default:
      return null;
  }
}
function go(n, e) {
  var r, f;
  const t = e.nodes.get(n);
  if (!t) return null;
  const o = [...e.items.values()].filter((l) => l.currentNodeId === n), s = [...e.actors.values()].filter((l) => l.currentNodeId === n);
  let i = `<div class="ff-tooltip__header">
    <strong>${E(t.label)}</strong>
    <span class="ff-tooltip__kind">${t.kind}</span>
  </div>`;
  i += `<div class="ff-tooltip__row">Status: <span class="ff-tooltip__status ff-tooltip__status--${t.status}">${t.status}</span></div>`;
  const a = t.kind === "sink" ? o.length : ((r = t.node.counts) == null ? void 0 : r.totalItems) ?? o.length;
  if (i += `<div class="ff-tooltip__row">Items: ${a}</div>`, (f = t.node.capacity) != null && f.maxConcurrency && (i += `<div class="ff-tooltip__row">Capacity: ${s.length}/${t.node.capacity.maxConcurrency}</div>`), t.kind === "sink" && o.length > 0) {
    const l = [...o].reverse();
    i += '<div class="ff-tooltip__section ff-tooltip__section--scroll">', i += '<div class="ff-tooltip__row">Pile contents, newest first</div>';
    for (const c of l)
      i += `<div class="ff-tooltip__item">${E(tt(c))} — ${c.state}</div>`;
    i += "</div>";
  } else if (o.length > 0) {
    i += '<div class="ff-tooltip__section">';
    for (const l of o.slice(0, 8))
      i += `<div class="ff-tooltip__item">${E(tt(l))} — ${l.state}</div>`;
    a > 8 && (i += `<div class="ff-tooltip__more">+${a - 8} more</div>`), i += "</div>";
  }
  return i;
}
function mo(n, e) {
  var i;
  const t = e.items.get(n);
  if (!t) return null;
  let o = `<div class="ff-tooltip__header">
    <strong>${E(tt(t))}</strong>
    <span class="ff-tooltip__status ff-tooltip__status--${t.state}">${t.state}</span>
  </div>`;
  if (o += `<div class="ff-tooltip__row">${E(t.label)}</div>`, t.currentNodeId) {
    const a = e.nodes.get(t.currentNodeId);
    o += `<div class="ff-tooltip__row">At: ${E((a == null ? void 0 : a.label) ?? t.currentNodeId)}</div>`;
  }
  if (t.assignedActorId) {
    const a = e.actors.get(t.assignedActorId);
    o += `<div class="ff-tooltip__row">Agent: ${E((a == null ? void 0 : a.label) ?? t.assignedActorId)}</div>`;
  }
  t.retryCount && (o += `<div class="ff-tooltip__row">Retries: ${t.retryCount}</div>`), t.enteredStateAt && (o += `<div class="ff-tooltip__row">Since: ${et(t.enteredStateAt)}</div>`);
  const s = (i = t.extensions) == null ? void 0 : i.openreactor;
  return s && (s.branchName && (o += `<div class="ff-tooltip__row ff-tooltip__ext">Branch: ${E(String(s.branchName))}</div>`), s.prUrl && (o += `<div class="ff-tooltip__row ff-tooltip__ext"><a href="${E(String(s.prUrl))}" target="_blank" rel="noopener">View PR</a></div>`), s.issueUrl && (o += `<div class="ff-tooltip__row ff-tooltip__ext"><a href="${E(String(s.issueUrl))}" target="_blank" rel="noopener">View Issue</a></div>`)), o;
}
function yo(n, e) {
  const t = e.actors.get(n);
  if (!t) return null;
  let o = `<div class="ff-tooltip__header">
    <strong>${E(t.label)}</strong>
    <span class="ff-tooltip__status ff-tooltip__status--${t.status}">${t.status}</span>
  </div>`;
  if (t.role && (o += `<div class="ff-tooltip__row">Role: ${t.role}</div>`), t.provider && (o += `<div class="ff-tooltip__row">Provider: ${t.provider}</div>`), t.model && (o += `<div class="ff-tooltip__row">Model: ${E(t.model)}</div>`), t.currentItemId) {
    const i = e.items.get(t.currentItemId);
    o += `<div class="ff-tooltip__row">Working on: ${E(i ? tt(i) : t.currentItemId)}</div>`;
  }
  t.lastHeartbeatAt && (o += `<div class="ff-tooltip__row">Last heartbeat: ${et(t.lastHeartbeatAt)}</div>`);
  const s = [...e.executions.values()].find((i) => i.actorId === n && i.status === "running");
  return s != null && s.attempt && (o += `<div class="ff-tooltip__row">Attempt: ${s.attempt}</div>`), o;
}
function xo(n, e) {
  const t = e.services.get(n);
  if (!t) return null;
  let o = `<div class="ff-tooltip__header">
    <strong>${E(t.label)}</strong>
    <span class="ff-tooltip__status ff-tooltip__status--${t.status}">${t.status}</span>
  </div>`;
  return o += `<div class="ff-tooltip__row">Active: ${t.active ? "Yes" : "No"}</div>`, t.restarts && (o += `<div class="ff-tooltip__row">Restarts: ${t.restarts}</div>`), t.cooldownUntil && (o += `<div class="ff-tooltip__row">Cooldown until: ${et(t.cooldownUntil)}</div>`), o;
}
function vo(n, e) {
  const t = e.incidents.get(n);
  if (!t) return null;
  let o = `<div class="ff-tooltip__header">
    <strong>${E(t.label)}</strong>
    <span class="ff-tooltip__severity ff-tooltip__severity--${t.severity}">${t.severity}</span>
  </div>`;
  return o += `<div class="ff-tooltip__row">Status: ${t.status}</div>`, t.reason && (o += `<div class="ff-tooltip__row">Reason: ${E(t.reason)}</div>`), o += `<div class="ff-tooltip__row">Started: ${et(t.startedAt)}</div>`, o;
}
function tt(n) {
  var o;
  const e = (o = n.extensions) == null ? void 0 : o.openreactor;
  if (e != null && e.issueNumber) return `#${e.issueNumber}`;
  const t = n.label.match(/#(\d+)/);
  return t ? `#${t[1]}` : n.label.slice(0, 20);
}
function et(n) {
  const e = Date.now() - Date.parse(n);
  return e < 0 ? "in " + It(-e) : It(e) + " ago";
}
function It(n) {
  const e = Math.floor(n / 1e3);
  if (e < 60) return `${e}s`;
  const t = Math.floor(e / 60);
  return t < 60 ? `${t}m` : `${Math.floor(t / 60)}h ${t % 60}m`;
}
function E(n) {
  return n.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
class wo {
  constructor(e, t, o, s) {
    p(this, "url");
    p(this, "interval");
    p(this, "timer", null);
    p(this, "onData");
    p(this, "onError");
    p(this, "backoff", 0);
    this.url = e, this.interval = t, this.onData = o, this.onError = s;
  }
  start() {
    this.poll(), this.timer = setInterval(() => this.poll(), this.interval);
  }
  stop() {
    this.timer !== null && (clearInterval(this.timer), this.timer = null);
  }
  async poll() {
    try {
      const e = await fetch(this.url, { cache: "no-store" });
      if (!e.ok)
        throw new Error(`HTTP ${e.status}`);
      const t = await e.json();
      this.backoff = 0, this.onData(t);
    } catch (e) {
      const t = e instanceof Error ? e.message : "Unknown error";
      this.backoff = Math.min(6e4, Math.max(5e3, this.backoff * 2 || 5e3)), this.onError(`Connection failed: ${t}. Retrying in ${Math.round(this.backoff / 1e3)}s`);
    }
  }
}
const O = {
  source: { gw: 3, gh: 3 },
  processor: { gw: 7, gh: 3 },
  queue: { gw: 3, gh: 3 },
  router: { gw: 3, gh: 3 },
  sink: { gw: 3, gh: 3 },
  store: { gw: 3, gh: 3 },
  supervisor: { gw: 3, gh: 3 },
  scheduler: { gw: 3, gh: 3 },
  integration: { gw: 3, gh: 3 },
  "human-gate": { gw: 3, gh: 3 }
}, ft = 4, H = 3, dt = 4, Lt = 1;
function _o(n, e) {
  var gt;
  const t = new Map(n.map((d) => [d.id, d])), o = new Set(
    e.filter((d) => {
      var g;
      return d.kind === "handoff" && ((g = t.get(d.toNodeId)) == null ? void 0 : g.kind) === "source";
    }).map((d) => d.id)
  ), s = e.filter(
    (d) => (d.kind === "flow" || d.kind === "handoff") && !o.has(d.id)
  ), i = e.filter((d) => d.kind === "retry"), a = e.filter((d) => d.kind === "control"), r = /* @__PURE__ */ new Set();
  for (const d of n)
    d.kind === "supervisor" && r.add(d.id), d.kind === "sink" && r.add(d.id), d.kind === "queue" && r.add(d.id);
  for (const d of n)
    !e.some(
      (m) => (m.fromNodeId === d.id || m.toNodeId === d.id) && m.kind !== "retry"
    ) && e.some((m) => (m.fromNodeId === d.id || m.toNodeId === d.id) && m.kind === "retry") && r.add(d.id);
  const f = n.filter((d) => !r.has(d.id)), l = bo(f, s), c = ko(l, s, t), h = Eo(l, c, s, i, a), u = /* @__PURE__ */ new Map();
  let x = 1;
  for (const d of c) {
    const g = t.get(d);
    if (!g) continue;
    const m = O[g.kind] ?? { gw: 4, gh: 3 };
    u.set(d, {
      id: d,
      kind: g.kind,
      label: g.label,
      status: g.status,
      gx: x,
      gy: dt,
      gw: m.gw,
      gh: m.gh,
      node: g
    }), x += m.gw + ft;
  }
  let y = dt;
  for (const d of u.values())
    y = Math.max(y, d.gy + d.gh);
  y += H;
  const w = /* @__PURE__ */ new Map();
  for (const d of h) {
    if (u.has(d)) continue;
    const g = Io(d, e, u);
    w.set(d, g);
  }
  for (const d of h)
    if (!((w.get(d) ?? 1) > 1))
      for (const g of e) {
        if (g.toNodeId === d && w.has(g.fromNodeId)) {
          const m = w.get(g.fromNodeId);
          if (m > 1) {
            w.set(d, m);
            break;
          }
        }
        if (g.fromNodeId === d && w.has(g.toNodeId)) {
          const m = w.get(g.toNodeId);
          if (m > 1) {
            w.set(d, m);
            break;
          }
        }
      }
  const Y = new Set(c), D = (d) => e.some(
    (g) => g.toNodeId === d && Y.has(g.fromNodeId) || g.fromNodeId === d && Y.has(g.toNodeId)
  ), ot = [...w.entries()].map(([d, g]) => ({ id: d, targetX: g, priority: D(d) ? 0 : 1 })).sort((d, g) => d.priority - g.priority || d.targetX - g.targetX);
  let V = 0, S = y;
  for (const { id: d, targetX: g } of ot) {
    const m = t.get(d);
    if (!m) continue;
    const k = O[m.kind] ?? { gw: 4, gh: 3 }, M = e.find(
      (W) => W.toNodeId === d && (W.kind === "flow" || W.kind === "handoff") && u.has(W.fromNodeId)
    ), b = M ? u.get(M.fromNodeId) : void 0, T = b ? b.gx + Math.floor((b.gw - k.gw) / 2) : void 0, P = m.kind === "human-gate" && b && Lo(b.id, e), K = P ? Mo(b, k.gw) : Math.max(V, T ?? g), mt = P ? b.gy + b.gh + H : y;
    u.set(d, {
      id: d,
      kind: m.kind,
      label: m.label,
      status: m.status,
      gx: K,
      gy: mt,
      gw: k.gw,
      gh: k.gh,
      node: m
    }), V = K + k.gw + ft, S = Math.max(S, mt + k.gh);
  }
  y = S + H;
  let nt = 0;
  for (const d of u.values())
    nt = Math.max(nt, d.gx + d.gw);
  const G = /* @__PURE__ */ new Map();
  for (const d of e)
    if (d.kind === "flow" || d.kind === "handoff") {
      const g = t.get(d.toNodeId);
      if ((g == null ? void 0 : g.kind) === "sink") {
        const m = G.get(d.toNodeId) ?? [];
        m.push(d.fromNodeId), G.set(d.toNodeId, m);
      }
    }
  const st = /* @__PURE__ */ new Set();
  for (const [d, g] of G) {
    if (g.length !== 1) continue;
    const m = g[0];
    e.some(
      (M) => {
        var b;
        return M.fromNodeId === m && M.kind === "flow" && M.toNodeId !== d && ((b = t.get(M.toNodeId)) == null ? void 0 : b.kind) !== "sink";
      }
    ) && st.add(d);
  }
  const it = /* @__PURE__ */ new Map();
  for (const d of n) {
    if (d.kind !== "sink" || !st.has(d.id)) continue;
    const g = (gt = G.get(d.id)) == null ? void 0 : gt[0];
    if (!g) continue;
    const m = it.get(g) ?? [];
    m.push(d.id), it.set(g, m);
  }
  const ht = /* @__PURE__ */ new Map();
  for (const [d, g] of it) {
    const m = u.get(d);
    if (!m) continue;
    const k = g.reduce((b, T) => {
      const P = t.get(T), K = P ? O[P.kind] ?? { gw: 4 } : { gw: 4 };
      return b + K.gw;
    }, 0) + Lt * Math.max(0, g.length - 1);
    let M = m.gx + Math.floor((m.gw - k) / 2);
    for (const b of g) {
      const T = t.get(b), P = T ? O[T.kind] ?? { gw: 4 } : { gw: 4 };
      ht.set(b, { gx: M, gy: y }), M += P.gw + Lt;
    }
  }
  let Bt = nt + ft, pt = dt;
  for (const d of n) {
    if (u.has(d.id)) continue;
    const g = O[d.kind] ?? { gw: 4, gh: 3 };
    if (d.kind === "sink") {
      const k = st.has(d.id) ? ht.get(d.id) : void 0, M = (k == null ? void 0 : k.gx) ?? Bt, b = (k == null ? void 0 : k.gy) ?? pt;
      u.set(d.id, {
        id: d.id,
        kind: d.kind,
        label: d.label,
        status: d.status,
        gx: M,
        gy: b,
        gw: g.gw,
        gh: g.gh,
        node: d
      }), k || (pt += g.gh + H);
    } else
      u.set(d.id, {
        id: d.id,
        kind: d.kind,
        label: d.label,
        status: d.status,
        gx: 1,
        gy: y,
        gw: g.gw,
        gh: g.gh,
        node: d
      }), y += g.gh + H;
  }
  const ut = /* @__PURE__ */ new Map();
  for (const d of e)
    ut.set(d.id, {
      id: d.id,
      kind: d.kind,
      from: d.fromNodeId,
      to: d.toNodeId,
      status: d.status ?? "unknown",
      edge: d
    });
  return { nodes: u, edges: ut };
}
function bo(n, e) {
  var a;
  const t = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map();
  for (const r of n)
    t.set(r.id, []), o.set(r.id, 0);
  for (const r of e)
    (a = t.get(r.fromNodeId)) == null || a.push(r.toNodeId), o.set(r.toNodeId, (o.get(r.toNodeId) ?? 0) + 1);
  const s = [];
  for (const [r, f] of o)
    f === 0 && s.push(r);
  const i = [];
  for (; s.length > 0; ) {
    const r = s.shift();
    i.push(r);
    for (const f of t.get(r) ?? []) {
      const l = (o.get(f) ?? 1) - 1;
      o.set(f, l), l === 0 && s.push(f);
    }
  }
  for (const r of n)
    i.includes(r.id) || i.push(r.id);
  return i;
}
function ko(n, e, t) {
  const o = new Set(e.map((c) => c.toNodeId));
  new Set(e.map((c) => c.fromNodeId));
  const i = n.filter(
    (c) => {
      var h;
      return !o.has(c) || ((h = t.get(c)) == null ? void 0 : h.kind) === "source";
    }
  )[0] ?? n[0];
  if (!i) return [];
  const a = /* @__PURE__ */ new Map();
  for (const c of e) {
    const h = a.get(c.fromNodeId) ?? [];
    h.push(c.toNodeId), a.set(c.fromNodeId, h);
  }
  const r = [], f = /* @__PURE__ */ new Set();
  let l = i;
  for (; l && !f.has(l); ) {
    f.add(l), r.push(l);
    const c = (a.get(l) ?? []).filter((u) => !f.has(u));
    l = c.find((u) => {
      const x = t.get(u);
      return (x == null ? void 0 : x.kind) === "processor" || (x == null ? void 0 : x.kind) === "sink";
    }) ?? c[0];
  }
  return r;
}
function Eo(n, e, t, o, s) {
  const i = new Set(e), a = /* @__PURE__ */ new Set();
  for (const r of [...t, ...o, ...s])
    i.has(r.fromNodeId) || a.add(r.fromNodeId), i.has(r.toNodeId) || a.add(r.toNodeId);
  return n.filter((r) => a.has(r) && !i.has(r));
}
function Io(n, e, t) {
  for (const o of e)
    if (o.toNodeId === n && (o.kind === "flow" || o.kind === "retry" || o.kind === "handoff")) {
      const s = t.get(o.fromNodeId);
      if (s) return s.gx;
    }
  for (const o of e)
    if (o.fromNodeId === n && (o.kind === "flow" || o.kind === "retry")) {
      const s = t.get(o.toNodeId);
      if (s) return s.gx;
    }
  for (const o of e)
    if (o.fromNodeId === n && o.kind === "control") {
      const s = t.get(o.toNodeId);
      if (s) return s.gx;
    }
  return 1;
}
function Lo(n, e) {
  return e.some(
    (t) => t.kind === "retry" && t.fromNodeId === n && t.toNodeId === n
  );
}
function Mo(n, e) {
  const t = n.gx - 2, o = n.gx + n.gw - 2;
  return Math.round((t + o - e) / 2);
}
function Co(n) {
  const { nodes: e, edges: t } = _o(
    n.topology.nodes,
    n.topology.edges
  ), o = new Map(
    n.snapshot.items.map((f) => [f.id, f])
  ), s = new Map(
    n.snapshot.actors.map((f) => [f.id, f])
  ), i = new Map(
    (n.snapshot.executions ?? []).map((f) => [f.id, f])
  ), a = new Map(
    n.snapshot.incidents.map((f) => [f.id, f])
  ), r = new Map(
    n.snapshot.services.map((f) => [f.id, f])
  );
  return { nodes: e, edges: t, items: o, actors: s, executions: i, incidents: a, services: r };
}
function $o(n, e) {
  const t = {
    addedItems: [],
    removedItems: [],
    movedItems: /* @__PURE__ */ new Map(),
    changedItems: [],
    addedActors: [],
    removedActors: [],
    changedActors: [],
    addedNodes: [],
    removedNodes: [],
    addedIncidents: [],
    removedIncidents: []
  };
  if (!n)
    return t.addedItems = [...e.items.keys()], t.addedActors = [...e.actors.keys()], t.addedNodes = [...e.nodes.keys()], t.addedIncidents = [...e.incidents.keys()], t;
  for (const o of e.items.keys()) {
    const s = n.items.get(o);
    if (!s)
      t.addedItems.push(o);
    else {
      const i = e.items.get(o);
      s.currentNodeId !== i.currentNodeId && s.currentNodeId && i.currentNodeId && t.movedItems.set(o, {
        fromNodeId: s.currentNodeId,
        toNodeId: i.currentNodeId
      }), s.state !== i.state && t.changedItems.push(o);
    }
  }
  for (const o of n.items.keys())
    e.items.has(o) || t.removedItems.push(o);
  for (const o of e.actors.keys())
    if (!n.actors.has(o))
      t.addedActors.push(o);
    else {
      const s = n.actors.get(o), i = e.actors.get(o);
      (s.status !== i.status || s.currentItemId !== i.currentItemId) && t.changedActors.push(o);
    }
  for (const o of n.actors.keys())
    e.actors.has(o) || t.removedActors.push(o);
  for (const o of e.nodes.keys())
    n.nodes.has(o) || t.addedNodes.push(o);
  for (const o of n.nodes.keys())
    e.nodes.has(o) || t.removedNodes.push(o);
  for (const o of e.incidents.keys())
    n.incidents.has(o) || t.addedIncidents.push(o);
  for (const o of n.incidents.keys())
    e.incidents.has(o) || t.removedIncidents.push(o);
  return t;
}
const No = ':host{display:block;width:100%;height:100%;--ff-floor: #ffffff;--ff-grid: #e5e7eb;--ff-grid-opacity: .4;--ff-station: #f9fafb;--ff-station-border: #d1d5db;--ff-station-active: #c6643f;--ff-belt: #d1d5db;--ff-belt-active: #c6643f;--ff-belt-bed: #6e675f;--ff-belt-rail: #d9d2c7;--ff-belt-lane: #3d3935;--ff-belt-groove: #58524b;--ff-belt-divider: #26231f;--ff-belt-shadow: #2c2824;--ff-belt-motion: #c6643f;--ff-token-queued: #506d89;--ff-token-running: #9d5b20;--ff-token-succeeded: #2f6d56;--ff-token-failed: #9d4331;--ff-token-paused: #9ca3af;--ff-actor-general: #c6643f;--ff-actor-planning: #508f6e;--ff-actor-ui: #7c6ccf;--ff-actor-service: #506d89;--ff-actor-human: #6b7280;--ff-healthy: #2f6d56;--ff-degraded: #9d5b20;--ff-error: #9d4331;--ff-cooldown: #506d89;--ff-text: #111827;--ff-text-soft: #4b5563;--ff-text-faint: #9ca3af;--ff-font: ui-sans-serif, system-ui, sans-serif}.ff-viewport{position:relative;width:100%;height:100%;overflow:hidden;background:var(--ff-floor);font-family:var(--ff-font);cursor:grab;-webkit-user-select:none;user-select:none}.ff-viewport:active{cursor:grabbing}.ff-world{position:absolute;top:0;left:0;will-change:transform;transform-origin:0 0}.ff-world--panning *{transition:none!important}.ff-world--rate-limited{filter:saturate(.3) brightness(.95)}.ff-world--degraded{filter:saturate(.7)}.ff-floor{position:absolute;top:-10000px;right:-10000px;bottom:-10000px;left:-10000px;background-image:linear-gradient(to right,var(--ff-grid) 1px,transparent 1px),linear-gradient(to bottom,var(--ff-grid) 1px,transparent 1px);background-size:25px 25px;opacity:var(--ff-grid-opacity);pointer-events:none}.ff-floor--hidden{display:none}.ff-entity{position:absolute;top:0;left:0;box-sizing:border-box;transition:transform .5s ease-out;z-index:1}.ff-node{border-radius:6px;border:1px solid var(--ff-station-border);background:var(--ff-station);overflow:visible}.ff-node--active{border-color:var(--ff-station-active)}.ff-node--degraded{border-color:var(--ff-degraded)}.ff-node--down{border-color:var(--ff-error);opacity:.7}.ff-node__body{display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;position:relative}.ff-node--sprite{border:0;background:transparent}.ff-node--sprite.ff-node--degraded{box-shadow:0 0 0 2px var(--ff-degraded);border-radius:10px}.ff-node--sprite.ff-node--down{box-shadow:0 0 0 2px var(--ff-error);border-radius:10px}.ff-node__body--sprite{overflow:hidden}.ff-node__sprite{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;object-fit:contain;object-position:center;pointer-events:none;-webkit-user-select:none;user-select:none}.ff-node__icon{font-size:22px;line-height:1;color:var(--ff-text-soft)}.ff-node--active .ff-node__icon{color:var(--ff-station-active)}.ff-node__label{font-size:9px;font-weight:600;color:var(--ff-text);text-align:center;position:absolute;bottom:-16px;left:50%;transform:translate(-50%);white-space:nowrap}.ff-node--sprite .ff-node__label{bottom:-18px;padding:1px 4px;border-radius:999px;background:#ffffffeb}.ff-node__tray{display:flex;flex-wrap:wrap;gap:2px}.ff-node__seats{display:flex;gap:4px;align-items:center;justify-content:center;height:100%;padding:0 8px}.ff-node__seat{width:40px;height:44px;border:1.5px dashed var(--ff-station-border);border-radius:4px;flex-shrink:0}.ff-node--active .ff-node__seat{border-color:var(--ff-station-active);border-style:solid}.ff-node--processor .ff-node__body{flex-direction:row;gap:0;padding:4px}.ff-node--human-gate{border:0;background:transparent;display:flex;align-items:flex-end;justify-content:center}.ff-node--human-gate.ff-node--active{filter:none}.ff-node--human-gate .ff-node__body{width:calc(100% - 12px);height:calc(100% - 14px);margin-top:14px;border:2px dashed #d6a735;border-radius:8px;background:linear-gradient(135deg,rgba(214,167,53,.14) 0 12px,transparent 12px 22px),#fff8e4ad;box-shadow:inset 0 0 0 1px #ffffffc7,0 2px 5px #2b272014}.ff-node--human-gate.ff-node--active .ff-node__body{border-color:#d1aa3d}.ff-node--human-gate .ff-node__label{bottom:-18px}.ff-entity__badge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:var(--ff-station-active);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px;line-height:1}.ff-node--sprite .ff-entity__badge{top:-8px;right:-10px;z-index:1}.ff-token{position:absolute;top:0;left:0;width:21px;height:21px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:600;font-family:var(--ff-font);transition:transform .5s ease-out,background-color .3s;cursor:pointer;z-index:2;--ff-token-color: var(--ff-token-queued);--ff-token-accent: color-mix(in srgb, var(--ff-token-color) 72%, rgba(18, 24, 31, .95))}.ff-token:hover{filter:brightness(1.15)}.ff-token__glyph{position:absolute;top:0;right:0;bottom:0;left:0;isolation:isolate}.ff-token__glyph:after{content:"";position:absolute;top:1px;right:1px;width:0;height:0;border-radius:999px;background:transparent;pointer-events:none}.ff-token__glyph:before{content:"";position:absolute;top:1px;left:1px;width:0;height:0;background:transparent;pointer-events:none}.ff-token__svg{display:block;width:100%;height:100%}.ff-token__svg-solid{fill:var(--ff-token-color)}.ff-token__svg-body,.ff-token__svg-node,.ff-token__svg-stroke{fill:var(--ff-token-color);stroke:var(--ff-token-color)}.ff-token__svg-accent{fill:var(--ff-token-accent)}.ff-token__svg-detail{fill:none;stroke:#ffffff6b;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}.ff-token__svg-shadow,.ff-token__svg-node-shadow{fill:none;stroke:#12181fb8;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}.ff-token__svg-node-shadow{fill:#12181fb8;stroke:none}.ff-token__svg-node{stroke:none}.ff-token__svg-stroke{fill:none;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}.ff-token__svg--issue{filter:drop-shadow(0 0 1px rgba(18,24,31,.9)) drop-shadow(0 1px 1px rgba(18,24,31,.45))}.ff-token__svg--pull-request{filter:none}.ff-token__label{position:absolute;top:-4px;right:-4px;z-index:2;display:inline-flex;align-items:center;justify-content:center;min-width:10px;height:10px;padding:0 2px;border-radius:999px;background:#12181ff0;color:#fff;font-size:5px;font-weight:700;line-height:1;letter-spacing:-.03em;transform:none;box-shadow:0 0 0 1px #ffffff2e,0 1px 2px #12181f59}.ff-token__title{display:none}.ff-token--queued{--ff-token-color: var(--ff-token-queued)}.ff-token--assigned,.ff-token--running{--ff-token-color: var(--ff-token-running)}.ff-token--waiting,.ff-token--blocked{--ff-token-color: var(--ff-token-paused)}.ff-token--retrying{--ff-token-color: var(--ff-token-failed)}.ff-token--paused{--ff-token-color: var(--ff-token-paused)}.ff-token--succeeded{--ff-token-color: var(--ff-token-succeeded)}.ff-token--failed{--ff-token-color: var(--ff-token-failed)}.ff-token--cancelled{--ff-token-color: #d1d5db}.ff-token--deferred{--ff-token-color: #7c8fa0}.ff-token--belt .ff-token__label{display:none}.ff-token--belt .ff-token__icon{bottom:-2px;left:auto;right:-2px}.ff-token--transit{z-index:10;filter:brightness(1.1)}.ff-token--outcome-rejected{--ff-token-color: var(--ff-token-failed) !important;opacity:.7}.ff-token--outcome-decomposed{--ff-token-color: var(--ff-cooldown) !important;border:1px solid rgba(255,255,255,.4)}.ff-token--outcome-banked{--ff-token-color: var(--ff-text-faint) !important;opacity:.6}.ff-token--handoff{--ff-token-color: var(--ff-degraded) !important;border:1px dashed rgba(255,255,255,.5)}.ff-token--stalled{animation:ff-token-stall-pulse 1s ease-in-out infinite}@keyframes ff-token-stall-pulse{50%{opacity:.4}}.ff-token--fallback{box-shadow:none}.ff-token--fallback .ff-token__glyph:before{width:6px;height:6px;background:var(--ff-degraded);clip-path:polygon(0 0,100% 0,0 100%);box-shadow:0 0 0 1px #fff8f0b8}.ff-token--ci-pending{animation:none}.ff-token--ci-pending .ff-token__glyph:after{width:5px;height:5px;background:var(--ff-belt-active, #c6643f);box-shadow:0 0 0 1px #fff8f0b3,0 0 #c6643f73;animation:ff-ci-pending-beacon 1.2s ease-in-out infinite}@keyframes ff-ci-pending-beacon{0%,to{transform:scale(1);opacity:1;box-shadow:0 0 0 1px #fff8f0b3,0 0 #c6643f73}50%{transform:scale(1.15);opacity:.82;box-shadow:0 0 0 1px #fff8f0c7,0 0 0 3px #c6643f00}}.ff-token--ci-failure,.ff-token--merge-conflict{box-shadow:none}.ff-token__icon{position:absolute;bottom:-3px;left:-4px;display:inline-flex;align-items:center;justify-content:center;min-width:10px;height:10px;font-size:7px;font-weight:700;line-height:1;background:var(--ff-floor);color:#12181feb;border-radius:999px;padding:0;box-shadow:0 0 0 1px #ffffff9e}.ff-token--ci-failure .ff-token__icon{background:var(--ff-error);color:#fff8f0f5}.ff-token--merge-conflict .ff-token__icon{background:var(--ff-degraded);color:#fff8f0f5}.ff-token-stack{position:absolute;top:0;left:0;width:21px;height:21px;z-index:2}.ff-token-stack__cards{position:relative;width:21px;height:21px}.ff-token-stack__card{position:absolute;width:21px;height:21px;background:var(--ff-token-queued);clip-path:polygon(12% 0,88% 0,100% 16%,100% 84%,88% 100%,12% 100%,0 84%,0 16%);opacity:.5}.ff-token-stack__card:nth-child(1){top:-2px;left:-1px;opacity:.25}.ff-token-stack__card:nth-child(2){top:-1px;left:0;opacity:.4}.ff-token-stack__card:nth-child(3){top:0;left:1px;opacity:.6}.ff-sink-label{position:absolute;top:0;left:0;font-size:9px;font-weight:600;color:var(--ff-text-soft);font-family:var(--ff-font);white-space:nowrap;pointer-events:none}.ff-token-stack__count{position:absolute;top:-6px;right:-10px;min-width:14px;height:12px;border-radius:6px;background:var(--ff-text-soft);color:#fff;font-size:7px;font-weight:700;font-family:var(--ff-font);display:flex;align-items:center;justify-content:center;padding:0 2px;z-index:3}.ff-drone{position:absolute;top:0;left:0;transition:transform .5s ease-out;z-index:3}.ff-drone__unit{position:relative;width:32px;height:32px;animation:ff-drone-hover 2s ease-in-out infinite}@keyframes ff-drone-hover{0%,to{transform:translateY(0)}50%{transform:translateY(-3px)}}.ff-drone__sprite-stack{position:absolute;top:0;right:0;bottom:0;left:0}.ff-drone__sprite{position:absolute;display:block;pointer-events:none;-webkit-user-select:none;user-select:none;image-rendering:auto}.ff-drone__sprite--base{top:2px;right:2px;bottom:2px;left:2px;width:28px;height:28px;object-fit:contain}.ff-drone__sprite--rotor-left{top:8px;left:-3px;width:13px;height:13px;object-fit:contain;transform-origin:50% 50%}.ff-drone__sprite--rotor-right{top:8px;right:-3px;width:13px;height:13px;object-fit:contain;transform-origin:50% 50%}.ff-drone__sprite--provider{top:7px;left:10px;width:12px;height:12px;object-fit:contain}.ff-drone__sprite--role{right:6px;bottom:4px;width:5px;height:5px;object-fit:contain}.ff-drone--working .ff-drone__sprite--rotor-left,.ff-drone--working .ff-drone__sprite--rotor-right{animation:ff-drone-rotor-spin .18s linear infinite}@keyframes ff-drone-rotor-spin{0%{transform:rotate(0)}to{transform:rotate(360deg)}}.ff-drone__shadow{position:absolute;bottom:-3px;left:7px;width:18px;height:4px;background:#0000001a;border-radius:50%}.ff-drone__label{display:none}.ff-drone--stalled .ff-drone__unit{animation:none;opacity:.5}.ff-drone--stalled .ff-drone__sprite--rotor-left,.ff-drone--stalled .ff-drone__sprite--rotor-right{animation:none}.ff-drone--failed .ff-drone__unit{animation:none;opacity:.3}.ff-drone--failed .ff-drone__sprite--rotor-left,.ff-drone--failed .ff-drone__sprite--rotor-right{animation:none}.ff-drone--unavailable{display:none}.ff-drone--fallback .ff-drone__sprite--provider{filter:saturate(1.05) drop-shadow(0 0 .5px rgba(255,248,240,.7)) drop-shadow(0 0 2px rgba(209,170,61,.45))}.ff-drone--fallback:after{content:"";position:absolute;right:5px;bottom:4px;width:5px;height:5px;border-radius:50%;background:var(--ff-degraded);box-shadow:0 0 0 1px #fff8f0e0,0 0 4px #9d5b2057}.ff-service{display:flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--ff-station-border);border-radius:4px;background:var(--ff-station);font-family:var(--ff-font)}.ff-service__dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.ff-service__dot--healthy{background:var(--ff-healthy)}.ff-service__dot--degraded{background:var(--ff-degraded)}.ff-service__dot--down{background:var(--ff-error)}.ff-service__dot--cooldown{background:var(--ff-cooldown)}.ff-service__dot--paused{background:var(--ff-text-faint)}.ff-service__dot--unknown{background:transparent;border:1px solid var(--ff-text-faint)}.ff-service__name{font-size:10px;font-weight:600;color:var(--ff-text)}.ff-service__metric{font-size:9px;color:var(--ff-text-soft)}.ff-belts{position:absolute;top:0;right:0;bottom:0;left:0;pointer-events:none;z-index:0}.ff-belt-run{position:absolute;top:0;right:0;bottom:0;left:0;opacity:.78}.ff-belt-run--active{opacity:.98}.ff-belt-run--degraded{opacity:.52}.ff-belt-cell{position:absolute;box-sizing:border-box;transform-origin:50% 50%;-webkit-user-select:none;user-select:none;opacity:.8}.ff-belt-cell--active{opacity:1}.ff-belt-cell--degraded{opacity:.58}.ff-belt-cell__svg{display:block;width:100%;height:100%;overflow:visible}.ff-belt-cell__arrow{opacity:.46;filter:drop-shadow(0 0 1px rgba(255,228,196,.55));transition:opacity .22s ease,filter .22s ease}.ff-belt-cell--active .ff-belt-cell__arrow{opacity:1;filter:drop-shadow(0 0 2px rgba(255,228,196,.8))}.ff-belt-cell--degraded .ff-belt-cell__arrow{opacity:.62;filter:drop-shadow(0 0 1px rgba(255,228,196,.45))}.ff-belt-track{fill:none;stroke:none;stroke-width:25}.ff-belt-track--degraded{stroke:var(--ff-error);opacity:.1}@media(prefers-reduced-motion:reduce){.ff-belt-run--active{opacity:.92}}.ff-incident--warning{box-shadow:0 0 0 2px var(--ff-degraded)}.ff-incident--error{box-shadow:0 0 0 2px var(--ff-error)}.ff-incident--critical{box-shadow:0 0 0 3px var(--ff-error);animation:ff-incident-flash 1s ease-in-out 3}@keyframes ff-incident-flash{50%{opacity:.6}}.ff-incident-badge{position:absolute;bottom:-20px;left:0;font-size:8px;padding:1px 6px;border-radius:3px;white-space:nowrap;color:#fff;opacity:0;pointer-events:none;transition:opacity .15s ease}.ff-entity:hover .ff-incident-badge{opacity:1;pointer-events:auto;z-index:5}.ff-incident-badge--warning{background:var(--ff-degraded)}.ff-incident-badge--error,.ff-incident-badge--critical{background:var(--ff-error)}.ff-incident-badge--info{background:var(--ff-cooldown)}.ff-hud{position:absolute;top:0;left:0;right:0;display:flex;gap:8px;padding:8px;pointer-events:none;z-index:10}.ff-hud>*{pointer-events:auto}.ff-hud__status-banner{position:absolute;top:8px;left:50%;transform:translate(-50%);padding:4px 12px;border-radius:4px;font-size:11px;font-family:var(--ff-font);color:#fff;background:var(--ff-degraded);pointer-events:auto;z-index:11}.ff-hud__status-banner--error{background:var(--ff-error)}.ff-tooltip{position:absolute;z-index:20;padding:8px 10px;border:1px solid var(--ff-station-border);border-radius:6px;background:var(--ff-floor);font-family:var(--ff-font);font-size:11px;color:var(--ff-text);max-width:240px;box-shadow:0 2px 8px #00000014;pointer-events:auto;line-height:1.4}.ff-tooltip__header{display:flex;align-items:center;gap:6px;margin-bottom:4px}.ff-tooltip__header strong{font-size:12px}.ff-tooltip__kind{font-size:9px;color:var(--ff-text-faint);text-transform:uppercase;letter-spacing:.03em}.ff-tooltip__row{font-size:10px;color:var(--ff-text-soft);margin:2px 0}.ff-tooltip__ext{color:var(--ff-text-faint)}.ff-tooltip__ext a{color:var(--ff-station-active);text-decoration:none}.ff-tooltip__ext a:hover{text-decoration:underline}.ff-tooltip__status{font-size:9px;padding:1px 5px;border-radius:3px;color:#fff}.ff-tooltip__status--healthy,.ff-tooltip__status--working,.ff-tooltip__status--succeeded{background:var(--ff-healthy)}.ff-tooltip__status--degraded,.ff-tooltip__status--stalled,.ff-tooltip__status--retrying{background:var(--ff-degraded)}.ff-tooltip__status--down,.ff-tooltip__status--failed{background:var(--ff-error)}.ff-tooltip__status--idle,.ff-tooltip__status--queued,.ff-tooltip__status--waiting,.ff-tooltip__status--paused,.ff-tooltip__status--blocked{background:var(--ff-text-faint)}.ff-tooltip__status--running,.ff-tooltip__status--assigned{background:var(--ff-token-running)}.ff-tooltip__status--unknown,.ff-tooltip__status--cooldown{background:var(--ff-cooldown)}.ff-tooltip__severity{font-size:9px;padding:1px 5px;border-radius:3px;color:#fff}.ff-tooltip__severity--info{background:var(--ff-cooldown)}.ff-tooltip__severity--warning{background:var(--ff-degraded)}.ff-tooltip__severity--error,.ff-tooltip__severity--critical{background:var(--ff-error)}.ff-tooltip__section{margin-top:4px;padding-top:4px;border-top:1px solid var(--ff-station-border)}.ff-tooltip__section--scroll{max-height:168px;overflow:auto;padding-right:4px}.ff-tooltip__item{font-size:9px;color:var(--ff-text-soft);padding:1px 0}.ff-tooltip__more{font-size:9px;color:var(--ff-text-faint);font-style:italic}.ff-entity--selected{outline:2px solid var(--ff-station-active);outline-offset:2px}.ff-watchdog{position:absolute;top:0;left:0;z-index:4;transition:transform .8s ease-in-out}.ff-watchdog__robot{position:relative;width:52px;height:52px;transform-origin:center center;transition:transform .25s ease,filter .25s ease,opacity .25s ease}.ff-watchdog__sprite{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;-webkit-user-select:none;user-select:none;transform:scaleX(-1);transform-origin:center center}.ff-watchdog__status{position:absolute;top:5px;left:9px;width:7px;height:7px;border-radius:50%;background:var(--ff-healthy);box-shadow:0 0 0 2px #ffffffd1,0 0 8px #7ac94c47}.ff-watchdog--degraded .ff-watchdog__status{background:var(--ff-degraded);box-shadow:0 0 0 2px #ffffffd1,0 0 8px #d694354d}.ff-watchdog--down .ff-watchdog__status{background:var(--ff-error);box-shadow:0 0 0 2px #ffffffd1,0 0 8px #cc443a4d}.ff-watchdog__label{font-size:9px;font-weight:600;color:var(--ff-text);text-align:center;margin-top:2px;font-family:var(--ff-font)}.ff-watchdog--healthy .ff-watchdog__status{animation:ff-watchdog-status-pulse 3s ease-in-out infinite}@keyframes ff-watchdog-status-pulse{0%,to{transform:scale(1);opacity:1}45%{transform:scale(.82);opacity:.72}55%{transform:scale(.92);opacity:.86}}.ff-watchdog--responding .ff-watchdog__robot{transform:none}.ff-watchdog--degraded .ff-watchdog__robot{filter:saturate(.9) brightness(.98)}.ff-watchdog--down .ff-watchdog__robot{opacity:.6;filter:saturate(.3) brightness(.9)}.ff-watchdog__spray{position:absolute;top:9px;left:-22px;width:60px;height:26px;pointer-events:none;opacity:0}.ff-watchdog--spraying .ff-watchdog__spray{opacity:1}.ff-watchdog__spray-particle{position:absolute;right:0;top:50%;width:4px;height:4px;border-radius:50%;background:#c8dcffe6;opacity:0;box-shadow:0 0 4px #c8dcff99}.ff-watchdog--spraying .ff-watchdog__spray-particle{animation:ff-spray .6s ease-out infinite}.ff-watchdog--spraying .ff-watchdog__spray-particle:nth-child(1){animation-delay:0s}.ff-watchdog--spraying .ff-watchdog__spray-particle:nth-child(2){animation-delay:.12s}.ff-watchdog--spraying .ff-watchdog__spray-particle:nth-child(3){animation-delay:.24s}.ff-watchdog--spraying .ff-watchdog__spray-particle:nth-child(4){animation-delay:.36s}.ff-watchdog--spraying .ff-watchdog__spray-particle:nth-child(5){animation-delay:.48s}@keyframes ff-spray{0%{opacity:.9;transform:translate(0) scale(1)}40%{opacity:.7;transform:translate(calc(var(--spray-x) * .5),calc(var(--spray-y) * .5)) scale(1.2)}to{opacity:0;transform:translate(var(--spray-x),var(--spray-y)) scale(.3)}}.ff-watchdog__spray-particle:nth-child(1){--spray-x: -30px;--spray-y: -12px}.ff-watchdog__spray-particle:nth-child(2){--spray-x: -28px;--spray-y: -5px}.ff-watchdog__spray-particle:nth-child(3){--spray-x: -32px;--spray-y: 1px}.ff-watchdog__spray-particle:nth-child(4){--spray-x: -26px;--spray-y: 7px}.ff-watchdog__spray-particle:nth-child(5){--spray-x: -30px;--spray-y: 13px}.ff-watch-marker{position:absolute;top:-8px;left:-8px;color:var(--ff-healthy);opacity:.6;z-index:3}.ff-watch-marker--down{color:var(--ff-error);opacity:.8;animation:ff-watch-marker-pulse 1.5s ease-in-out infinite}@keyframes ff-watch-marker-pulse{50%{opacity:.3}}';
class Yt extends HTMLElement {
  constructor() {
    super();
    p(this, "viewport", null);
    p(this, "beltLayer", null);
    p(this, "entityLayer", null);
    p(this, "tokenLayer", null);
    p(this, "tooltip", null);
    p(this, "poller", null);
    p(this, "prevState", null);
    p(this, "state", null);
    p(this, "config", { ...jt });
    p(this, "shadow");
    p(this, "viewportEl");
    p(this, "worldEl");
    p(this, "floorEl");
    p(this, "hudEl");
    p(this, "bannerEl", null);
    p(this, "onClick", (t) => {
      const o = t.target, s = o.closest("[data-node-id]");
      if (s && this.state) {
        t.stopPropagation(), this.selectEntity(s, "node", s.dataset.nodeId);
        return;
      }
      const i = o.closest("[data-item-id]");
      if (i && this.state) {
        t.stopPropagation(), this.selectEntity(i, "item", i.dataset.itemId);
        return;
      }
      const a = o.closest("[data-actor-id]");
      if (a && this.state) {
        t.stopPropagation(), this.selectEntity(a, "actor", a.dataset.actorId);
        return;
      }
      const r = o.closest("[data-service-id]");
      if (r && this.state) {
        t.stopPropagation(), this.selectEntity(r, "service", r.dataset.serviceId);
        return;
      }
      const f = o.closest("[data-incident-id]");
      if (f && this.state) {
        t.stopPropagation(), this.selectEntity(f, "incident", f.dataset.incidentId);
        return;
      }
    });
    p(this, "onViewportClick", (t) => {
      const o = t.target;
      o.closest(".ff-tooltip") || o.closest("[data-node-id]") || o.closest("[data-item-id]") || o.closest("[data-actor-id]") || o.closest("[data-service-id]") || this.deselectAll();
    });
    p(this, "onHover", (t) => {
      var r, f, l, c, h, u, x;
      const o = t.target, s = o.closest("[data-item-id]");
      if (s && this.state && !((r = this.tooltip) != null && r.isVisible())) {
        (f = this.tooltip) == null || f.show(s, "item", s.dataset.itemId, this.state), this.worldEl.style.cursor = "pointer";
        return;
      }
      const i = o.closest("[data-actor-id]");
      if (i && this.state && !((l = this.tooltip) != null && l.isVisible())) {
        (c = this.tooltip) == null || c.show(i, "actor", i.dataset.actorId, this.state), this.worldEl.style.cursor = "pointer";
        return;
      }
      const a = o.closest("[data-node-id]");
      if (a && this.state && !((h = this.tooltip) != null && h.isVisible())) {
        (u = this.tooltip) == null || u.show(a, "node", a.dataset.nodeId, this.state), this.worldEl.style.cursor = "pointer";
        return;
      }
      o.closest("[data-node-id], [data-item-id], [data-actor-id]") || (this.shadow.querySelector(".ff-entity--selected") || (x = this.tooltip) == null || x.hide(), this.worldEl.style.cursor = "");
    });
    p(this, "onPointerLeave", () => {
      var t;
      this.shadow.querySelector(".ff-entity--selected") || (t = this.tooltip) == null || t.hide();
    });
    this.shadow = this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    this.config = this.readConfig(), this.buildDOM(), this.viewport = new Dt(this.viewportEl, this.worldEl, this.config), this.beltLayer = new ne(this.worldEl), this.entityLayer = new Fe(this.worldEl), this.tokenLayer = new Qe(this.worldEl), this.tooltip = new po(this.viewportEl), this.worldEl.addEventListener("click", this.onClick), this.worldEl.addEventListener("pointermove", this.onHover), this.worldEl.addEventListener("pointerleave", this.onPointerLeave), this.viewportEl.addEventListener("click", this.onViewportClick);
    const t = this.getAttribute("url");
    t && this.startPolling(t);
  }
  disconnectedCallback() {
    var t, o, s, i, a, r, f, l, c, h;
    (t = this.poller) == null || t.stop(), (o = this.viewport) == null || o.destroy(), (s = this.beltLayer) == null || s.destroy(), (i = this.entityLayer) == null || i.destroy(), (a = this.tokenLayer) == null || a.destroy(), (r = this.tooltip) == null || r.destroy(), (f = this.worldEl) == null || f.removeEventListener("click", this.onClick), (l = this.worldEl) == null || l.removeEventListener("pointermove", this.onHover), (c = this.worldEl) == null || c.removeEventListener("pointerleave", this.onPointerLeave), (h = this.viewportEl) == null || h.removeEventListener("click", this.onViewportClick);
  }
  attributeChangedCallback(t, o, s) {
    var i, a;
    t === "url" && ((i = this.poller) == null || i.stop(), s && this.startPolling(s)), t === "grid-visible" && ((a = this.floorEl) == null || a.classList.toggle("ff-floor--hidden", s === "false"));
  }
  update(t) {
    this.onData(t);
  }
  panTo(t, o) {
    var s;
    (s = this.viewport) == null || s.panTo(t, o);
  }
  zoomTo(t) {
    var o;
    (o = this.viewport) == null || o.zoomTo(t);
  }
  fitToContent() {
    var s;
    if (!this.state) return;
    let t = 0, o = 0;
    for (const i of this.state.nodes.values())
      t = Math.max(t, (i.gx + i.gw) * 25), o = Math.max(o, (i.gy + i.gh) * 25);
    (s = this.viewport) == null || s.fitToContent(t + 50, o + 50);
  }
  destroy() {
    var t, o, s, i, a, r;
    (t = this.poller) == null || t.stop(), (o = this.viewport) == null || o.destroy(), (s = this.beltLayer) == null || s.destroy(), (i = this.entityLayer) == null || i.destroy(), (a = this.tokenLayer) == null || a.destroy(), (r = this.tooltip) == null || r.destroy();
  }
  startPolling(t) {
    this.poller = new wo(
      t,
      Number(this.getAttribute("poll-interval")) || 5e3,
      (o) => this.onData(o),
      (o) => this.showBanner(o, !0)
    ), this.poller.start();
  }
  onData(t) {
    var s, i, a;
    this.hideBanner(), this.prevState = this.state, this.state = Co(t);
    const o = $o(this.prevState, this.state);
    (s = this.beltLayer) == null || s.update(this.state), (i = this.entityLayer) == null || i.update(this.state), (a = this.tokenLayer) == null || a.update(this.state), this.renderServicesInHUD(this.state), this.updateSystemOverlay(t), this.dispatchEvent(new CustomEvent("floor-update", {
      detail: { generatedAt: t.generatedAt, diff: o }
    }));
  }
  selectEntity(t, o, s) {
    var i;
    this.deselectAll(), t.classList.add("ff-entity--selected"), (i = this.tooltip) == null || i.show(t, o, s, this.state), this.dispatchEvent(new CustomEvent("entity-click", {
      detail: { type: o, id: s, data: this.getEntityData(o, s) }
    }));
  }
  deselectAll() {
    var t;
    this.shadow.querySelectorAll(".ff-entity--selected").forEach((o) => {
      o.classList.remove("ff-entity--selected");
    }), (t = this.tooltip) == null || t.hide();
  }
  getEntityData(t, o) {
    var s;
    if (!this.state) return null;
    switch (t) {
      case "node":
        return (s = this.state.nodes.get(o)) == null ? void 0 : s.node;
      case "item":
        return this.state.items.get(o);
      case "actor":
        return this.state.actors.get(o);
      case "service":
        return this.state.services.get(o);
      case "incident":
        return this.state.incidents.get(o);
      default:
        return null;
    }
  }
  renderServicesInHUD(t) {
    const o = this.hudEl.querySelectorAll(".ff-service"), s = /* @__PURE__ */ new Set();
    for (const [i, a] of t.services) {
      s.add(i);
      let r = this.hudEl.querySelector(`.ff-service[data-service-id="${i}"]`);
      if (!r) {
        r = document.createElement("div"), r.classList.add("ff-service"), r.dataset.serviceId = i;
        const l = document.createElement("div");
        l.classList.add("ff-service__dot"), r.appendChild(l);
        const c = document.createElement("div");
        c.classList.add("ff-service__info");
        const h = document.createElement("span");
        h.classList.add("ff-service__name"), c.appendChild(h);
        const u = document.createElement("span");
        u.classList.add("ff-service__metric"), c.appendChild(u), r.appendChild(c), this.hudEl.appendChild(r);
      }
      r.className = `ff-service ff-service--${a.status}`, r.dataset.serviceId = i, r.querySelector(".ff-service__name").textContent = a.label, r.querySelector(".ff-service__metric").textContent = a.active ? "Active" : "Inactive";
      const f = r.querySelector(".ff-service__dot");
      f.className = `ff-service__dot ff-service__dot--${a.status}`;
    }
    o.forEach((i) => {
      const a = i.dataset.serviceId;
      a && !s.has(a) && i.remove();
    });
  }
  updateSystemOverlay(t) {
    const o = t.snapshot.incidents.some(
      (i) => i.kind === "rate-limit-cooldown" && i.status === "active"
    ), s = t.system.status === "degraded" || t.system.status === "down";
    this.worldEl.classList.toggle("ff-world--rate-limited", o), this.worldEl.classList.toggle("ff-world--degraded", s && !o), o && this.showBanner("⚠ Rate limited — system paused", !1);
  }
  buildDOM() {
    const t = document.createElement("style");
    t.textContent = No, this.shadow.appendChild(t), this.viewportEl = document.createElement("div"), this.viewportEl.classList.add("ff-viewport"), this.viewportEl.style.width = this.getAttribute("width") || "100%", this.viewportEl.style.height = this.getAttribute("height") || "600px", this.worldEl = document.createElement("div"), this.worldEl.classList.add("ff-world"), this.floorEl = document.createElement("div"), this.floorEl.classList.add("ff-floor"), this.getAttribute("grid-visible") === "false" && this.floorEl.classList.add("ff-floor--hidden"), this.worldEl.appendChild(this.floorEl), this.viewportEl.appendChild(this.worldEl), this.hudEl = document.createElement("div"), this.hudEl.classList.add("ff-hud"), this.viewportEl.appendChild(this.hudEl), this.shadow.appendChild(this.viewportEl);
  }
  showBanner(t, o) {
    this.bannerEl || (this.bannerEl = document.createElement("div"), this.bannerEl.classList.add("ff-hud__status-banner"), this.hudEl.appendChild(this.bannerEl)), this.bannerEl.textContent = t, this.bannerEl.classList.toggle("ff-hud__status-banner--error", o);
  }
  hideBanner() {
    var t;
    (t = this.bannerEl) == null || t.remove(), this.bannerEl = null;
  }
  readConfig() {
    return {
      cellSize: 25,
      panEnabled: this.getAttribute("pan") !== "false",
      zoomEnabled: this.getAttribute("zoom") !== "false",
      zoomMin: Number(this.getAttribute("zoom-min")) || 0.25,
      zoomMax: Number(this.getAttribute("zoom-max")) || 4,
      originX: Number(this.getAttribute("origin-x")) || 0,
      originY: Number(this.getAttribute("origin-y")) || 0,
      gridVisible: this.getAttribute("grid-visible") !== "false",
      muted: this.getAttribute("muted") !== "false"
    };
  }
}
p(Yt, "observedAttributes", [
  "url",
  "poll-interval",
  "width",
  "height",
  "pan",
  "zoom",
  "zoom-min",
  "zoom-max",
  "origin-x",
  "origin-y",
  "minimap",
  "grid-visible",
  "theme",
  "muted"
]);
typeof customElements < "u" && !customElements.get("openreactor-factory-floor") && customElements.define("openreactor-factory-floor", Yt);
export {
  Yt as FactoryFloorElement
};
