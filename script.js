/* Custom Homepage — v5 (polished)
 * - Dragging tiles: no blue outline; uses thin insert line only
 * - Settings always closes on Save (defensive finally)
 * - Export/Import/Reset have clean spacing + equal widths
 * - Accent & section colours fixed; colour inputs show swatch
 * - Richer welcome messages (incl. easter eggs)
 * - Notepad wider; no width jump on Saved
 * - URL handling: google.com, emails, file paths, file:, mailto:, custom schemes (no https:// forced on file:)
 * - localStorage key: home.v5.state
 */
(() => {
  'use strict';

  /*** Helpers ***************************************************************/
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const APP_KEY      = 'home.v5.state';
  const NOTES_KEY    = 'home.v5.notes';
  const META_THEME   = $('#metaThemeColor');

  const SEARCH_ENGINES = {
    g:  { name: 'Google',         url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    d:  { name: 'DuckDuckGo',     url: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
    y:  { name: 'YouTube',        url: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
    w:  { name: 'Wikipedia',      url: q => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}` },
    so: { name: 'Stack Overflow', url: q => `https://stackoverflow.com/search?q=${encodeURIComponent(q)}` },
    gh: { name: 'GitHub',         url: q => `https://github.com/search?q=${encodeURIComponent(q)}` },
    mdn:{ name: 'MDN',            url: q => `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(q)}` },
    py: { name: 'Python Docs',    url: q => `https://docs.python.org/3/search.html?q=${encodeURIComponent(q)}` },
    npm:{ name: 'npm',            url: q => `https://www.npmjs.com/search?q=${encodeURIComponent(q)}` },
    hn: { name: 'Hacker News',    url: q => `https://hn.algolia.com/?q=${encodeURIComponent(q)}` },
  };
  const DEFAULT_ENGINE = 'g';

  const genId  = () => (crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`);
  const clamp  = (n, min, max) => Math.max(min, Math.min(max, n));
  const domain = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
  const normalizeUrl = (u) => {
    try { const x = new URL(u); x.hash=''; x.search=''; x.pathname=x.pathname.replace(/\/+$/,''); return x.toString(); }
    catch { return u; }
  };
  const guessFavicon = (u) => {
    const host = domain(u);
    return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=128` : '';
  };
  const isSecure = () => location.protocol === 'https:' || location.hostname === 'localhost';

  /*** URL handling & validation *********************************************/
  const ACCEPTED_TILE_PROTOCOLS = new Set([
    'http:', 'https:', 'mailto:', 'file:', 'ftp:',
    'vscode:', 'obsidian:', 'slack:', 'discord:', 'zoommtg:', 'spotify:',
    'tg:', 'whatsapp:', 'steam:', 'notion:', 'sourcetree:', 'itms-services:'
  ]);
  const ACCEPTED_ICON_PROTOCOLS = new Set(['http:', 'https:', 'file:', 'data:']);

  const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const looksLikeDomain = (s) => /^[\w.-]+\.[A-Za-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(s);
  const looksLikeIPv4OrLocalhost = (s) => /^(localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/.*)?$/i.test(s);
  const looksLikeWinPath = (s) => /^[a-zA-Z]:[\\/]/.test(s) || /^\\\\[^\\]/.test(s);
  const looksLikeUnixPath = (s) => s.startsWith('/') && !s.startsWith('//');

  function toFileUrlFromPath(p) {
    if (looksLikeWinPath(p)) {
      let path = p.replaceAll('\\','/');
      if (p.startsWith('\\\\')) {
        const withoutSlashes = path.replace(/^\/\//,'');
        return 'file://' + withoutSlashes.split('/').map(encodeURIComponent).join('/');
        }
      return 'file:///' + path.split('/').map((seg, i) => i === 0 ? seg.replace(':','%3A') : encodeURIComponent(seg)).join('/');
    }
    if (looksLikeUnixPath(p)) {
      return 'file://' + p.split('/').map((seg,i)=> i===0?'':encodeURIComponent(seg)).join('/');
    }
    return p;
  }

  function fixupUrlInput(u, { forIcon = false } = {}) {
    u = (u || '').trim();
    if (!u) return '';

    try {
      const url = new URL(u);
      const proto = url.protocol.toLowerCase();
      if (forIcon ? ACCEPTED_ICON_PROTOCOLS.has(proto) : ACCEPTED_TILE_PROTOCOLS.has(proto)) return u;
      if (proto === 'javascript:') return '';
      if (!forIcon && /^[a-z][a-z0-9+.-]*:$/.test(proto) && proto !== 'javascript:') return u;
    } catch {}

    if (looksLikeWinPath(u) || looksLikeUnixPath(u)) return toFileUrlFromPath(u);
    if (looksLikeEmail(u)) return `mailto:${u}`;
    if (looksLikeDomain(u)) return `https://${u}`;
    if (looksLikeIPv4OrLocalhost(u)) return `http://${u}`;
    if (/^file:\/*/i.test(u)) return u.replace(/^file:\/*/i, 'file:///');
    return `https://${u}`;
  }

  function isValidTileUrl(u) {
    try {
      const x = new URL(u);
      const proto = x.protocol.toLowerCase();
      if (proto === 'javascript:') return false;
      return ACCEPTED_TILE_PROTOCOLS.has(proto) || /^[a-z][a-z0-9+.-]*:$/.test(proto);
    } catch { return false; }
  }
  function isValidIconUrl(u) {
    try { return ACCEPTED_ICON_PROTOCOLS.has(new URL(u).protocol.toLowerCase()); }
    catch { return false; }
  }

  /*** Defaults **************************************************************/
  const DEFAULT_STATE = () => {
    const s1 = genId(), s2 = genId(), s3 = genId();
    return {
      profileName: 'Vijay',
      footerText:  'Treelogic Systems',
      theme:       'dark',
      accent:      '#8b5cf6',
      density:     'comfortable',
      wallpaper:   { kind: 'gradient', value: 'aurora', animated: false }, // gradient|image|none|dynamic
      searchEngine: DEFAULT_ENGINE,
      seedFlags:   {},
      sections: [
        {
          id: s1, title: 'Cloud & Dev', color: '',
          tiles: [
            { id: genId(), label: 'Azure DevOps', url: 'https://dev.azure.com', icon: 'icons/Azure DevOps.png' },
            { id: genId(), label: 'Azure Portal', url: 'https://portal.azure.com', icon: 'icons/Azure.png' },
            { id: genId(), label: 'SharePoint',   url: 'https://sharepoint.com', icon: 'icons/sharepoint.png' }
          ]
        },
        {
          id: s2, title: 'Productivity', color: '',
          tiles: [
            { id: genId(), label: 'ChatGPT',  url: 'https://chat.openai.com',             icon: 'icons/ChatGpt.png' },
            { id: genId(), label: 'DocEvent', url: 'https://eu-west-1.docevent.io/login', icon: 'icons/docevent.png' },
            { id: genId(), label: 'Google',   url: 'https://www.google.com',              icon: 'icons/google.png' }
          ]
        },
        {
          id: s3, title: 'Entertainment & Shopping', color: '',
          tiles: [
            { id: genId(), label: 'eBay',    url: 'https://www.ebay.co.uk', icon: 'icons/ebay.png' },
            { id: genId(), label: 'YouTube', url: 'https://youtube.com',    icon: 'icons/youtube.png' }
          ]
        }
      ],
      rows: [
        { id: genId(), sectionIds: [s1, s2] },
        { id: genId(), sectionIds: [s3] }
      ]
    };
  };

  /*** Load / migrate / seed **************************************************/
  let state = ensureShape(loadState() ?? migrateFromV4() ?? migrateFromV3() ?? migrateFromV2() ?? DEFAULT_STATE());
  seedMissingDefaults();

  function loadState() {
    try { const txt = localStorage.getItem(APP_KEY); return txt ? JSON.parse(txt) : null; }
    catch { return null; }
  }
  function saveState() { localStorage.setItem(APP_KEY, JSON.stringify(state)); }

  function migrateFromV4() {
    try {
      const txt = localStorage.getItem('home.v4.state');
      if (!txt) return null;
      const old = JSON.parse(txt);
      const sections = (old.sections || []).map(sec => ({
        id: sec.id ?? genId(), title: String(sec.title ?? 'Section'), color: sec.color ?? '',
        tiles: (sec.tiles || []).map(t => ({
          id: t.id ?? genId(), label: t.label ?? 'Link',
          url: t.url ?? 'https://example.com', icon: typeof t.icon === 'string' ? t.icon : ''
        }))
      }));
      const rows = [];
      let cur = [], curSum = 0;
      (old.sections || []).forEach((sec, i) => {
        const size = [12,6,4,3].includes(sec.size) ? sec.size : 6;
        if (curSum + size > 12 && cur.length) { rows.push(cur); cur = []; curSum = 0; }
        cur.push((sec.id ?? sections[i].id)); curSum += size;
        if (curSum >= 12) { rows.push(cur); cur = []; curSum = 0; }
      });
      if (cur.length) rows.push(cur);
      return {
        profileName: old.profileName ?? 'Home',
        footerText:  old.footerText ?? '',
        theme:       old.theme ?? 'dark',
        accent:      old.accent ?? '#8b5cf6',
        density:     old.density ?? 'comfortable',
        wallpaper:   old.wallpaper ?? { kind: 'gradient', value: 'aurora', animated: false },
        searchEngine: old.searchEngine ?? DEFAULT_ENGINE,
        seedFlags:    old.seedFlags ?? {},
        sections,
        rows: (rows.length ? rows : [sections.map(s => s.id)]).map(ids => ({ id: genId(), sectionIds: ids }))
      };
    } catch { return null; }
  }
  function migrateFromV3() {
    try {
      const txt = localStorage.getItem('home.v3.state');
      if (!txt) return null;
      const old = JSON.parse(txt);
      const sections = (old.sections || []).map(sec => ({
        id: sec.id ?? genId(), title: String(sec.title ?? 'Section'), color: sec.color ?? '',
        tiles: (sec.tiles || []).map(t => ({
          id: t.id ?? genId(), label: t.label ?? 'Link',
          url: t.url ?? 'https://example.com', icon: typeof t.icon === 'string' ? t.icon : ''
        }))
      }));
      const rows = [];
      for (let i = 0; i < sections.length; i += 2) {
        rows.push({ id: genId(), sectionIds: sections.slice(i, i+2).map(s => s.id) });
      }
      return {
        profileName: old.profileName ?? 'Home',
        footerText:  old.footerText ?? '',
        theme:       old.theme ?? 'dark',
        accent:      old.accent ?? '#8b5cf6',
        density:     old.density ?? 'comfortable',
        wallpaper:   old.wallpaper ?? { kind: 'gradient', value: 'aurora', animated: false },
        searchEngine: old.searchEngine ?? DEFAULT_ENGINE,
        seedFlags:    old.seedFlags ?? {},
        sections, rows
      };
    } catch { return null; }
  }
  function migrateFromV2() {
    try {
      const txt = localStorage.getItem('home.v2.state');
      if (!txt) return null;
      const old = JSON.parse(txt);
      const secId = genId();
      return {
        profileName: old.profileName ?? 'Home',
        footerText:  old.footerText ?? '',
        theme:       old.theme ?? 'dark',
        accent:      old.accent ?? '#8b5cf6',
        density:     old.density ?? 'comfortable',
        wallpaper:   old.wallpaper ?? { kind: 'gradient', value: 'aurora', animated: false },
        searchEngine: old.searchEngine ?? DEFAULT_ENGINE,
        seedFlags:    {},
        sections: [{
          id: secId, title: 'Shortcuts', color: '',
          tiles: (old.tiles || []).map(t => ({
            id: t.id ?? genId(), label: t.label ?? 'Link',
            url: t.url ?? 'https://example.com', icon: typeof t.icon === 'string' ? t.icon : ''
          }))
        }],
        rows: [{ id: genId(), sectionIds: [secId] }]
      };
    } catch { return null; }
  }

  function ensureShape(s) {
    const d = DEFAULT_STATE();
    s = Object.assign({}, d, s);

    s.sections = Array.isArray(s.sections) ? s.sections.map(sec => ({
      id:    sec.id ?? genId(),
      title: String(sec.title ?? 'Section'),
      color: typeof sec.color === 'string' ? sec.color : '',
      tiles: Array.isArray(sec.tiles) ? sec.tiles.map(t => ({
        id: t.id ?? genId(),
        label: t.label ?? 'Link',
        url: t.url ?? 'https://example.com',
        icon: typeof t.icon === 'string' ? t.icon : ''
      })) : []
    })) : d.sections;

    if (!Array.isArray(s.rows) || !s.rows.length) {
      s.rows = [{ id: genId(), sectionIds: s.sections.map(x => x.id) }];
    } else {
      s.rows = s.rows.map(r => ({
        id: r.id ?? genId(),
        sectionIds: Array.isArray(r.sectionIds) ? r.sectionIds.filter(id => s.sections.some(sec => sec.id === id)) : []
      })).filter(r => r.sectionIds.length > 0);
      const referenced = new Set(s.rows.flatMap(r => r.sectionIds));
      const orphans = s.sections.filter(sec => !referenced.has(sec.id)).map(sec => sec.id);
      if (orphans.length) s.rows.push({ id: genId(), sectionIds: orphans });
    }

    if (!['light','dark','system'].includes(s.theme)) s.theme = 'dark';
    if (!['comfortable','compact'].includes(s.density)) s.density = 'comfortable';
    if (!s.wallpaper || typeof s.wallpaper !== 'object') s.wallpaper = d.wallpaper;
    if (!['gradient','image','none','dynamic'].includes(s.wallpaper.kind)) s.wallpaper = d.wallpaper;
    if (s.wallpaper.kind === 'gradient' && !['aurora','sunset'].includes(s.wallpaper.value)) s.wallpaper.value = 'aurora';
    s.wallpaper.animated = Boolean(s.wallpaper.animated);
    if (!(s.searchEngine in SEARCH_ENGINES)) s.searchEngine = DEFAULT_ENGINE;
    s.seedFlags = s.seedFlags ?? {};
    return s;
  }

  function seedMissingDefaults() {
    if (state.seedFlags.v5Seeded) return;

    const ensureSection = (title) => {
      let sec = state.sections.find(s => s.title === title);
      if (!sec) { sec = { id: genId(), title, color: '', tiles: [] }; state.sections.push(sec); state.rows.push({ id: genId(), sectionIds: [sec.id] }); }
      return sec;
    };
    const hasUrl = (url) => state.sections.some(s => s.tiles.some(t => normalizeUrl(t.url) === normalizeUrl(url)));
    const add = (sec, label, url, icon) => { if (!hasUrl(url)) sec.tiles.push({ id: genId(), label, url, icon }); };

    const cloud = ensureSection('Cloud & Dev');
    const prod  = ensureSection('Productivity');
    const ent   = ensureSection('Entertainment & Shopping');

    add(cloud, 'Azure DevOps', 'https://dev.azure.com',              'icons/Azure DevOps.png');
    add(cloud, 'Azure Portal', 'https://portal.azure.com',           'icons/Azure.png');
    add(cloud, 'SharePoint',   'https://sharepoint.com',             'icons/sharepoint.png');

    add(prod,  'ChatGPT',  'https://chat.openai.com',                'icons/ChatGpt.png');
    add(prod,  'DocEvent', 'https://eu-west-1.docevent.io/login',    'icons/docevent.png');
    add(prod,  'Google',   'https://www.google.com',                 'icons/google.png');

    add(ent,   'eBay',     'https://www.ebay.co.uk',                 'icons/ebay.png');
    add(ent,   'YouTube',  'https://youtube.com',                    'icons/youtube.png');

    state.seedFlags.v5Seeded = true;
    saveState();
  }

  /*** DOM refs ***************************************************************/
  const brandName    = $('#brandName');
  const welcomeMsg   = $('#welcomeMsg');
  const footerText   = $('#footerText');
  const netDot       = $('#netDot');
  const wallpaperEl  = $('.wallpaper');
  const sectionsWrap = $('#sectionsWrap');

  /*** Theme & look ***********************************************************/
  function applyTheme() {
    let themeToApply = state.theme;
    if (state.theme === 'system') themeToApply = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', themeToApply);
    META_THEME?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  }
  function applyAccent()  { document.documentElement.style.setProperty('--accent', state.accent); }
  function applyDensity() { document.documentElement.setAttribute('data-density', state.density === 'compact' ? 'compact' : 'comfortable'); }

  function timeOfDaySlot(d = new Date()) {
    const h = d.getHours();
    if (h >= 5 && h < 8) return 'dawn';
    if (h >= 8 && h < 18) return 'day';
    if (h >= 18 && h < 21) return 'dusk';
    return 'night';
  }

  function applyWallpaper() {
    wallpaperEl.classList.remove('sunset','image','dawn','day','dusk','night','animate');
    wallpaperEl.style.removeProperty('--wallpaper-image');
    if (state.wallpaper.animated) wallpaperEl.classList.add('animate');
    if (state.wallpaper.kind === 'gradient') {
      if (state.wallpaper.value === 'sunset') wallpaperEl.classList.add('sunset');
    } else if (state.wallpaper.kind === 'dynamic') {
      wallpaperEl.classList.add(timeOfDaySlot());
    } else if (state.wallpaper.kind === 'image' && state.wallpaper.value) {
      wallpaperEl.classList.add('image');
      wallpaperEl.style.setProperty('--wallpaper-image', `url("${state.wallpaper.value}")`);
    }
  }
  function renderHeaderFooter() {
    brandName.textContent = state.profileName || 'Home';
    footerText.textContent = state.footerText || '';
    updateWelcome();
  }

  /*** Welcome message (varied + easter eggs) ********************************/
  function updateWelcome() {
    const name = state.profileName || 'there';
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 Sun .. 6 Sat
    const date = now.getDate();

    const base = hour < 5 ? ['Burning the midnight oil', 'Up late', 'Night mode engaged']
            : hour < 12 ? ['Good morning', 'Top of the morning', 'Rise and shine', 'Fresh start']
            : hour < 17 ? ['Good afternoon', 'Hope your day’s going well', 'Let’s ship something']
            : hour < 22 ? ['Good evening', 'Evening, commander', 'Unwind mode']
            : ['Late night', 'Night owl', 'After-hours brilliance'];

    const weekdayBonus = [
      [], // Sun
      ['Happy Monday', 'New week, new commits'], // Mon
      ['Tactical Tuesday', 'Two-fer Tuesday'], // Tue
      ['Midweek momentum', 'Happy Wednesday'], // Wed
      ['Almost there — Thursday vibes', 'Pre-Friday energy'], // Thu
      ['It’s Friday 🎉', 'Ship it Friday'], // Fri
      ['Cozy Saturday', 'Weekend well spent'], // Sat
    ][day];

    // tiny chance of an easter egg
    const eggs = [
      'The cake is a lie.',
      'May the force be with you.',
      '42.',
      'Keeping it DRY and KISS.',
      'vim > emacs? Discuss.',
      'Did you clear the cache?',
      'Coffee first, deploy later.',
    ];
    const useEgg = Math.random() < 0.04; // 4% chance

    const choose = (arr) => arr[Math.floor(Math.random()*arr.length)];
    const greet = useEgg ? choose(eggs) : `${choose(base)}${weekdayBonus?.length ? ' · ' + choose(weekdayBonus) : ''}`;
    welcomeMsg.textContent = `${greet}, ${name}.`;
  }
  // Refresh greeting hourly and wallpaper for dynamic
  setInterval(() => {
    if (state.wallpaper.kind === 'dynamic') applyWallpaper();
    if (new Date().getMinutes() === 0) updateWelcome();
  }, 60 * 1000);

  /*** Render *****************************************************************/
  function renderAll() {
    sectionsWrap.innerHTML = '';
    state.rows.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      rowEl.dataset.rowId = row.id;
      rowEl.style.setProperty('--cols', String(Math.max(1, row.sectionIds.length)));

      row.sectionIds.forEach(secId => {
        const sec = state.sections.find(s => s.id === secId);
        if (!sec) return;
        rowEl.appendChild(renderSection(sec));
      });

      sectionsWrap.appendChild(rowEl);
    });
    bindSectionDnD();
    bindTileDnD();
  }

  function renderSection(section) {
    const secEl = document.createElement('section');
    secEl.className = 'section';
    secEl.dataset.sectionId = section.id;

    if (section.color) {
      secEl.classList.add('colorized');
      secEl.style.setProperty('--section-color', section.color);
    } else {
      secEl.classList.remove('colorized');
      secEl.style.removeProperty('--section-color');
    }

    // Header (drag handle)
    const head = document.createElement('div');
    head.className = 'head';
    head.draggable = true;
    head.title = 'Drag to move section';

    const title = document.createElement('h3');
    title.className = 'title';
    title.textContent = section.title;

    const editBtn = document.createElement('button');
    editBtn.className = 'pill-btn small';
    editBtn.textContent = 'Edit';
    editBtn.title = 'Rename/colour this section';
    editBtn.addEventListener('click', () => openSectionDialog(section));

    const addTileBtn = document.createElement('button');
    addTileBtn.className = 'pill-btn small';
    addTileBtn.textContent = '＋ Tile';
    addTileBtn.title = 'Add tile to this section';
    addTileBtn.addEventListener('click', () => openTileDialog(null, section.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'pill-btn small danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.title = 'Delete this section';
    deleteBtn.addEventListener('click', () => {
      const hasTiles = (section.tiles?.length || 0) > 0;
      if (!confirm(`Delete section "${section.title}"${hasTiles ? ' and all its tiles' : ''}?`)) return;
      state.sections = state.sections.filter(s => s.id !== section.id);
      state.rows.forEach(r => r.sectionIds = r.sectionIds.filter(x => x !== section.id));
      state.rows = state.rows.filter(r => r.sectionIds.length > 0);
      saveState(); renderAll();
    });

    head.appendChild(title);
    head.appendChild(editBtn);
    head.appendChild(addTileBtn);
    head.appendChild(deleteBtn);

    // Grid
    const grid = document.createElement('div');
    grid.className = 'tile-grid';
    grid.dataset.sectionId = section.id;
    section.tiles.forEach(t => grid.appendChild(renderTile(t, section.id)));

    secEl.appendChild(head);
    secEl.appendChild(grid);
    return secEl;
  }

  function renderTile(tile, sectionId) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.tabIndex = 0;
    el.draggable = true;
    el.dataset.id = tile.id;
    el.dataset.sectionId = sectionId;

    const art = document.createElement('div'); art.className = 'art';
    if (tile.icon) {
      const img = document.createElement('img');
      img.src = tile.icon; img.alt = ''; img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        const fav = guessFavicon(tile.url);
        if (fav && img.src !== fav) img.src = fav;
        else art.innerHTML = `<div class="mono-badge">${monogram(tile.label)}</div>`;
      };
      art.appendChild(img);
    } else {
      const fav = guessFavicon(tile.url);
      if (fav) {
        const img = document.createElement('img');
        img.src = fav; img.alt = ''; img.referrerPolicy = 'no-referrer';
        img.onerror = () => { art.innerHTML = `<div class="mono-badge">${monogram(tile.label)}</div>`; };
        art.appendChild(img);
      } else {
        art.innerHTML = `<div class="mono-badge">${monogram(tile.label)}</div>`;
      }
    }

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = tile.label;

    const menu = document.createElement('button');
    menu.className = 'menu icon-btn';
    menu.type = 'button';
    menu.title = 'Edit';
    menu.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-8 1.3-8 4v1h16v-1c0-2.7-5.3-4-8-4z" fill="currentColor"/></svg>`;
    menu.addEventListener('click', () => {
      const found = findTile(tile.id);
      if (found) openTileDialog(found.tile, found.section.id);
    });

    const open = document.createElement('button');
    open.className = 'open-link';
    open.type = 'button';
    open.setAttribute('aria-label', `Open ${tile.label}`);
    open.addEventListener('click', () => window.open(tile.url, '_blank', 'noopener,noreferrer'));

    el.appendChild(art);
    el.appendChild(label);
    el.appendChild(open);
    el.appendChild(menu);
    return el;
  }

  function monogram(label) {
    const parts = (label || '').trim().split(/\s+/);
    const letters = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
    return letters.toUpperCase() || '•';
  }

  /*** Section drag & drop ****************************************************/
  let dragMode = null; // 'tile' | 'section' | null

  // Thin insertion line (within a row)
  const insertLine = document.createElement('div');
  insertLine.className = 'insert-line';

  // Row placeholder (between rows)
  const rowPlaceholder = document.createElement('div');
  rowPlaceholder.className = 'row-placeholder';
  rowPlaceholder.textContent = 'Drop to create a new row';

  let sectionDrag = { id: null, fromRowId: null };

  function bindSectionDnD() {
    $$('.section .head').forEach(head => {
      head.addEventListener('dragstart', (e) => {
        const secEl = head.closest('.section');
        const secId = secEl?.dataset.sectionId;
        const pos = findSectionPos(secId);
        if (!pos) return;

        dragMode = 'section';
        sectionDrag = { id: secId, fromRowId: pos.row.id };
        secEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', secId);
      });

      head.addEventListener('dragend', () => {
        dragMode = null;
        sectionDrag = { id: null, fromRowId: null };
        $$('.section.dragging').forEach(el => el.classList.remove('dragging'));
        cleanupSectionPlaceholders();
      });
    });

    sectionsWrap.addEventListener('dragover', (e) => {
      if (dragMode !== 'section') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rowEl = e.target.closest('.row');
      if (rowEl) {
        showInsertLine(rowEl, e.clientX);
      } else {
        showRowPlaceholderAtIndex(getInterRowIndex(e.clientY));
      }
    });

    sectionsWrap.addEventListener('drop', (e) => {
      if (dragMode !== 'section') return;
      e.preventDefault();

      if (rowPlaceholder.isConnected && rowPlaceholder.parentElement === sectionsWrap) {
        const toRowIdx = Array.from(sectionsWrap.children).indexOf(rowPlaceholder);
        const newRow = { id: genId(), sectionIds: [] };
        state.rows.splice(clamp(toRowIdx, 0, state.rows.length), 0, newRow);
        commitSectionMove(sectionDrag.id, newRow.id, 0);
        cleanupSectionPlaceholders();
        return;
      }

      const parentRow = insertLine.isConnected ? insertLine.parentElement : null;
      if (parentRow && parentRow.classList.contains('row')) {
        const toRowId = parentRow.dataset.rowId;
        const toIndex = Number(insertLine.dataset.index || 0);
        commitSectionMove(sectionDrag.id, toRowId, toIndex);
      }
      cleanupSectionPlaceholders();
    });
  }

  function cleanupSectionPlaceholders() {
    insertLine.remove();
    rowPlaceholder.remove();
    $$('.row').forEach(updateRowCols);
  }

  function showInsertLine(rowEl, clientX) {
    rowPlaceholder.remove();
    const items = Array.from(rowEl.querySelectorAll(':scope > .section'));
    const index = getInsertIndexByX(items, clientX);
    const rowRect = rowEl.getBoundingClientRect();
    let x;
    if (items.length === 0) x = 8;
    else if (index <= 0) x = items[0].getBoundingClientRect().left - rowRect.left;
    else if (index >= items.length) x = items[items.length - 1].getBoundingClientRect().right - rowRect.left;
    else x = items[index].getBoundingClientRect().left - rowRect.left;

    insertLine.style.left = `${Math.max(6, x)}px`;
    insertLine.dataset.rowId = rowEl.dataset.rowId;
    insertLine.dataset.index = String(index);
    if (insertLine.parentElement !== rowEl) rowEl.appendChild(insertLine);
  }

  function getInsertIndexByX(items, clientX) {
    if (!items.length) return 0;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return items.length;
  }

  function getInterRowIndex(clientY) {
    const rows = Array.from(sectionsWrap.querySelectorAll(':scope > .row'));
    if (rows.length === 0) return 0;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top) return i;
    }
    return rows.length;
  }

  function showRowPlaceholderAtIndex(index) {
    insertLine.remove();
    const rows = Array.from(sectionsWrap.querySelectorAll(':scope > .row'));
    if (index <= 0) sectionsWrap.insertBefore(rowPlaceholder, rows[0] || null);
    else if (index >= rows.length) sectionsWrap.appendChild(rowPlaceholder);
    else sectionsWrap.insertBefore(rowPlaceholder, rows[index] || null);
  }

  function commitSectionMove(sectionId, toRowId, toIndex) {
    const fromPos = findSectionPos(sectionId);
    if (!fromPos) return;

    const toRow = state.rows.find(r => r.id === toRowId);
    if (!toRow) return;

    let insertIndex = clamp(toIndex, 0, toRow.sectionIds.length);
    if (fromPos.row.id === toRowId && fromPos.index < insertIndex) insertIndex -= 1;

    fromPos.row.sectionIds.splice(fromPos.index, 1);
    toRow.sectionIds.splice(insertIndex, 0, sectionId);

    state.rows = state.rows.filter(r => r.sectionIds.length > 0);
    saveState();
    renderAll();
  }

  function findSectionPos(sectionId) {
    for (const row of state.rows) {
      const idx = row.sectionIds.indexOf(sectionId);
      if (idx >= 0) return { row, index: idx };
    }
    return null;
  }

  function updateRowCols(rowEl) {
    const count = rowEl.querySelectorAll(':scope > .section').length;
    rowEl.style.setProperty('--cols', String(Math.max(1, count)));
  }

  /*** Tile drag & drop *******************************************************/
  const tilePlaceholder = document.createElement('div');
  tilePlaceholder.className = 'tile placeholder';
  tilePlaceholder.innerHTML = `<div class="art"><div class="mono-badge">··</div></div><div class="label">Drop here</div>`;

  const tileInsertLine = document.createElement('div');
  tileInsertLine.className = 'tile-insert-line';

  let tileDrag = { id: null, fromSectionId: null };

  function bindTileDnD() {
    $$('.tile').forEach(tileEl => {
      tileEl.addEventListener('dragstart', (e) => {
        dragMode = 'tile';
        tileEl.classList.add('dragging');
        tileDrag.id = tileEl.dataset.id;
        tileDrag.fromSectionId = tileEl.dataset.sectionId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tileDrag.id);
      });
      tileEl.addEventListener('dragend', () => {
        dragMode = null;
        tileEl.classList.remove('dragging');
        tilePlaceholder.remove();
        tileInsertLine.remove();
        $$('.tile-grid').forEach(g => g.classList.remove('drop-target'));
      });
    });

    $$('.section').forEach(secEl => {
      const grid = $('.tile-grid', secEl);
      if (!grid) return;

      secEl.addEventListener('dragover', (e) => {
        if (dragMode !== 'tile') return;
        e.preventDefault();
        grid.classList.add('drop-target');

        const items = gridChildrenWithoutPlaceholder(grid);
        if (items.length === 0) {
          if (!tilePlaceholder.isConnected) grid.appendChild(tilePlaceholder);
          tileInsertLine.remove();
          return;
        } else {
          tilePlaceholder.remove();
        }

        const index = getTileInsertIndex2D(grid, e.clientX, e.clientY);
        showTileInsertLine(grid, index);
      });

      secEl.addEventListener('dragleave', (e) => {
        if (dragMode !== 'tile') return;
        const to = e.relatedTarget;
        if (!secEl.contains(to)) {
          grid.classList.remove('drop-target');
          tileInsertLine.remove();
          tilePlaceholder.remove();
        }
      });

      secEl.addEventListener('drop', (e) => {
        if (dragMode !== 'tile') return;
        e.preventDefault();
        const toSectionId = grid.dataset.sectionId;

        let index;
        const items = gridChildrenWithoutPlaceholder(grid);
        if (items.length === 0) index = 0;
        else index = Number(tileInsertLine.dataset.index || 0);

        commitTileMove(tileDrag.id, tileDrag.fromSectionId, toSectionId, index);
        tilePlaceholder.remove();
        tileInsertLine.remove();
        grid.classList.remove('drop-target');
      });
    });
  }

  function gridChildrenWithoutPlaceholder(grid) {
    return Array.from(grid.children).filter(c => c !== tilePlaceholder);
  }

  function getTileInsertIndex2D(grid, clientX, clientY) {
    const items = gridChildrenWithoutPlaceholder(grid).filter(el => el.classList.contains('tile'));
    if (items.length === 0) return 0;
    let closestIdx = 0, best = Infinity;
    items.forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(clientX - cx, clientY - cy);
      if (d < best) { best = d; closestIdx = idx; }
    });
    const box = items[closestIdx].getBoundingClientRect();
    const before = clientX < (box.left + box.width / 2) && clientY <= box.bottom && clientY >= box.top;
    return before ? closestIdx : closestIdx + 1;
  }

  function showTileInsertLine(grid, index) {
    const items = gridChildrenWithoutPlaceholder(grid).filter(el => el.classList.contains('tile'));
    const gridRect = grid.getBoundingClientRect();

    let x;
    if (items.length === 0 || index <= 0) x = 8;
    else if (index >= items.length) x = items[items.length - 1].getBoundingClientRect().right - gridRect.left;
    else x = items[index].getBoundingClientRect().left - gridRect.left;

    tileInsertLine.style.left = `${Math.max(6, x)}px`;
    tileInsertLine.dataset.index = String(clamp(index, 0, items.length));
    if (tileInsertLine.parentElement !== grid) grid.appendChild(tileInsertLine);
  }

  function commitTileMove(tileId, fromSectionId, toSectionId, index) {
    const from = state.sections.find(s => s.id === fromSectionId);
    const to   = state.sections.find(s => s.id === toSectionId);
    if (!from || !to) return;
    const fromIdx = from.tiles.findIndex(t => t.id === tileId);
    if (fromIdx < 0) return;
    const [item] = from.tiles.splice(fromIdx, 1);
    const i = clamp(index, 0, to.tiles.length);
    to.tiles.splice(i, 0, item);
    saveState(); renderAll();
  }

  /*** Search *****************************************************************/
  const searchForm  = $('#searchForm');
  const searchInput = $('#searchInput');

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = searchInput.value.trim();
    if (!raw) return;
    const { engineKey, query } = parseSearch(raw);
    const engine = SEARCH_ENGINES[engineKey] ?? SEARCH_ENGINES[state.searchEngine] ?? SEARCH_ENGINES[DEFAULT_ENGINE];
    window.open(engine.url(query), '_blank', 'noopener,noreferrer');
  });

  function parseSearch(text) {
    const m = text.match(/^\s*([a-z]{1,3}):\s*(.*)$/i);
    if (m && SEARCH_ENGINES[m[1].toLowerCase()]) return { engineKey: m[1].toLowerCase(), query: m[2] || '' };
    return { engineKey: state.searchEngine, query: text };
  }

  /*** Time & network status **************************************************/
  const clockEl = $('#clock');
  function updateClock() {
    const d = new Date();
    clockEl.textContent = d.toLocaleString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  setInterval(updateClock, 1000); updateClock();

  function updateNetworkDot() {
    netDot.classList.toggle('online', navigator.onLine);
    netDot.classList.toggle('offline', !navigator.onLine);
    netDot.title = navigator.onLine ? 'Online' : 'Offline';
  }
  window.addEventListener('online', updateNetworkDot);
  window.addEventListener('offline', updateNetworkDot);
  updateNetworkDot();

  /*** Settings ***************************************************************/
  const settingsDialog = $('#settingsDialog');
  const settingsForm   = $('#settingsForm');
  const setTitle   = $('#setTitle');
  const setFooter  = $('#setFooter');
  const setAccent  = $('#setAccent');
  const setDensity = $('#setDensity');
  const setEngine  = $('#setEngine');
  const openSettings = $('#openSettings');
  const clearBgBtn = $('#clearBg');
  const bgFile     = $('#bgFile');
  const exportBtn  = $('#exportBtn');
  const importFile = $('#importFile');
  const resetBtn   = $('#resetBtn');
  const animateBg  = $('#animateBg');

  function fillSettings() {
    setTitle.value   = state.profileName || '';
    setFooter.value  = state.footerText || '';
    setAccent.value  = state.accent || '#8b5cf6';
    setDensity.value = state.density || 'comfortable';
    setEngine.value  = state.searchEngine || DEFAULT_ENGINE;
    $$('input[name="theme"]', settingsForm).forEach(r => r.checked = (r.value === state.theme));
    const wp = state.wallpaper;
    const kindVal = wp.kind === 'gradient' ? `gradient-${wp.value}` : wp.kind;
    $$('input[name="wallpaper"]', settingsForm).forEach(r => r.checked = (r.value === kindVal));
    animateBg.checked = !!wp.animated;
    bgFile.value = '';
  }

  openSettings.addEventListener('click', () => { fillSettings(); settingsDialog.showModal(); });
  $$('.close-btn,[data-close]', settingsDialog).forEach(btn => btn.addEventListener('click', () => settingsDialog.close()));

  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      state.profileName  = setTitle.value.trim() || 'Home';
      state.footerText   = setFooter.value.trim();
      state.accent       = setAccent.value || '#8b5cf6';
      state.density      = setDensity.value === 'compact' ? 'compact' : 'comfortable';
      state.searchEngine = setEngine.value in SEARCH_ENGINES ? setEngine.value : DEFAULT_ENGINE;

      const theme = $('input[name="theme"]:checked', settingsForm)?.value || 'dark';
      state.theme = ['light','dark','system'].includes(theme) ? theme : 'dark';

      const wpChoice = $('input[name="wallpaper"]:checked', settingsForm)?.value || 'gradient-aurora';
      if (wpChoice === 'none') state.wallpaper = { kind: 'none', value: '', animated: animateBg.checked };
      else if (wpChoice.startsWith('gradient-')) state.wallpaper = { kind: 'gradient', value: wpChoice.split('-')[1], animated: animateBg.checked };
      else if (wpChoice === 'dynamic') state.wallpaper = { kind: 'dynamic', value: '', animated: animateBg.checked };
      else if (wpChoice === 'image' && state.wallpaper.kind !== 'image') state.wallpaper = { kind: 'image', value: state.wallpaper.value || '', animated: animateBg.checked };
      else state.wallpaper.animated = animateBg.checked;

      saveState(); applyAccent(); applyDensity(); applyTheme(); applyWallpaper(); renderHeaderFooter(); renderAll();
    } finally {
      // Always close, even if some non-fatal error happens above
      setTimeout(() => settingsDialog.close(), 0);
    }
  });

  bgFile.addEventListener('change', () => {
    const f = bgFile.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { state.wallpaper = { kind: 'image', value: String(reader.result), animated: animateBg.checked }; saveState(); applyWallpaper(); };
    reader.readAsDataURL(f);
  });
  clearBgBtn.addEventListener('click', () => { state.wallpaper = { ...state.wallpaper, kind: 'none', value: '' }; saveState(); applyWallpaper(); });

  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    a.href = url; a.download = `homepage-config-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  importFile.addEventListener('change', () => {
    const f = importFile.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = ensureShape(JSON.parse(String(reader.result)));
        saveState(); applyAll();
        settingsDialog.close(); importFile.value = '';
      } catch { alert('Import failed: invalid JSON.'); }
    };
    reader.readAsText(f);
  });

  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset to default settings and layout? This will overwrite your current configuration.')) return;
    state = DEFAULT_STATE(); saveState(); applyAll(); settingsDialog.close();
  });

  /*** Section dialog *********************************************************/
  const sectionDialog      = $('#sectionDialog');
  const sectionForm        = $('#sectionForm');
  const sectionDialogTitle = $('#sectionDialogTitle');
  const sectionIdInput     = $('#sectionId');
  const sectionNameInput   = $('#sectionName');
  const sectionColorInput  = $('#sectionColor');
  const sectionColorClear  = $('#sectionColorClear');
  const sectionDeleteBtn   = $('#sectionDeleteBtn');
  const addSectionBtn      = $('#addSection');

  $('#sectionCollapsed')?.closest('label')?.remove();

  addSectionBtn.addEventListener('click', () => openSectionDialog());

  function openSectionDialog(existing) {
    sectionDialogTitle.textContent = existing ? 'Edit section' : 'Add section';
    sectionIdInput.value   = existing?.id    || '';
    sectionNameInput.value = existing?.title || '';
    sectionColorInput.value = existing?.color || '#8b5cf6';
    sectionColorInput.dataset._empty = existing?.color ? '0' : '1';
    sectionDeleteBtn.hidden = !existing;
    sectionDialog.showModal();
  }
  $$('.close-btn,[data-close]', sectionDialog).forEach(btn => btn.addEventListener('click', () => sectionDialog.close()));
  sectionColorClear.addEventListener('click', () => { sectionColorInput.dataset._empty = '1'; });
  // Mark as intentional if user changes colour (fixes "section colours not working")
  sectionColorInput.addEventListener('input', () => { sectionColorInput.dataset._empty = '0'; });

  sectionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id    = sectionIdInput.value || genId();
    const title = sectionNameInput.value.trim() || 'Section';
    const color = sectionColorInput.dataset._empty === '1' ? '' : (sectionColorInput.value || '');

    const idx = state.sections.findIndex(s => s.id === sectionIdInput.value);
    if (idx >= 0) {
      state.sections[idx] = { ...state.sections[idx], id, title, color };
    } else {
      state.sections.push({ id, title, color, tiles: [] });
      state.rows.push({ id: genId(), sectionIds: [id] });
    }

    saveState(); renderAll(); sectionDialog.close();
  });

  sectionDeleteBtn.addEventListener('click', () => {
    const id = sectionIdInput.value; if (!id) return;
    const sec = state.sections.find(s => s.id === id);
    const hasTiles = (sec?.tiles?.length || 0) > 0;
    if (!confirm(`Delete section "${sec?.title ?? 'Section'}"${hasTiles ? ' and all its tiles' : ''}?`)) return;
    state.sections = state.sections.filter(s => s.id !== id);
    state.rows.forEach(r => r.sectionIds = r.sectionIds.filter(x => x !== id));
    state.rows = state.rows.filter(r => r.sectionIds.length > 0);
    saveState(); renderAll(); sectionDialog.close();
  });

  /*** Tile dialog ************************************************************/
  const tileDialog        = $('#tileDialog');
  const tileForm          = $('#tileForm');
  const tileDialogTitle   = $('#tileDialogTitle');
  const tileIdInput       = $('#tileId');
  const tileNameInput     = $('#tileName');
  const tileUrlInput      = $('#tileUrl');
  const tileSectionSelect = $('#tileSection');
  const tileIconFile      = $('#tileIconFile');
  const tileIconUrl       = $('#tileIconUrl');
  const tileDeleteBtn     = $('#tileDeleteBtn');
  const addTileGlobalBtn  = $('#addTileGlobal');

  addTileGlobalBtn.addEventListener('click', () => openTileDialog());

  function fillSectionSelect(select, selectedId) {
    select.innerHTML = '';
    state.sections.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id; opt.textContent = sec.title;
      opt.selected = sec.id === selectedId;
      select.appendChild(opt);
    });
  }

  function openTileDialog(existing = null, defaultSectionId = null) {
    tileDialogTitle.textContent = existing ? 'Edit shortcut' : 'Add shortcut';
    tileIdInput.value   = existing?.id    || '';
    tileNameInput.value = existing?.label || '';
    tileUrlInput.value  = existing?.url   || '';
    tileIconFile.value  = '';
    tileIconUrl.value   = (existing?.icon && (existing.icon.startsWith('http') || existing.icon.startsWith('data:') || existing.icon.startsWith('file:'))) ? existing.icon : '';
    const sectionId = existing ? findTile(existing.id)?.section?.id : (defaultSectionId || state.sections[0]?.id);
    fillSectionSelect(tileSectionSelect, sectionId || state.sections[0]?.id);
    tileDeleteBtn.hidden = !existing;
    tileDialog.showModal();
  }

  $$('.close-btn,[data-close]', tileDialog).forEach(btn => btn.addEventListener('click', () => tileDialog.close()));

  tileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id    = tileIdInput.value || genId();
    const label = tileNameInput.value.trim() || 'Link';

    let url = tileUrlInput.value.trim();
    url = fixupUrlInput(url, { forIcon: false });
    if (!isValidTileUrl(url)) {
      alert('Please enter a valid link (http(s)://… · mailto:… · file:///… · app-scheme: …)');
      return;
    }

    const secId = tileSectionSelect.value || state.sections[0]?.id;

    let icon = '';
    if (tileIconFile.files?.[0]) icon = await fileToDataUrl(tileIconFile.files[0]);
    else if (tileIconUrl.value.trim()) {
      const cand = fixupUrlInput(tileIconUrl.value.trim(), { forIcon: true });
      icon = isValidIconUrl(cand) ? cand : '';
    }

    const existing = findTile(tileIdInput.value);
    if (existing) {
      const newTile = { id, label, url, icon };
      const fromSec = existing.section; const fromIdx = existing.index;
      if (fromSec.id === secId) fromSec.tiles[fromIdx] = newTile;
      else {
        fromSec.tiles.splice(fromIdx, 1);
        const toSec = state.sections.find(s => s.id === secId);
        toSec.tiles.push(newTile);
      }
    } else {
      const toSec = state.sections.find(s => s.id === secId);
      toSec.tiles.push({ id, label, url, icon });
    }
    saveState(); renderAll(); tileDialog.close();
  });

  tileDeleteBtn.addEventListener('click', () => {
    const id = tileIdInput.value; if (!id) return;
    const found = findTile(id); if (!found) return;
    if (!confirm(`Delete "${found.tile.label}"?`)) return;
    found.section.tiles.splice(found.index, 1);
    saveState(); renderAll(); tileDialog.close();
  });

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('file read error'));
      reader.onload  = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }
  function findTile(id) {
    for (const sec of state.sections) {
      const idx = sec.tiles.findIndex(t => t.id === id);
      if (idx >= 0) return { section: sec, index: idx, tile: sec.tiles[idx] };
    }
    return null;
  }

  /*** Theme toggle + keyboard ***********************************************/
  const themeToggle = $('#themeToggle');
  themeToggle.addEventListener('click', () => {
    state.theme = (activeTheme() === 'dark') ? 'light' : 'dark';
    saveState(); applyTheme();
  });
  function activeTheme() {
    if (state.theme === 'system') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return state.theme;
  }

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    const editable = ['INPUT','TEXTAREA','SELECT'].includes(tag);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); $('#searchInput').select(); }
    if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); helpDialog.showModal(); }
    if (e.key.toLowerCase() === 't' && !editable) { e.preventDefault(); themeToggle.click(); }
    if (e.key.toLowerCase() === 'n' && !editable) { e.preventDefault(); openTileDialog(); }
    if (e.key.toLowerCase() === 's' && !editable) { e.preventDefault(); openSectionDialog(); }
  });

  const helpDialog = $('#helpDialog');
  $$('.close-btn,[data-close]', helpDialog).forEach(btn => btn.addEventListener('click', () => helpDialog.close()));
  $('#helpBtn').addEventListener('click', () => helpDialog.showModal());

  /*** Notepad ***************************************************************/
  const openNotesBtn = $('#openNotes');
  const notesDialog  = $('#notepadDialog');
  const notesArea    = $('#notesArea');
  const notesExport  = $('#notesExport');
  const notesClear   = $('#notesClear');
  const notesSaved   = $('#notesSaved');

  openNotesBtn.addEventListener('click', () => {
    notesArea.value = localStorage.getItem(NOTES_KEY) || '';
    notesSaved.textContent = notesArea.value ? 'Loaded.' : '';
    notesDialog.showModal();
  });
  $$('.close-btn,[data-close]', notesDialog).forEach(btn => btn.addEventListener('click', () => notesDialog.close()));
  notesArea.addEventListener('input', () => {
    localStorage.setItem(NOTES_KEY, notesArea.value);
    notesSaved.textContent = 'Saved.';
    setTimeout(() => { if (notesSaved.textContent === 'Saved.') notesSaved.textContent = ''; }, 1500);
  });
  notesExport.addEventListener('click', () => {
    const blob = new Blob([notesArea.value || ''], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    a.href = url; a.download = `notes-${stamp}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  notesClear.addEventListener('click', () => {
    if (!confirm('Clear all notes? This cannot be undone.')) return;
    notesArea.value = '';
    localStorage.removeItem(NOTES_KEY);
    notesSaved.textContent = 'Cleared.';
    setTimeout(() => notesSaved.textContent = '', 1500);
  });

  /*** Service worker (optional) **********************************************/
  if ('serviceWorker' in navigator && isSecure()) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  /*** Bootstrap **************************************************************/
  function applyAll() { applyTheme(); applyAccent(); applyDensity(); applyWallpaper(); renderHeaderFooter(); renderAll(); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.theme === 'system') applyTheme(); });
  applyAll();
})();
