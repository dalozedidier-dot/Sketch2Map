'use strict';
// A reading surface over the existing graph. It never changes graph data.
(() => {
  const panel = document.getElementById('readPanel');
  const list = document.getElementById('readList');
  const search = document.getElementById('readSearch');
  const button = document.getElementById('readBtn');
  let lastSignature = '';

  function orderedNodes() {
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const incoming = new Map(graph.nodes.map(n => [n.id, 0]));
    const children = new Map(graph.nodes.map(n => [n.id, []]));
    for (const edge of graph.links) {
      if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
      incoming.set(edge.to, incoming.get(edge.to) + 1);
      children.get(edge.from).push(edge.to);
    }
    const spatial = (a, b) => a.y - b.y || a.x - b.x;
    const roots = graph.nodes.filter(n => !incoming.get(n.id)).sort(spatial);
    const order = [], seen = new Set();
    function visit(node, depth) {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      order.push({ node, depth });
      children.get(node.id).map(id => byId.get(id)).sort(spatial).forEach(child => visit(child, depth + 1));
    }
    roots.forEach(node => visit(node, 0));
    graph.nodes.filter(n => !seen.has(n.id)).sort(spatial).forEach(node => visit(node, 0));
    return order;
  }

  function refresh() {
    if (panel.hidden) return;
    const signature = JSON.stringify([graph.nodes.map(n => [n.id, n.label, n.verified]), graph.links.map(e => [e.from, e.to]), search.value]);
    if (signature !== lastSignature) {
      lastSignature = signature;
      list.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase();
      const nodes = orderedNodes();
      const matches = nodes.filter(({ node }) => !query || (node.label || '').toLocaleLowerCase().includes(query));
      document.getElementById('readSummary').textContent = `${graph.nodes.length} élément${graph.nodes.length > 1 ? 's' : ''} · ${graph.links.length} relation${graph.links.length > 1 ? 's' : ''} · ${matches.length} affiché${matches.length > 1 ? 's' : ''}`;
      if (!matches.length) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = graph.nodes.length ? 'Aucun élément ne correspond à cette recherche.' : 'Importez une image ou ajoutez un élément pour commencer.';
        list.append(empty);
      }
      for (const { node, depth } of matches) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'readItem';
        item.dataset.nodeId = node.id;
        item.style.setProperty('--depth', String(Math.min(depth, 5)));
        const title = document.createElement('span');
        title.className = 'readLabel';
        title.textContent = node.label || 'Sans titre';
        const meta = document.createElement('span');
        meta.className = 'readMeta';
        meta.textContent = node.verified ? 'Vérifié' : `${graph.links.filter(e => e.from === node.id || e.to === node.id).length} lien(s)`;
        item.append(title, meta);
        list.append(item);
      }
    }
    for (const item of list.querySelectorAll('.readItem')) {
      const current = selected?.kind === 'node' && selected.id === item.dataset.nodeId;
      item.classList.toggle('current', current);
      if (current) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    }
  }

  function open(opened) {
    panel.hidden = !opened;
    button.classList.toggle('active', opened);
    button.setAttribute('aria-expanded', String(opened));
    if (opened) { lastSignature = ''; refresh(); }
  }
  button.addEventListener('click', () => open(panel.hidden));
  document.getElementById('readClose').addEventListener('click', () => open(false));
  search.addEventListener('input', refresh);
  list.addEventListener('click', event => {
    const item = event.target.closest('.readItem');
    if (!item) return;
    const node = graph.nodes.find(n => n.id === item.dataset.nodeId);
    if (!node) return;
    if (window.View3D?.setEnabled) View3D.setEnabled(false);
    selected = { kind: 'node', id: node.id };
    view.x = node.x - view.w / 2;
    view.y = node.y - view.h / 2;
    renderAll();
  });
  document.getElementById('mapZoomIn').addEventListener('click', () => zoomMap(0.8));
  document.getElementById('mapZoomOut').addEventListener('click', () => zoomMap(1.25));
  document.getElementById('mapFit').addEventListener('click', fitMap);
  const previous = renderMap;
  renderMap = function (...args) { const result = previous(...args); refresh(); return result; };
})();
