/* ═══════════════════════════════════════════
   IPTV NOVA — Application Logic
   ═══════════════════════════════════════════ */

// ══ STATE ══
const S = {
  host: '', user: '', pass: '',
  tab: 'live',
  cats: { live: [], vod: [], series: [] },
  activeCat: { live: null, vod: null, series: null },
  allChannels: [],
  current: null,
  hls: null,
  favs: new Set(),
  history: [],
  viewMode: 'grid',
  sidebarTab: 'categories',
  theme: localStorage.getItem('nova_theme') || 'dark',
};

const STORE = {
  ACCS: 'nova_accounts',
  FAVS: 'nova_favorites',
  HIST: 'nova_history',
  LAST: 'nova_last',
  THEME: 'nova_theme',
};

// ═─ EPG CACHE ═─
const EPG = {};
let epgTimer = null;

// ══ UTILS ══
const $ = id => document.getElementById(id);
const esc = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
const toast = (msg, ms = 2500) => {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 300); }, ms);
};

const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const favKey = ch => `${S.tab}|${ch.id}`;
const detectQuality = name => {
  const n = (name || '').toUpperCase();
  if (/\b(UHD|4K|2160)/.test(n)) return 'UHD';
  if (/\b(FHD|1080[Pi]?)/.test(n)) return 'FHD';
  if (/\b(HD|720[Pi]?)\b/.test(n)) return 'HD';
  return null;
};

const fmtTime = secs => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ══ THEME ═─
function initTheme() {
  if (S.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
}

function toggleTheme() {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', S.theme === 'light' ? 'light' : '');
  localStorage.setItem(STORE.THEME, S.theme);
  toast(S.theme === 'light' ? '☀️ Light mode' : '🌙 Dark mode');
}

// ══ AUTH ══
function initLogin() {
  const last = lsGet(STORE.LAST);
  if (last) {
    $('lHost').value = last.host || '';
    $('lUser').value = last.user || '';
    $('lPass').value = last.pass || '';
  }
  renderSavedAccounts();
}

function renderSavedAccounts() {
  const accs = lsGet(STORE.ACCS) || [];
  $('savedAccounts').innerHTML = accs.map(a => `
    <div class="saved-chip" onclick='fillAccount(${JSON.stringify(JSON.stringify(a))})'>
      <span class="saved-chip-host">${esc(a.host)}</span>
      <span class="saved-chip-user">${esc(a.user)}</span>
      <button class="saved-chip-delete" onclick="event.stopPropagation();deleteAccount('${esc(a.host)}','${esc(a.user)}')" title="Delete">✕</button>
    </div>
  `).join('');
}

function fillAccount(json) {
  const a = JSON.parse(json);
  $('lHost').value = a.host;
  $('lUser').value = a.user;
  $('lPass').value = a.pass;
}

function deleteAccount(host, user) {
  let accs = lsGet(STORE.ACCS) || [];
  accs = accs.filter(a => !(a.host === host && a.user === user));
  lsSet(STORE.ACCS, accs);
  renderSavedAccounts();
  toast('Account deleted');
}

function pasteHost() {
  navigator.clipboard?.readText().then(t => { if (t) $('lHost').value = t.trim(); }).catch(() => {});
}

function togglePassword() {
  const inp = $('lPass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function doLogin(e) {
  e.preventDefault();
  const btn = $('loginBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  btn.disabled = true;

  let hostRaw = $('lHost').value.trim().replace(/\/$/, '');
  let user = $('lUser').value.trim();
  let pass = $('lPass').value.trim();

  // Parse full URL
  try {
    const u = new URL(hostRaw);
    if (u.searchParams.get('username') && u.searchParams.get('password')) {
      hostRaw = u.origin;
      user = user || u.searchParams.get('username');
      pass = pass || u.searchParams.get('password');
    } else {
      const p = u.pathname.split('/').filter(Boolean);
      if (p.length >= 3) {
        hostRaw = u.origin;
        user = user || p[1];
        pass = pass || p[2];
      }
    }
  } catch {}

  if (!hostRaw || !user || !pass) {
    toast('⚠️ Fill all fields');
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
    btn.disabled = false;
    return;
  }

  S.host = hostRaw;
  S.user = user;
  S.pass = pass;

  // Save
  lsSet(STORE.LAST, { host: hostRaw, user, pass });
  let accs = lsGet(STORE.ACCS) || [];
  accs = accs.filter(a => !(a.host === hostRaw && a.user === user));
  accs.unshift({ host: hostRaw, user, pass });
  lsSet(STORE.ACCS, accs.slice(0, 8));

  // Test connection
  try {
    await api('get_live_categories');
  } catch (err) {
    toast('❌ Connection failed');
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
    btn.disabled = false;
    return;
  }

  loadPersist();
  $('loginScreen').classList.remove('active');
  $('appScreen').classList.add('active');
  updateAccountBadge();
  await loadTab('live');

  // Android mode
  if (typeof AndroidPlayer !== 'undefined') {
    $('playerContainer').classList.add('android-mode');
  }

  btnText.classList.remove('hidden');
  btnLoader.classList.add('hidden');
  btn.disabled = false;
}

function logout() {
  closeAccountMenu();
  S.cats = { live: [], vod: [], series: [] };
  S.activeCat = { live: null, vod: null, series: null };
  stopPlayer();
  $('appScreen').classList.remove('active');
  $('loginScreen').classList.add('active');
  initLogin();
}

// ══ PERSISTENCE ══
function loadPersist() {
  S.favs = new Set(lsGet(STORE.FAVS) || []);
  S.history = lsGet(STORE.HIST) || [];
}
function saveFavs() { lsSet(STORE.FAVS, [...S.favs]); }
function saveHist() { lsSet(STORE.HIST, S.history.slice(0, 80)); }

// ══ API ══
// CORS proxy fallback list
const CORS_PROXIES = [
  url => url, // direct (no proxy)
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(url)}`,
];

async function api(action, extra = '') {
  const url = `${S.host}/player_api.php?username=${S.user}&password=${S.pass}&action=${action}${extra}`;
  
  for (const makeUrl of CORS_PROXIES) {
    try {
      const r = await fetch(makeUrl(url), { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) continue;
      const data = await r.json();
      return data;
    } catch (e) {
      continue;
    }
  }
  throw new Error('Connection failed — check server URL and credentials');
}

// Also proxy stream URLs for playback
function proxyUrl(url) {
  // Don't proxy m3u8/mp4 streams directly — video element handles CORS natively
  return url;
}

// ══ TABS ══
function switchTab(tab) {
  if (S.tab === tab) return;
  S.tab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('searchInput').value = '';
  loadTab(tab);
}

async function loadTab(tab) {
  S.tab = tab;
  showLoading(true);

  if (S.cats[tab].length === 0) {
    try {
      const action = tab === 'live' ? 'get_live_categories' : tab === 'vod' ? 'get_vod_categories' : 'get_series_categories';
      const data = await api(action);
      S.cats[tab] = (Array.isArray(data) ? data : []).map(c => ({
        id: c.category_id,
        name: c.category_name || 'Unnamed',
        loaded: false,
        items: [],
      }));
      if (!S.cats[tab].length) throw new Error('No categories found');
    } catch (e) {
      setContentEmpty('❌', e.message);
      showLoading(false);
      return;
    }
  }

  renderSidebar();

  const activeCat = S.activeCat[tab];
  if (activeCat) {
    const cat = S.cats[tab].find(c => c.id === activeCat);
    if (cat?.loaded) { renderItems(cat.items, cat.name); showLoading(false); return; }
  }

  if (S.cats[tab].length > 0) {
    await selectCategory(S.cats[tab][0].id);
  } else {
    setContentEmpty('📂', 'No categories');
  }
  showLoading(false);
}

// ══ SIDEBAR ══
function renderSidebar() {
  switch (S.sidebarTab) {
    case 'categories': renderCategories(); break;
    case 'favorites': renderFavorites(); break;
    case 'history': renderHistoryList(); break;
  }
}

function renderCategories() {
  const cats = S.cats[S.tab];
  $('sidebarContent').innerHTML = cats.map(c => `
    <div class="cat-item${S.activeCat[S.tab] === c.id ? ' active' : ''}" onclick="selectCategory('${esc(c.id)}')">
      <span class="cat-name">${esc(c.name)}</span>
      <span class="cat-count">${c.loaded ? c.items.length : '…'}</span>
    </div>
  `).join('') || '<div class="empty-state" style="padding:30px"><p>No categories</p></div>';
}

function renderFavorites() {
  const favItems = [];
  for (const key of S.favs) {
    const [sec, id] = key.split('|');
    for (const cat of S.cats[sec] || []) {
      const item = cat.items.find(i => String(i.id) === id);
      if (item) { favItems.push({ ...item, _sec: sec }); break; }
    }
  }

  $('sidebarContent').innerHTML = favItems.length
    ? favItems.map(ch => `
      <div class="sidebar-item" onclick='playItem(${JSON.stringify(ch).replace(/'/g, "&#39;")})'>
        <div class="sidebar-item-logo">${ch.logo ? `<img src="${esc(ch.logo)}" onerror="this.parentElement.textContent='📺'">` : '📺'}</div>
        <div class="sidebar-item-info">
          <div class="sidebar-item-name">${esc(ch.name)}</div>
          <div class="sidebar-item-sub">${esc(ch._sec)}</div>
        </div>
        <button class="sidebar-item-remove" onclick="event.stopPropagation();removeFav('${esc(ch._sec)}','${esc(ch.id)}')">✕</button>
      </div>
    `).join('')
    : '<div class="empty-state" style="padding:30px"><div class="empty-icon">⭐</div><p>No favorites yet</p></div>';
}

function renderHistoryList() {
  $('sidebarContent').innerHTML = S.history.length
    ? S.history.map(h => `
      <div class="sidebar-item" onclick='playItem(${JSON.stringify(h).replace(/'/g, "&#39;")})'>
        <div class="sidebar-item-logo">${h.logo ? `<img src="${esc(h.logo)}" onerror="this.parentElement.textContent='📺'">` : '📺'}</div>
        <div class="sidebar-item-info">
          <div class="sidebar-item-name">${esc(h.name)}</div>
          <div class="sidebar-item-sub">${esc(h.group || '')}</div>
        </div>
      </div>
    `).join('')
    : '<div class="empty-state" style="padding:30px"><div class="empty-icon">🕐</div><p>No history</p></div>';
}

function switchSidebarTab(tab) {
  S.sidebarTab = tab;
  document.querySelectorAll('.st').forEach(b => b.classList.toggle('active', b.dataset.st === tab));
  renderSidebar();
}

// ══ CATEGORIES ══
async function selectCategory(catId) {
  S.activeCat[S.tab] = catId;
  $('searchInput').value = '';
  renderSidebar();

  const cat = S.cats[S.tab].find(c => c.id === catId);
  if (!cat) return;

  if (!cat.loaded) {
    showLoading(true);
    setContentLoading(`Loading ${cat.name}...`);
    try {
      if (S.tab === 'live') {
        const d = await api('get_live_streams', `&category_id=${catId}`);
        cat.items = (Array.isArray(d) ? d : []).map(s => ({
          id: s.stream_id, name: s.name || '?',
          logo: s.stream_icon || '', group: cat.name,
          type: 'live',
          url: `${S.host}/live/${S.user}/${S.pass}/${s.stream_id}.m3u8`,
        }));
      } else if (S.tab === 'vod') {
        const d = await api('get_vod_streams', `&category_id=${catId}`);
        cat.items = (Array.isArray(d) ? d : []).map(s => ({
          id: s.stream_id, name: s.name || '?',
          logo: s.stream_icon || '', cover: s.stream_icon || '',
          rating: s.rating || '', group: cat.name,
          type: 'vod',
          url: `${S.host}/movie/${S.user}/${S.pass}/${s.stream_id}.mp4`,
        }));
      } else {
        const d = await api('get_series', `&category_id=${catId}`);
        cat.items = (Array.isArray(d) ? d : []).map(s => ({
          id: s.series_id, name: s.name || '?',
          logo: s.cover || '', cover: s.cover || '',
          rating: s.rating || '', group: cat.name,
          type: 'series',
        }));
      }
      cat.loaded = true;
    } catch (e) {
      setContentEmpty('❌', e.message);
      showLoading(false);
      return;
    }
    showLoading(false);
  }

  renderItems(cat.items, cat.name);
}

// ══ RENDER ITEMS ══
function renderItems(items, title, isSearch = false) {
  if (!isSearch) S.allChannels = [...items];
  if (!items.length) { setContentEmpty('📂', 'No content'); return; }

  const hdr = `<div class="section-header">
    <h2>${esc(title)}</h2>
    <span class="count">${items.length}</span>
    ${S.tab === 'live' ? `<div class="view-toggle">
      <button class="view-btn${S.viewMode === 'grid' ? ' active' : ''}" onclick="setView('grid')" title="Grid">⊞</button>
      <button class="view-btn${S.viewMode === 'list' ? ' active' : ''}" onclick="setView('list')" title="List">☰</button>
    </div>` : ''}
  </div>`;

  let grid;
  if (S.tab === 'live') {
    if (S.viewMode === 'list') {
      grid = `<div class="list-view">${items.map(chListItem).join('')}</div>`;
    } else {
      grid = `<div class="channel-grid">${items.map(chCardItem).join('')}</div>`;
    }
  } else {
    grid = `<div class="vod-grid">${items.map(vodCardItem).join('')}</div>`;
  }

  $('contentBody').innerHTML = hdr + grid;

  if (S.tab === 'live') setTimeout(() => loadEpgForCards(items), 600);
}

function chCardItem(ch) {
  const isActive = S.current?.id === ch.id && S.current?.type === ch.type;
  const isFav = S.favs.has(favKey(ch));
  const q = detectQuality(ch.name);
  const qTag = q ? `<span class="quality-tag ${q.toLowerCase()}">${q}</span>` : '';
  const epg = EPG[ch.id];

  return `<div class="channel-card${isActive ? ' active' : ''}" onclick='playItem(${js(ch)})'>
    ${qTag}
    <button class="ch-fav${isFav ? ' on' : ''}" onclick="event.stopPropagation();toggleFavItem(${js(ch)})">${isFav ? '⭐' : '☆'}</button>
    ${ch.logo
      ? `<img class="ch-logo" src="${esc(ch.logo)}" loading="lazy" onerror="this.outerHTML='<div class=ch-placeholder>📺</div>'">`
      : '<div class="ch-placeholder">📺</div>'}
    <div class="ch-name">${esc(ch.name)}</div>
    ${epg ? `<div class="ch-epg">${esc(epg.title)}</div>` : ''}
  </div>`;
}

function chListItem(ch) {
  const isActive = S.current?.id === ch.id;
  const epg = EPG[ch.id];
  return `<div class="list-item${isActive ? ' active' : ''}" onclick='playItem(${js(ch)})'>
    <div class="li-logo">${ch.logo ? `<img src="${esc(ch.logo)}" onerror="this.parentElement.textContent='📺'">` : '📺'}</div>
    <div class="li-info">
      <div class="li-name">${esc(ch.name)}</div>
      ${epg ? `<div class="li-sub">${esc(epg.title)}</div>` : ''}
    </div>
  </div>`;
}

function vodCardItem(ch) {
  return `<div class="vod-card" onclick='${ch.type === "series" ? `openSeries(${js(ch)})` : `openVodInfo(${js(ch)})`}'>
    ${ch.logo
      ? `<img class="vod-thumb" src="${esc(ch.logo)}" loading="lazy" onerror="this.outerHTML='<div class=vod-thumb-ph>🎬</div>'">`
      : '<div class="vod-thumb-ph">🎬</div>'}
    <div class="vod-info">
      <div class="vod-name">${esc(ch.name)}</div>
      ${ch.rating ? `<div class="vod-rating">★ ${esc(ch.rating)}</div>` : ''}
    </div>
  </div>`;
}

function js(obj) { return JSON.stringify(obj).replace(/'/g, '&#39;'); }

function setView(mode) {
  S.viewMode = mode;
  const cat = S.cats[S.tab]?.find(c => c.id === S.activeCat[S.tab]);
  if (cat?.loaded) renderItems(cat.items, cat.name);
}

// ══ SEARCH ══
let searchTimeout = null;
function doSearch(query) {
  clearTimeout(searchTimeout);
  if (!query.trim()) {
    const cat = S.cats[S.tab]?.find(c => c.id === S.activeCat[S.tab]);
    if (cat?.loaded) renderItems(cat.items, cat.name);
    return;
  }

  searchTimeout = setTimeout(async () => {
    const q = query.toLowerCase();
    const results = [];

    // Search current section first
    for (const cat of S.cats[S.tab]) {
      for (const item of (cat.loaded ? cat.items : [])) {
        if (item.name.toLowerCase().includes(q)) results.push(item);
      }
    }

    // If few results, also search other sections
    if (results.length < 5) {
      for (const sec of ['live', 'vod', 'series']) {
        if (sec === S.tab) continue;
        for (const cat of S.cats[sec]) {
          if (!cat.loaded) continue;
          for (const item of cat.items) {
            if (item.name.toLowerCase().includes(q)) results.push(item);
          }
        }
      }
    }

    renderItems(results, `Search: "${query}"`, true);
  }, 250);
}

// ══ PLAYER ══
function playItem(ch) {
  if (!ch || !ch.url) {
    if (ch.type === 'series') { openSeries(ch); return; }
    toast('⚠️ No stream URL');
    return;
  }

  S.current = ch;
  const vid = $('videoEl');

  // Destroy old HLS
  if (S.hls) { S.hls.destroy(); S.hls = null; }

  // Show player
  $('playerOverlay').classList.add('hidden');
  $('playerControls').style.display = '';
  $('pcName').textContent = ch.name;
  $('pcGroup').textContent = ch.group || '';
  if (ch.logo) { $('pcLogo').src = ch.logo; $('pcLogo').style.display = ''; }
  else $('pcLogo').style.display = 'none';

  // Status
  setPcStatus('loading', 'Connecting...');

  // EPG for live
  const isLive = ch.type === 'live';
  $('btnEpg').style.display = isLive ? '' : 'none';
  $('vodControls').style.display = isLive ? 'none' : '';

  if (isLive) {
    updateEpgBar(ch);
  }

  // Load stream
  const url = ch.url;
  if (url.includes('.m3u8') && Hls.isSupported()) {
    S.hls = new Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      liveSyncDurationCount: 3,
      enableWorker: true,
    });
    S.hls.loadSource(url);
    S.hls.attachMedia(vid);
    S.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      vid.play().catch(() => {});
      setPcStatus(isLive ? 'live' : 'vod', isLive ? 'LIVE' : 'Playing');
      populatePlayerChPanel();
    });
    S.hls.on(Hls.Events.ERROR, (e, d) => {
      if (d.fatal) {
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setPcStatus('error', 'Network error');
          // Try fallback
          tryNativePlayback(vid, url);
        } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          S.hls.recoverMediaError();
        } else {
          setPcStatus('error', 'Playback error');
          tryNativePlayback(vid, url);
        }
      }
    });
  } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
    vid.src = url;
    vid.play().catch(() => {});
    setPcStatus(isLive ? 'live' : 'vod', isLive ? 'LIVE' : 'Playing');
    populatePlayerChPanel();
  } else {
    vid.src = url;
    vid.play().catch(() => {});
    setPcStatus('loading', 'Loading...');
    populatePlayerChPanel();
  }

  // Save to history
  S.history = S.history.filter(h => !(h.id === ch.id && h.type === ch.type));
  S.history.unshift({ id: ch.id, name: ch.name, logo: ch.logo, group: ch.group, type: ch.type, url: ch.url });
  saveHist();
  if (S.sidebarTab === 'history') renderSidebar();

  // Re-render to show active state
  const cat = S.cats[S.tab]?.find(c => c.id === S.activeCat[S.tab]);
  if (cat?.loaded) renderItems(cat.items, cat.name, !!$('searchInput').value);

  // Update fav button
  const isFav = S.favs.has(favKey(ch));
  $('btnFav').classList.toggle('active', isFav);
}

function tryNativePlayback(vid, url) {
  vid.src = url;
  vid.play().catch(() => {});
}

function setPcStatus(type, text) {
  const el = $('pcStatus');
  el.className = 'pc-status ' + type;
  el.textContent = text;
}

function stopPlayer() {
  const vid = $('videoEl');
  if (S.hls) { S.hls.destroy(); S.hls = null; }
  vid.pause();
  vid.removeAttribute('src');
  vid.load();
  S.current = null;
  $('playerControls').style.display = 'none';
  $('playerOverlay').classList.remove('hidden');
  $('epgBar').style.display = 'none';
  $('vodControls').style.display = 'none';
  closePlayerChPanel();
  const cat = S.cats[S.tab]?.find(c => c.id === S.activeCat[S.tab]);
  if (cat?.loaded) renderItems(cat.items, cat.name, !!$('searchInput').value);
}

// ══ VOD CONTROLS ══
function vodTogglePlay() {
  const vid = $('videoEl');
  if (vid.paused) { vid.play(); $('vodPlayBtn').textContent = '⏸'; }
  else { vid.pause(); $('vodPlayBtn').textContent = '▶'; }
}

function vodSeek(delta) {
  const vid = $('videoEl');
  vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + delta));
}

function vodSeekDrag(el) {
  // Visual feedback only
}

function vodSeekTo(el) {
  const vid = $('videoEl');
  if (vid.duration) vid.currentTime = (el.value / 1000) * vid.duration;
}

// Update VOD time display
setInterval(() => {
  const vid = $('videoEl');
  if (!S.current || S.current.type === 'live') return;
  if (vid.duration && isFinite(vid.duration)) {
    $('vodCurrentTime').textContent = fmtTime(vid.currentTime);
    $('vodDuration').textContent = fmtTime(vid.duration);
    $('vodSeek').value = Math.floor((vid.currentTime / vid.duration) * 1000);
  }
}, 500);

// ══ ASPECT & SPEED ══
function setAspect(mode) {
  const vid = $('videoEl');
  vid.style.objectFit = mode;
  document.querySelectorAll('#aspectDrop .dropdown-option').forEach(o => o.classList.toggle('active', o.textContent.toLowerCase().includes(mode === 'contain' ? 'contain' : mode === 'cover' ? 'crop' : 'stretch')));
  closeDropdowns();
}

function setSpeed(rate) {
  $('videoEl').playbackRate = rate;
  $('speedLabel').textContent = rate + '×';
  document.querySelectorAll('#speedDrop .dropdown-option').forEach(o => {
    o.classList.toggle('active', o.textContent.startsWith(rate + '×'));
  });
  closeDropdowns();
}

function toggleFullscreen() {
  const vid = $('videoEl');
  if (document.fullscreenElement) {
    document.exitFullscreen();
    $('fsControls').classList.add('hidden');
  } else {
    vid.requestFullscreen?.() || vid.webkitRequestFullscreen?.();
    $('fsControls').classList.remove('hidden');
  }
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    $('fsControls').classList.add('hidden');
    closeFsChPanel();
  }
});

// ══ EXTERNAL ══
function openExternal() {
  if (!S.current?.url) { toast('⚠️ Nothing playing'); return; }
  window.open(S.current.url, '_blank');
}

function copyStreamUrl() {
  if (!S.current?.url) { toast('⚠️ Nothing playing'); return; }
  navigator.clipboard?.writeText(S.current.url).then(() => toast('📋 URL copied')).catch(() => toast('❌ Copy failed'));
}

// ══ FAVORITES ══
function toggleFav() {
  if (!S.current) return;
  toggleFavItem(S.current);
}

function toggleFavItem(ch) {
  const key = favKey(ch);
  if (S.favs.has(key)) { S.favs.delete(key); toast('☆ Removed from favorites'); }
  else { S.favs.add(key); toast('⭐ Added to favorites'); }
  saveFavs();
  if (S.sidebarTab === 'favorites') renderSidebar();
  if (S.current?.id === ch.id) $('btnFav').classList.toggle('active', S.favs.has(key));
  const cat = S.cats[S.tab]?.find(c => c.id === S.activeCat[S.tab]);
  if (cat?.loaded) renderItems(cat.items, cat.name, !!$('searchInput').value);
}

function removeFav(sec, id) {
  S.favs.delete(`${sec}|${id}`);
  saveFavs();
  renderFavorites();
  toast('☆ Removed');
}

// ══ EPG ══
async function loadEpgForCards(items) {
  if (S.tab !== 'live') return;
  const toLoad = items.filter(ch => !EPG[ch.id]).slice(0, 30);
  if (!toLoad.length) { updateEpgOnCards(); return; }

  const promises = toLoad.map(async ch => {
    try {
      const d = await api('get_short_epg', `&stream_id=${ch.id}&limit=2`);
      if (Array.isArray(d) && d.length) {
        const now = d[0];
        const next = d[1];
        EPG[ch.id] = {
          title: now.title || '',
          start: now.start || '',
          end: now.end || '',
          next: next?.title || '',
        };
      }
    } catch {}
  });

  await Promise.allSettled(promises);
  updateEpgOnCards();
  if (S.current?.type === 'live') updateEpgBar(S.current);
}

function updateEpgOnCards() {
  document.querySelectorAll('.channel-card').forEach(card => {
    const onclick = card.getAttribute('onclick') || '';
    const idMatch = onclick.match(/"id":(\d+)/);
    if (!idMatch) return;
    const id = idMatch[1];
    const epg = EPG[id];
    if (!epg) return;
    const epgEl = card.querySelector('.ch-epg');
    if (epgEl && !epgEl.textContent) epgEl.textContent = epg.title;
  });
}

function updateEpgBar(ch) {
  const epg = EPG[ch.id];
  if (!epg) { $('epgBar').style.display = 'none'; return; }

  $('epgBar').style.display = '';
  $('epgCurrentTitle').textContent = epg.title || '—';
  $('epgNext').textContent = epg.next ? `Next: ${epg.next}` : '';

  // Progress
  if (epg.start && epg.end) {
    const now = Date.now();
    const startTime = new Date(epg.start).getTime();
    const endTime = new Date(epg.end).getTime();
    if (endTime > startTime) {
      const pct = Math.max(0, Math.min(100, ((now - startTime) / (endTime - startTime)) * 100));
      $('epgProgressFill').style.width = pct + '%';
      const remaining = Math.max(0, Math.floor((endTime - now) / 60000));
      $('epgTime').textContent = `${remaining}min left`;
    }
  }
}

// Auto-refresh EPG
clearInterval(epgTimer);
epgTimer = setInterval(() => {
  if (S.current?.type === 'live') updateEpgBar(S.current);
}, 30000);

// ══ EPG MODAL ══
async function openEpgModal() {
  if (!S.current || S.current.type !== 'live') return;
  $('epgModal').classList.remove('hidden');
  $('epgModalTitle').textContent = S.current.name;
  $('epgModalBody').innerHTML = '<div class="modal-loading"><div class="spinner-ring"></div><p>Loading guide...</p></div>';

  try {
    const data = await api('get_short_epg', `&stream_id=${S.current.id}&limit=20`);
    if (!Array.isArray(data) || !data.length) {
      $('epgModalBody').innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No program data available</p></div>';
      return;
    }

    const now = Date.now();
    $('epgModalBody').innerHTML = data.map(p => {
      const start = new Date(p.start).getTime();
      const end = new Date(p.end).getTime();
      const isCurrent = now >= start && now <= end;
      const dur = Math.round((end - start) / 60000);
      return `<div class="epg-row${isCurrent ? ' current' : ''}">
        <div class="epg-col-time">${new Date(p.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="epg-col-info">
          <div class="epg-col-title">${esc(p.title)}</div>
          ${p.description ? `<div class="epg-col-desc">${esc(p.description)}</div>` : ''}
          <div class="epg-col-dur">${dur}min</div>
        </div>
      </div>`;
    }).join('');
  } catch {
    $('epgModalBody').innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><p>Failed to load guide</p></div>';
  }
}

function closeEpgModal() { $('epgModal').classList.add('hidden'); }

// ══ SERIES ══
function openSeries(ch) {
  $('seriesModal').classList.remove('hidden');
  $('seriesModalTitle').textContent = ch.name;
  $('seriesModalMeta').textContent = ch.group || '';
  if (ch.cover) { $('seriesModalCover').src = ch.cover; $('seriesModalCover').style.display = ''; }
  else $('seriesModalCover').style.display = 'none';
  $('seriesModalBody').innerHTML = '<div class="modal-loading"><div class="spinner-ring"></div><p>Loading seasons...</p></div>';
  loadSeriesInfo(ch);
}

async function loadSeriesInfo(ch) {
  try {
    const data = await api('get_series_info', `&series_id=${ch.id}`);
    const seasons = data.seasons || [];
    const episodes = data.episodes || {};

    if (!seasons.length) {
      $('seriesModalBody').innerHTML = '<div class="empty-state"><div class="empty-icon">🎭</div><p>No seasons found</p></div>';
      return;
    }

    let html = '<div class="season-tabs">';
    seasons.forEach((s, i) => {
      html += `<button class="season-tab${i === 0 ? ' active' : ''}" onclick="showSeason('${esc(ch.id)}', ${i})">${esc(s.name || `Season ${i + 1}`)}</button>`;
    });
    html += '</div><div id="seasonContent"></div>';
    $('seriesModalBody').innerHTML = html;

    // Show first season
    showSeasonEpisodes(seasons[0], episodes[seasons[0].season_number] || [], ch);
  } catch (e) {
    $('seriesModalBody').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${esc(e.message)}</p></div>`;
  }
}

async function showSeason(seriesId, idx) {
  document.querySelectorAll('.season-tab').forEach((t, i) => t.classList.toggle('active', i === idx));

  try {
    const data = await api('get_series_info', `&series_id=${seriesId}`);
    const seasons = data.seasons || [];
    const episodes = data.episodes || {};
    if (seasons[idx]) {
      showSeasonEpisodes(seasons[idx], episodes[seasons[idx].season_number] || [], { id: seriesId, type: 'series' });
    }
  } catch {}
}

function showSeasonEpisodes(season, eps, ch) {
  const container = $('seasonContent');
  if (!eps.length) {
    container.innerHTML = '<div class="empty-state" style="padding:20px"><p>No episodes</p></div>';
    return;
  }

  container.innerHTML = `<div class="episode-list">${eps.map((ep, i) => `
    <div class="episode-item">
      <div class="ep-num">${i + 1}</div>
      ${ep.info?.movie_image ? `<img class="ep-thumb" src="${esc(ep.info.movie_image)}" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="ep-info">
        <div class="ep-title">${esc(ep.title || ep.info?.name || `Episode ${i + 1}`)}</div>
        <div class="ep-meta">${ep.info?.duration || ''}</div>
      </div>
      <div class="ep-actions">
        <button class="ep-play-btn" onclick='playEpisode(${JSON.stringify(ep).replace(/'/g, "&#39;")}, ${js(ch)})'>▶ Play</button>
      </div>
    </div>
  `).join('')}</div>`;
}

function playEpisode(ep, series) {
  closeSeriesModal();
  const url = `${S.host}/series/${S.user}/${S.pass}/${ep.id}.${ep.container_extension || 'mp4'}`;
  playItem({
    id: ep.id,
    name: ep.title || series.name || 'Episode',
    logo: ep.info?.movie_image || series.logo || '',
    group: series.name || '',
    type: 'vod',
    url,
  });
}

function closeSeriesModal() { $('seriesModal').classList.add('hidden'); }

// ══ VOD INFO ══
async function openVodInfo(ch) {
  $('vodModal').classList.remove('hidden');
  $('vodModalTitle').textContent = ch.name;
  $('vodModalMeta').innerHTML = '';
  $('vodModalPlot').textContent = '';
  $('vodModalCover').innerHTML = ch.cover
    ? `<img src="${esc(ch.cover)}" style="width:100%;height:100%;object-fit:contain" onerror="this.parentElement.innerHTML='<div style=&quot;height:180px;display:flex;align-items:center;justify-content:center;font-size:4rem&quot;>🎬</div>'">`
    : '<div style="height:180px;display:flex;align-items:center;justify-content:center;font-size:4rem">🎬</div>';

  $('vodModalPlayBtn').onclick = () => { closeVodModal(); playItem(ch); };

  try {
    const data = await api('get_vod_info', `&vod_id=${ch.id}`);
    const info = data.info || {};
    if (info.plot) $('vodModalPlot').textContent = info.plot;
    if (info.rating) $('vodModalMeta').innerHTML += `<span class="vod-badge">★ ${esc(info.rating)}</span>`;
    if (info.genre) $('vodModalMeta').innerHTML += `<span class="vod-badge">${esc(info.genre)}</span>`;
    if (info.releasedate) $('vodModalMeta').innerHTML += `<span class="vod-badge">${esc(info.releasedate)}</span>`;
    if (info.duration) $('vodModalMeta').innerHTML += `<span class="vod-badge">${esc(info.duration)}</span>`;
    if (info.cover_big || info.movie_image) {
      $('vodModalCover').innerHTML = `<img src="${esc(info.cover_big || info.movie_image)}" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display='none'">`;
    }
  } catch {}
}

function closeVodModal() { $('vodModal').classList.add('hidden'); }

function playFromVodModal() {
  const title = $('vodModalTitle').textContent;
  closeVodModal();
  // Find in current items
  const item = S.allChannels.find(i => i.name === title);
  if (item) playItem(item);
}

function extFromVodModal() {
  const title = $('vodModalTitle').textContent;
  const item = S.allChannels.find(i => i.name === title);
  if (item?.url) window.open(item.url, '_blank');
  closeVodModal();
}

// ══ PLAYER CHANNEL PANEL ══
function togglePlayerChPanel() {
  const panel = $('playerChPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) populatePlayerChPanel();
}

function closePlayerChPanel() { $('playerChPanel').classList.add('hidden'); }

function populatePlayerChPanel() {
  const items = S.allChannels;
  $('playerChList').innerHTML = items.map(ch => {
    const isActive = S.current?.id === ch.id;
    const epg = EPG[ch.id];
    return `<div class="pch-item${isActive ? ' active' : ''}" onclick='playItem(${js(ch)})'>
      <div class="pch-item-logo">${ch.logo ? `<img src="${esc(ch.logo)}" onerror="this.parentElement.textContent='📺'">` : '📺'}</div>
      <div class="pch-item-info">
        <div class="pch-item-name">${esc(ch.name)}</div>
        ${epg ? `<div class="pch-item-epg">${esc(epg.title)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function filterPlayerChannels(q) {
  const items = $('playerChList').children;
  for (const el of items) {
    const name = el.querySelector('.pch-item-name')?.textContent?.toLowerCase() || '';
    el.style.display = name.includes(q.toLowerCase()) ? '' : 'none';
  }
}

// ══ FULLSCREEN CHANNEL PANEL ══
function toggleFsChPanel() { $('fsChPanel').classList.toggle('hidden'); if (!$('fsChPanel').classList.contains('hidden')) populateFsChPanel(); }
function closeFsChPanel() { $('fsChPanel').classList.add('hidden'); }

function populateFsChPanel() {
  const items = S.allChannels;
  $('fsChList').innerHTML = items.map(ch => {
    const isActive = S.current?.id === ch.id;
    return `<div class="fs-ch-item${isActive ? ' active' : ''}" onclick='playItem(${js(ch)})'>
      <div class="pch-item-logo">${ch.logo ? `<img src="${esc(ch.logo)}" onerror="this.parentElement.textContent='📺'">` : '📺'}</div>
      <div class="pch-item-info">
        <div class="pch-item-name">${esc(ch.name)}</div>
      </div>
    </div>`;
  }).join('');
}

function filterFsChannels(q) {
  const items = $('fsChList').children;
  for (const el of items) {
    const name = el.querySelector('.pch-item-name')?.textContent?.toLowerCase() || '';
    el.style.display = name.includes(q.toLowerCase()) ? '' : 'none';
  }
}

// ══ DROPDOWNS ══
function toggleDropdown(id) {
  const el = $(id);
  const wasOpen = el.classList.contains('open');
  closeDropdowns();
  if (!wasOpen) el.classList.add('open');
}

function closeDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('open'));
}

function toggleAccountMenu() {
  $('accountDropdown').classList.toggle('open');
  if ($('accountDropdown').classList.contains('open')) {
    const accs = lsGet(STORE.ACCS) || [];
    $('accountList').innerHTML = accs.map(a => `
      <button class="dropdown-item" onclick="switchAccount('${esc(a.host)}','${esc(a.user)}','${esc(a.pass)}')">
        <div class="acc-av">${(a.user || '?')[0].toUpperCase()}</div>
        <div class="acc-info">
          <div class="acc-host">${esc(a.host)}</div>
          <div class="acc-user">${esc(a.user)}</div>
        </div>
      </button>
    `).join('') || '<div style="padding:10px;color:var(--text-muted);font-size:0.75rem">No saved accounts</div>';
  }
}

function closeAccountMenu() { $('accountDropdown').classList.remove('open'); }

async function switchAccount(host, user, pass) {
  closeAccountMenu();
  S.host = host; S.user = user; S.pass = pass;
  S.cats = { live: [], vod: [], series: [] };
  S.activeCat = { live: null, vod: null, series: null };
  stopPlayer();
  updateAccountBadge();
  await loadTab('live');
  toast('✓ Switched account');
}

function updateAccountBadge() {
  $('accountAvatar').textContent = (S.user || '?')[0].toUpperCase();
  $('accountName').textContent = S.user || '—';
}

// ══ SIDEBAR TOGGLE ══
function toggleSidebar() {
  const sb = $('sidebar');
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    sb.classList.toggle('open');
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.onclick = toggleSidebar;
      document.body.appendChild(overlay);
    }
    overlay.classList.toggle('show', sb.classList.contains('open'));
  } else {
    sb.classList.toggle('collapsed');
  }
}

// ══ LOADING ══
function showLoading(active) {
  const bar = $('loadingBar');
  if (active) {
    bar.classList.add('active');
    bar.querySelector('.loading-bar-fill').style.width = '60%';
    setTimeout(() => bar.querySelector('.loading-bar-fill').style.width = '80%', 300);
  } else {
    bar.querySelector('.loading-bar-fill').style.width = '100%';
    setTimeout(() => {
      bar.classList.remove('active');
      bar.querySelector('.loading-bar-fill').style.width = '0%';
    }, 400);
  }
}

function setContentEmpty(icon, msg) {
  $('contentBody').innerHTML = `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${esc(msg)}</h3></div>`;
}

function setContentLoading(msg) {
  $('contentBody').innerHTML = `<div class="empty-state"><div class="spinner-ring"></div><p>${esc(msg)}</p></div>`;
}

// ══ KEYBOARD ══
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    $('searchInput')?.focus();
  }
  if (e.key === 'Escape') {
    closeDropdowns();
    closeAccountMenu();
    closeEpgModal();
    closeSeriesModal();
    closeVodModal();
  }
});

// Close dropdowns on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.action-dropdown')) closeDropdowns();
  if (!e.target.closest('.account-badge')) closeAccountMenu();
});

// ══ PWA ══
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ══ INIT ══
initTheme();
initLogin();
