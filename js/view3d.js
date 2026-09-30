'use strict';

const View3D = (() => {
  const TYPE_COLOR = {
    concept: '#3b82f6',
    acteur: '#10b981',
    ressource: '#f59e0b',
    étape: '#8b5cf6',
    probleme: '#ef4444',
    problème: '#ef4444',
    objectif: '#f97316'
  };

  let canvas, ctx;
  let enabled = false;
  let layoutMode = 'tree';
  let running = false;
  let positions = new Map();
  let cam = { yaw: 0.55, pitch: 0.42, dist: 980, fov: 820 };
  let dragging = false;
  let lastPtr = null;
  let hoverId = null;
  let hits = [];
  let autoSpin = true;
  let lastMove = 0;
  let dpr = 1;

  function $(id) { return document.getElementById(id); }

  function themeInk() {
    return document.documentElement.dataset.theme === 'dark';
  }

  function resize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function childrenOf(id) {
    return graph.links.filter(e => e.from === id).map(e => e.to);
  }

  function findRoot() {
    if (!graph.nodes.length) return null;
    const incoming = new Map(graph.nodes.map(n => [n.id, 0]));
    graph.links.forEach(e => incoming.set(e.to, (incoming.get(e.to) || 0) + 1));
    return graph.nodes.find(n => incoming.get(n.id) === 0) || graph.nodes[0];
  }

  function layoutTree() {
    positions.clear();
    const root = findRoot();
    if (!root) return;
    const seen = new Set();
    function place(id, x, y, z, depth, wedge, angle) {
      if (seen.has(id)) return;
      seen.add(id);
      positions.set(id, { x, y, z, depth });
      const kids = childrenOf(id).filter(k => !seen.has(k));
      if (!kids.length) return;
      const span = Math.max(0.55, wedge);
      const start = angle - span / 2;
      const drop = 95 + depth * 12;
      const radius = 210 + depth * 28;
      kids.forEach((kid, i) => {
        const a = kids.length === 1 ? angle : start + span * (i + 0.5) / kids.length;
        const nx = x + Math.cos(a) * radius;
        const nz = z + Math.sin(a) * radius;
        const ny = y - drop;
        place(kid, nx, ny, nz, depth + 1, span / Math.max(1.15, kids.length * 0.72), a);
      });
    }
    place(root.id, 0, 80, 0, 0, Math.PI * 1.85, -Math.PI / 2);
    graph.nodes.forEach(n => {
      if (!positions.has(n.id)) {
        positions.set(n.id, {
          x: (n.x - 600) * 0.45,
          y: 40 - (n.y - 400) * 0.2,
          z: (n.y - 400) * 0.35,
          depth: 2
        });
      }
    });
  }

  function layoutSphere() {
    positions.clear();
    const n = graph.nodes.length;
    graph.nodes.forEach((node, i) => {
      const golden = Math.PI * (3 - Math.sqrt(5));
      const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const radius = 340;
      positions.set(node.id, {
        x: Math.cos(theta) * r * radius,
        y: y * radius * 0.85,
        z: Math.sin(theta) * r * radius,
        depth: 1
      });
    });
  }

  function layoutRelief() {
    positions.clear();
    const root = findRoot();
    const dist = new Map();
    if (root) {
      const q = [root.id];
      dist.set(root.id, 0);
      while (q.length) {
        const id = q.shift();
        for (const e of graph.links) {
          const nxt = e.from === id ? e.to : e.to === id ? e.from : null;
          if (nxt && !dist.has(nxt)) {
            dist.set(nxt, dist.get(id) + 1);
            q.push(nxt);
          }
        }
      }
    }
    const xs = graph.nodes.map(n => n.x);
    const ys = graph.nodes.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = 820 / Math.max(1, maxX - minX);
    const sy = 620 / Math.max(1, maxY - minY);
    graph.nodes.forEach(n => {
      const d = dist.get(n.id) || 0;
      positions.set(n.id, {
        x: (n.x - (minX + maxX) / 2) * sx,
        y: 140 - d * 78,
        z: (n.y - (minY + maxY) / 2) * sy,
        depth: d
      });
    });
  }

  function rebuild() {
    if (!graph.nodes.length) { positions.clear(); return; }
    if (layoutMode === 'sphere') layoutSphere();
    else if (layoutMode === 'relief') layoutRelief();
    else layoutTree();
  }

  function project(p) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    let x = p.x, y = p.y, z = p.z;
    let x1 = x * cy - z * sy;
    let z1 = x * sy + z * cy;
    let y2 = y * cp - z1 * sp;
    let z2 = y * sp + z1 * cp;
    const depth = z2 + cam.dist;
    const f = cam.fov / Math.max(60, depth);
    return {
      x: canvas.width / 2 + x1 * f * dpr,
      y: canvas.height / 2 - y2 * f * dpr,
      s: f,
      depth
    };
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrap(label, max) {
    const words = String(label || 'Sans titre').split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const n = (line + ' ' + w).trim();
      if (n.length > max && line) { lines.push(line); line = w; }
      else line = n;
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function draw() {
    if (!enabled || !ctx) return;
    resize();
    const dark = themeInk();
    const w = canvas.width, h = canvas.height;
    const bg0 = dark ? '#0b1220' : '#e8eef6';
    const bg1 = dark ? '#152036' : '#f8fafc';
    const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    g.addColorStop(0, bg1);
    g.addColorStop(1, bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // ground grid
    ctx.save();
    const gridY = -220;
    ctx.strokeStyle = dark ? 'rgba(148,163,184,.18)' : 'rgba(15,23,42,.08)';
    ctx.lineWidth = 1;
    for (let i = -5; i <= 5; i++) {
      const a = project({ x: i * 120, y: gridY, z: -600 });
      const b = project({ x: i * 120, y: gridY, z: 600 });
      const c = project({ x: -600, y: gridY, z: i * 120 });
      const d = project({ x: 600, y: gridY, z: i * 120 });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.restore();

    if (!graph.nodes.length) {
      ctx.fillStyle = dark ? '#93a0b5' : '#5b677a';
      ctx.font = `${14 * dpr}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Détectez un schéma pour explorer la carte en 3D.', w / 2, h / 2);
      return;
    }

    const byId = Object.fromEntries(graph.nodes.map(n => [n.id, n]));
    const edges = [];
    for (const l of graph.links) {
      const a = positions.get(l.from), b = positions.get(l.to);
      if (!a || !b) continue;
      const pa = project(a), pb = project(b);
      edges.push({ l, pa, pb, depth: (pa.depth + pb.depth) / 2 });
    }
    edges.sort((a, b) => b.depth - a.depth);
    for (const e of edges) {
      const sel = selected?.kind === 'edge' && selected.id === e.l.id;
      ctx.strokeStyle = sel ? '#2563eb' : e.l.verified ? '#059669' : (dark ? 'rgba(148,163,184,.55)' : 'rgba(71,85,105,.55)');
      ctx.lineWidth = (sel ? 3.2 : e.l.type === 'flow' ? 2.6 : 1.6) * dpr;
      ctx.setLineDash(e.l.type === 'hypothesis' ? [8 * dpr, 6 * dpr] : []);
      ctx.beginPath();
      const mx = (e.pa.x + e.pb.x) / 2;
      const my = (e.pa.y + e.pb.y) / 2 - 24 * dpr * ((e.pa.s + e.pb.s) / 2);
      ctx.moveTo(e.pa.x, e.pa.y);
      ctx.quadraticCurveTo(mx, my, e.pb.x, e.pb.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (e.l.label) {
        ctx.fillStyle = dark ? '#cbd5e1' : '#475569';
        ctx.font = `${10 * dpr}px IBM Plex Sans, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(e.l.label, mx, my - 4 * dpr);
      }
    }

    hits = [];
    const nodes = graph.nodes.map(n => {
      const p = positions.get(n.id) || { x: 0, y: 0, z: 0, depth: 0 };
      return { n, p, pr: project(p) };
    }).sort((a, b) => b.pr.depth - a.pr.depth);

    for (const item of nodes) {
      const { n, pr } = item;
      const scale = Math.max(0.35, Math.min(1.35, 520 / pr.depth));
      const lines = wrap(n.label, 16);
      const cardW = (Math.max(118, Math.min(210, 18 + Math.max(...lines.map(x => x.length)) * 7.4))) * scale * dpr;
      const cardH = (36 + lines.length * 16) * scale * dpr;
      const x = pr.x - cardW / 2;
      const y = pr.y - cardH / 2;
      const isSel = selected?.kind === 'node' && selected.id === n.id;
      const isHover = hoverId === n.id;
      const color = TYPE_COLOR[n.type] || '#3b82f6';

      ctx.save();
      ctx.shadowColor = isSel ? color : 'rgba(0,0,0,.18)';
      ctx.shadowBlur = (isSel ? 22 : 10) * dpr;
      roundedRect(x, y, cardW, cardH, 10 * dpr * scale);
      ctx.fillStyle = dark ? '#151c2b' : '#ffffff';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = (isSel || isHover ? 3 : 1.5) * dpr;
      ctx.strokeStyle = isSel ? color : n.verified ? '#059669' : (dark ? '#334155' : '#d0d7e2');
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.fillRect(x, y + 8 * dpr * scale, 4 * dpr, cardH - 16 * dpr * scale);

      ctx.fillStyle = dark ? '#e8eef7' : '#0b1220';
      ctx.font = `${700} ${13 * scale * dpr}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.fillText(line, x + 14 * dpr * scale, y + 10 * dpr * scale + i * 16 * scale * dpr, cardW - 22 * dpr * scale);
      });
      ctx.restore();

      hits.push({ id: n.id, x, y, w: cardW, h: cardH, depth: pr.depth });
    }

    ctx.fillStyle = dark ? '#93a0b5' : '#64748b';
    ctx.font = `${11 * dpr}px IBM Plex Sans, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Glisser : orbite   Molette : zoom   Clic : sélection   3 : vue 3D', 14 * dpr, h - 16 * dpr);
  }

  function loop() {
    if (!enabled) { running = false; return; }
    running = true;
    if (autoSpin && Date.now() - lastMove > 1600 && !dragging) cam.yaw += 0.0032;
    draw();
    requestAnimationFrame(loop);
  }

  function hitTest(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    const x = (cx - rect.left) * dpr;
    const y = (cy - rect.top) * dpr;
    const ordered = hits.slice().sort((a, b) => a.depth - b.depth);
    return ordered.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
  }

  function bind() {
    canvas.addEventListener('pointerdown', e => {
      if (!enabled) return;
      canvas.setPointerCapture(e.pointerId);
      const hit = hitTest(e.clientX, e.clientY);
      if (hit) {
        selected = { kind: 'node', id: hit.id };
        autoSpin = false;
        renderAll();
        return;
      }
      dragging = true;
      autoSpin = false;
      lastPtr = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointermove', e => {
      if (!enabled) return;
      lastMove = Date.now();
      const hit = hitTest(e.clientX, e.clientY);
      hoverId = hit ? hit.id : null;
      canvas.style.cursor = dragging ? 'grabbing' : (hit ? 'pointer' : 'grab');
      if (!dragging || !lastPtr) return;
      const dx = e.clientX - lastPtr.x;
      const dy = e.clientY - lastPtr.y;
      cam.yaw += dx * 0.008;
      cam.pitch = Math.max(-1.15, Math.min(1.25, cam.pitch + dy * 0.006));
      lastPtr = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', () => { dragging = false; lastPtr = null; });
    canvas.addEventListener('pointerleave', () => { dragging = false; hoverId = null; });
    canvas.addEventListener('wheel', e => {
      if (!enabled) return;
      e.preventDefault();
      lastMove = Date.now();
      autoSpin = false;
      cam.dist = Math.max(280, Math.min(2400, cam.dist + e.deltaY * 0.9));
    }, { passive: false });
  }

  function setEnabled(on) {
    enabled = !!on;
    const stage = $('view3d');
    const svg = $('stage');
    if (stage) stage.classList.toggle('on', enabled);
    if (svg) svg.classList.toggle('hiddenBy3d', enabled);
    $('btn2d')?.classList.toggle('active', !enabled);
    $('btn3d')?.classList.toggle('active', enabled);
    if (enabled) {
      rebuild();
      resize();
      lastMove = Date.now();
      if (!running) loop();
    }
  }

  function setLayout(mode) {
    layoutMode = mode;
    document.querySelectorAll('[data-layout3d]').forEach(b => b.classList.toggle('active', b.dataset.layout3d === mode));
    rebuild();
  }

  function sync() {
    rebuild();
    if (enabled) draw();
  }

  function init() {
    canvas = $('view3d');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    bind();
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (enabled) resize(); }).observe(canvas.parentElement || canvas);
    window.addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === '3' && !e.ctrlKey && !e.metaKey) setEnabled(!enabled);
      if (enabled && e.key === ' ') { e.preventDefault(); autoSpin = !autoSpin; }
    });
  }

  return { init, setEnabled, setLayout, sync, isEnabled: () => enabled };
})();
