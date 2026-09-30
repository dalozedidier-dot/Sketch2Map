'use strict';

const Studio = (() => {
  const DB_NAME = 'sketch2map-studio';
  const DB_VERSION = 1;
  const STORE = 'projects';
  let currentProjectId = localStorage.getItem('s2m_current_id') || uid('p');
  let dirty = false;
  let autosaveTimer = null;
  let theme = localStorage.getItem('s2m_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  function $(id) { return document.getElementById(id); }

  function toast(text) {
    const wrap = $('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function setStatusBar(left, right) {
    if (left) $('statusLeft').textContent = left;
    if (right) $('statusRight').textContent = right;
  }

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('s2m_theme', theme);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(project) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGet(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function projectPayload() {
    return {
      id: currentProjectId,
      title: $('projectTitle').value.trim() || 'Projet sans titre',
      updatedAt: Date.now(),
      version: 7,
      graph,
      training,
      imageDataUrl,
      rotation,
      contrastOn,
      sourceWidth,
      sourceHeight,
      sourceMP,
      detectMode: $('detectMode').value,
      analysisQuality: $('analysisQuality').value
    };
  }

  async function persist(showToast = false) {
    try {
      const payload = projectPayload();
      await idbPut(payload);
      localStorage.setItem('s2m_current_id', currentProjectId);
      try {
        localStorage.setItem('sketch2map_v6', JSON.stringify({
          graph, imageDataUrl, rotation, contrastOn, sourceWidth, sourceHeight, sourceMP, training
        }));
      } catch {}
      dirty = false;
      setStatusBar(`Enregistré · ${payload.title} · ${new Date(payload.updatedAt).toLocaleTimeString()}`);
      if (showToast) toast('Projet enregistré localement');
    } catch (err) {
      setStatus('Sauvegarde IndexedDB impossible. Exportez le JSON.', 'warn');
    }
  }

  async function restoreProject(project) {
    currentProjectId = project.id;
    localStorage.setItem('s2m_current_id', currentProjectId);
    $('projectTitle').value = project.title || 'Projet sans titre';
    graph = project.graph || { nodes: [], links: [] };
    training = project.training || { color: null, count: 0 };
    rotation = project.rotation || 0;
    contrastOn = !!project.contrastOn;
    if (project.detectMode) $('detectMode').value = project.detectMode;
    if (project.analysisQuality) $('analysisQuality').value = project.analysisQuality;
    selected = null;
    if (project.imageDataUrl) {
      await loadImageSource(project.imageDataUrl, 'Projet restauré');
      rotation = project.rotation || 0;
      contrastOn = !!project.contrastOn;
      makePreview();
      resizePhotoCanvas();
    } else {
      imageDataUrl = '';
      photoImg = new Image();
      sourceWidth = sourceHeight = sourceMP = 0;
      $('preview').removeAttribute('src');
      $('emptyPreview').style.display = 'flex';
      updatePhotoMeta();
    }
    renderAll();
    fitMap();
    dirty = false;
    toast('Projet ouvert');
  }

  async function renderProjects() {
    const list = $('projectsList');
    const items = (await idbAll()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!items.length) {
      list.innerHTML = '<p class="hint">Aucun projet enregistré pour le moment.</p>';
      return;
    }
    list.innerHTML = items.map(p => `
      <div class="projectCard" data-id="${p.id}">
        <strong>${escapeHtml(p.title || 'Sans titre')}</strong>
        <span>${new Date(p.updatedAt || 0).toLocaleString()} · ${(p.graph?.nodes || []).length} nœuds · ${(p.graph?.links || []).length} relations</span>
        <div class="row" style="margin-top:8px">
          <button class="btn small" data-open="${p.id}">Ouvrir</button>
          <button class="btn secondary small" data-del="${p.id}">Supprimer</button>
        </div>
      </div>`).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function markDirty() {
    dirty = true;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => persist(false), 4000);
  }

  function showOverlay(title, text) {
    $('overlayTitle').textContent = title;
    $('overlayText').textContent = text;
    $('overlay').classList.add('on');
  }
  function hideOverlay() { $('overlay').classList.remove('on'); }

  function treeFromGraph() {
    if (!graph.nodes.length) return null;
    const incoming = new Map(graph.nodes.map(n => [n.id, 0]));
    graph.links.forEach(e => incoming.set(e.to, (incoming.get(e.to) || 0) + 1));
    const root = graph.nodes.find(n => incoming.get(n.id) === 0) || graph.nodes[0];
    const seen = new Set();
    function rec(node, depth = 0) {
      if (!node || seen.has(node.id)) return [];
      seen.add(node.id);
      const children = graph.links.filter(e => e.from === node.id)
        .map(e => graph.nodes.find(x => x.id === e.to))
        .filter(Boolean);
      return [{ node, depth }, ...children.flatMap(ch => rec(ch, depth + 1))];
    }
    return rec(root);
  }

  function exportMarkdown() {
    const tree = treeFromGraph() || graph.nodes.map(n => ({ node: n, depth: 0 }));
    const lines = [`# ${$('projectTitle').value}`, '', `_Export Sketch2Map Studio · ${new Date().toLocaleString()}_`, ''];
    for (const item of tree) {
      const n = item.node;
      lines.push(`${'  '.repeat(item.depth)}- **${n.label || 'Sans titre'}**${n.type ? ` (${n.type})` : ''}${n.notes ? ` — ${n.notes}` : ''}`);
    }
    const orphans = graph.links.filter(e => e.label);
    if (orphans.length) {
      lines.push('', '## Relations nommées');
      orphans.forEach(e => {
        const a = graph.nodes.find(n => n.id === e.from);
        const b = graph.nodes.find(n => n.id === e.to);
        lines.push(`- ${a?.label || '?'} —${e.label}→ ${b?.label || '?'} (${e.type || ''})`);
      });
    }
    return lines.join('\n');
  }

  function mermaidId(label, id) {
    const clean = String(label || id).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 28) || id;
    return `${clean}_${id.slice(-4)}`;
  }

  function exportMermaid() {
    const lines = ['flowchart LR'];
    for (const n of graph.nodes) {
      const id = mermaidId(n.label, n.id);
      lines.push(`  ${id}["${(n.label || 'Sans titre').replace(/"/g, "'")}"]`);
    }
    for (const e of graph.links) {
      const a = graph.nodes.find(n => n.id === e.from);
      const b = graph.nodes.find(n => n.id === e.to);
      if (!a || !b) continue;
      const label = e.label ? `|${e.label}|` : '';
      lines.push(`  ${mermaidId(a.label, a.id)} -->${label} ${mermaidId(b.label, b.id)}`);
    }
    return lines.join('\n');
  }

  function exportOPML() {
    const tree = treeFromGraph();
    const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    if (!tree) return `<?xml version="1.0"?><opml version="2.0"><head><title>${esc($('projectTitle').value)}</title></head><body></body></opml>`;
    const byParent = new Map();
    const incoming = new Map(graph.nodes.map(n => [n.id, []]));
    graph.links.forEach(e => incoming.set(e.to, (incoming.get(e.to) || []).concat(e.from)));
    function outline(node, seen = new Set()) {
      if (!node || seen.has(node.id)) return '';
      seen.add(node.id);
      const kids = graph.links.filter(e => e.from === node.id).map(e => graph.nodes.find(x => x.id === e.to)).filter(Boolean);
      return `<outline text="${esc(node.label)}">${kids.map(k => outline(k, seen)).join('')}</outline>`;
    }
    const root = tree[0].node;
    return `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>${esc($('projectTitle').value)}</title></head><body>${outline(root)}</body></opml>`;
  }

  const originalAnalyze = analyzeLocal;
  analyzeLocal = async function wrappedAnalyze() {
    const t0 = performance.now();
    showOverlay('Analyse locale', 'Lecture des traits, fermeture des formes et reconstruction du graphe. Aucun envoi réseau.');
    setStatusBar('Analyse en cours…');
    try {
      await originalAnalyze();
      const ms = Math.round(performance.now() - t0);
      setStatusBar(`${graph.nodes.length} nœuds · ${graph.links.length} relations · ${ms} ms`);
      toast('Détection terminée');
      markDirty();
    } finally {
      hideOverlay();
    }
  };

  const originalExport = doExport;
  doExport = function wrappedExport() {
    const t = $('exportSelect').value;
    const slug = ($('projectTitle').value || 'sketch2map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sketch2map';
    if (t === 'json') {
      download(`${slug}.s2m.json`, 'application/json', JSON.stringify({
        version: 7,
        title: $('projectTitle').value,
        exportedAt: new Date().toISOString(),
        graph,
        training,
        source: { width: sourceWidth, height: sourceHeight, rotation, contrastOn }
      }, null, 2));
      toast('JSON exporté');
      return;
    }
    if (t === 'md') { download(`${slug}.md`, 'text/markdown', exportMarkdown()); toast('Markdown exporté'); return; }
    if (t === 'mermaid') { download(`${slug}.mmd`, 'text/plain', exportMermaid()); toast('Mermaid exporté'); return; }
    if (t === 'opml') { download(`${slug}.opml`, 'text/xml', exportOPML()); toast('OPML exporté'); return; }
    originalExport();
  };

  saveLocal = () => persist(true);
  loadLocal = async () => {
    $('projectsOverlay').classList.add('on');
    await renderProjects();
  };

  const commands = [
    { id: 'analyze', label: 'Détecter / réanalyser', run: () => analyzeLocal() },
    { id: 'save', label: 'Enregistrer le projet', run: () => persist(true) },
    { id: 'projects', label: 'Ouvrir la bibliothèque de projets', run: loadLocal },
    { id: 'export-json', label: 'Exporter JSON', run: () => { $('exportSelect').value = 'json'; doExport(); } },
    { id: 'export-md', label: 'Exporter Markdown', run: () => { $('exportSelect').value = 'md'; doExport(); } },
    { id: 'export-mermaid', label: 'Exporter Mermaid', run: () => { $('exportSelect').value = 'mermaid'; doExport(); } },
    { id: 'layout', label: 'Auto-layout', run: () => autoLayout() },
    { id: 'fit', label: 'Ajuster la carte', run: () => fitMap() },
    { id: 'view-photo', label: 'Photo en grand', run: () => $('viewPhotoBtn').click() },
    { id: 'view-split', label: 'Vue partagée Photo + Carte', run: () => $('viewSplitBtn').click() },
    { id: 'view-map', label: 'Carte / 3D en grand', run: () => $('viewMapBtn').click() },
    { id: '3d', label: 'Basculer la vue 3D', run: () => View3D.setEnabled(!View3D.isEnabled()) },
    { id: '3d-tree', label: 'Layout 3D arbre', run: () => { View3D.setEnabled(true); View3D.setLayout('tree'); } },
    { id: '3d-relief', label: 'Layout 3D relief', run: () => { View3D.setEnabled(true); View3D.setLayout('relief'); } },
    { id: '3d-sphere', label: 'Layout 3D sphère', run: () => { View3D.setEnabled(true); View3D.setLayout('sphere'); } },
    { id: 'undo', label: 'Annuler', run: () => undo() },
    { id: 'redo', label: 'Rétablir', run: () => redo() },
    { id: 'theme', label: 'Basculer le thème', run: () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(); } },
    { id: 'example', label: 'Charger l’exemple organique', run: () => $('exampleBtn').click() }
  ];

  function openCommand() {
    $('commandPalette').classList.add('on');
    $('commandInput').value = '';
    renderCommands('');
    $('commandInput').focus();
  }
  function closeCommand() { $('commandPalette').classList.remove('on'); }

  function renderCommands(q) {
    const query = q.trim().toLowerCase();
    const nodeHits = graph.nodes.filter(n => (n.label || '').toLowerCase().includes(query)).slice(0, 8)
      .map(n => ({ id: 'node:' + n.id, label: 'Aller à · ' + (n.label || 'Sans titre'), run: () => {
        selected = { kind: 'node', id: n.id };
        setMobilePane('map');
        renderAll();
      }}));
    const hits = [...commands.filter(c => c.label.toLowerCase().includes(query)), ...nodeHits].slice(0, 12);
    $('commandList').innerHTML = hits.map((c, i) => `<div class="cmdItem${i === 0 ? ' active' : ''}" data-id="${c.id}">${escapeHtml(c.label)}</div>`).join('') || '<div class="cmdItem">Aucun résultat</div>';
    $('commandList').querySelectorAll('.cmdItem').forEach(el => {
      el.onclick = () => {
        const item = hits.find(h => h.id === el.dataset.id);
        closeCommand();
        item?.run();
      };
    });
  }

  function bindStudio() {
    applyTheme();
    $('themeBtn').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(); };
    $('helpBtn').onclick = () => $('helpOverlay').classList.add('on');
    $('closeHelpBtn').onclick = () => $('helpOverlay').classList.remove('on');
    $('commandBtn').onclick = openCommand;
    $('commandInput').addEventListener('input', e => renderCommands(e.target.value));
    $('toggleSideBtn').onclick = () => {
      $('side').classList.toggle('collapsed');
      $('workspace').classList.toggle('collapsed');
      setTimeout(() => { resizePhotoCanvas(); renderMap(); }, 30);
    };
    $('loadBtn').onclick = loadLocal;
    $('saveBtn').onclick = () => persist(true);
    $('closeProjectsBtn').onclick = () => $('projectsOverlay').classList.remove('on');
    $('newProjectBtn').onclick = async () => {
      await persist(false);
      currentProjectId = uid('p');
      $('projectTitle').value = 'Nouveau projet';
      graph = { nodes: [], links: [] };
      selected = null;
      training = { color: null, count: 0 };
      $('clearImageBtn').click();
      $('projectsOverlay').classList.remove('on');
      toast('Nouveau projet');
    };
    $('projectsList').addEventListener('click', async e => {
      const open = e.target.closest('[data-open]');
      const del = e.target.closest('[data-del]');
      if (open) {
        const p = await idbGet(open.dataset.open);
        if (p) await restoreProject(p);
        $('projectsOverlay').classList.remove('on');
      } else if (del) {
        if (confirm('Supprimer ce projet local ?')) {
          await idbDelete(del.dataset.del);
          await renderProjects();
        }
      }
    });

    $('projectTitle').addEventListener('input', markDirty);
    $('nodeNotes')?.addEventListener('input', () => {
      const n = graph.nodes.find(x => x.id === selected?.id);
      if (n) { n.notes = $('nodeNotes').value; markDirty(); }
    });
    $('searchInput').addEventListener('input', () => {
      const q = $('searchInput').value.trim().toLowerCase();
      if (!q) return;
      const n = graph.nodes.find(x => (x.label || '').toLowerCase().includes(q));
      if (n) { selected = { kind: 'node', id: n.id }; renderAll(); }
    });
    if ($('mobileAnalyze')) $('mobileAnalyze').onclick = () => analyzeLocal();

    function setWorkspaceView(mode) {
      const split = $('split');
      split.classList.remove('view-photo', 'view-map');
      if (mode === 'photo') split.classList.add('view-photo');
      if (mode === 'map') split.classList.add('view-map');
      $('viewPhotoBtn')?.classList.toggle('active', mode === 'photo');
      $('viewSplitBtn')?.classList.toggle('active', mode === 'split');
      $('viewMapBtn')?.classList.toggle('active', mode === 'map');
      localStorage.setItem('s2m_view', mode);
      setTimeout(() => {
        resizePhotoCanvas();
        renderMap();
        View3D.sync();
      }, 30);
    }
    $('viewPhotoBtn').onclick = () => setWorkspaceView('photo');
    $('viewSplitBtn').onclick = () => setWorkspaceView('split');
    $('viewMapBtn').onclick = () => setWorkspaceView('map');
    $('photoMaxBtn').onclick = () => setWorkspaceView($('split').classList.contains('view-photo') ? 'split' : 'photo');
    $('mapMaxBtn').onclick = () => setWorkspaceView($('split').classList.contains('view-map') ? 'split' : 'map');
    $('photoZoomIn').onclick = () => zoomPhotoAt(1.25);
    $('photoZoomOut').onclick = () => zoomPhotoAt(0.8);
    $('photoFitBtn').onclick = () => resetPhotoCam();
    const savedView = localStorage.getItem('s2m_view');
    if (savedView) setWorkspaceView(savedView);

    const splitter = $('splitter');
    let draggingSplit = false;
    splitter.addEventListener('pointerdown', e => {
      draggingSplit = true;
      splitter.classList.add('dragging');
      splitter.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointermove', e => {
      if (!draggingSplit) return;
      const rect = $('split').getBoundingClientRect();
      const pct = Math.max(22, Math.min(78, ((e.clientX - rect.left) / rect.width) * 100));
      $('split').style.setProperty('--split-left', pct + '%');
      localStorage.setItem('s2m_split', pct);
    });
    window.addEventListener('pointerup', () => {
      if (!draggingSplit) return;
      draggingSplit = false;
      splitter.classList.remove('dragging');
      resizePhotoCanvas();
      renderMap();
      View3D.sync();
    });
    const savedSplit = Number(localStorage.getItem('s2m_split'));
    if (savedSplit) $('split').style.setProperty('--split-left', savedSplit + '%');

    splitter.addEventListener('dblclick', () => {
      $('split').style.setProperty('--split-left', '50%');
      localStorage.setItem('s2m_split', 50);
      resizePhotoCanvas();
      renderMap();
    });

    View3D.init();
    $('btn2d').onclick = () => View3D.setEnabled(false);
    $('btn3d').onclick = () => { View3D.setEnabled(true); View3D.setLayout(document.querySelector('[data-layout3d].active')?.dataset.layout3d || 'tree'); };
    document.querySelectorAll('[data-layout3d]').forEach(b => {
      b.onclick = () => { View3D.setEnabled(true); View3D.setLayout(b.dataset.layout3d); };
    });
    $('layoutTreeBtn')?.classList.add('active');
    $('tab3d')?.addEventListener('click', () => {
      setMobilePane('map');
      $('tabMap').classList.remove('active');
      $('tab3d').classList.add('active');
      View3D.setEnabled(true);
    });
    $('tabMap')?.addEventListener('click', () => View3D.setEnabled(false));
    $('tabPhoto')?.addEventListener('click', () => $('tab3d')?.classList.remove('active'));

    const originalRenderAll = renderAll;
    renderAll = function () {
      originalRenderAll();
      View3D.sync();
    };

    const originalUpdateUI = updateUI;
    updateUI = function() {
      originalUpdateUI();
      const n = selected?.kind === 'node' ? graph.nodes.find(x => x.id === selected.id) : null;
      if (n && $('nodeNotes')) $('nodeNotes').value = n.notes || '';
    };

    const originalSnapshot = snapshot;
    snapshot = function() { originalSnapshot(); markDirty(); };

    document.addEventListener('dragover', e => { e.preventDefault(); $('dropOverlay').classList.add('on'); });
    document.addEventListener('dragleave', e => { if (e.relatedTarget === null) $('dropOverlay').classList.remove('on'); });
    document.addEventListener('drop', async e => {
      e.preventDefault();
      $('dropOverlay').classList.remove('on');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type.startsWith('image/')) loadFile(file);
      else if (file.name.endsWith('.json')) {
        try {
          const data = JSON.parse(await file.text());
          if (data.graph) {
            await restoreProject({
              id: uid('p'),
              title: data.title || file.name,
              graph: data.graph,
              training: data.training || { color: null, count: 0 },
              imageDataUrl: data.imageDataUrl || '',
              rotation: data.source?.rotation || 0,
              contrastOn: !!data.source?.contrastOn
            });
          }
        } catch { toast('JSON illisible'); }
      }
    });

    window.addEventListener('keydown', e => {
      const inField = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommand(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); persist(true); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); analyzeLocal(); }
      else if (e.key === 'Escape') {
        closeCommand();
        $('helpOverlay').classList.remove('on');
        $('projectsOverlay').classList.remove('on');
      } else if (!inField && !e.ctrlKey && !e.metaKey) {
        const map = { '1': 'select', '2': 'trace', '3': 'link', '4': 'cut', '5': 'add' };
        if (map[e.key]) setTool(map[e.key]);
        if (e.key === '?') $('helpOverlay').classList.add('on');
      }
    });

    $('file').addEventListener('change', async ev => {
      const file = ev.target.files?.[0];
      if (file && file.name.endsWith('.json')) {
        ev.stopImmediatePropagation?.();
        try {
          const data = JSON.parse(await file.text());
          if (data.graph) await restoreProject({
            id: uid('p'), title: data.title || file.name, graph: data.graph,
            training: data.training || { color: null, count: 0 },
            imageDataUrl: data.imageDataUrl || '', rotation: data.source?.rotation || 0
          });
        } catch { toast('JSON illisible'); }
      }
    }, true);

    idbGet(currentProjectId).then(p => { if (p && !graph.nodes.length && !imageDataUrl) restoreProject(p); }).catch(() => {});
    setStatusBar('Studio prêt · détection 100 % locale');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindStudio);
  else bindStudio();

  return { persist, toast };
})();
