// The floating button on Remotasks pages: the owl, with the task's timer next to it while one runs.
// The chevron at its end makes it smaller: just the timer, or a small owl with no task running.
// Clicking it opens the same popup as the toolbar button, in a panel on the page (popup.html in an
// iframe, so everything works the same there). It can be dragged anywhere, and turned off from the
// popup. It reads only this page's address, to hand the task ID to the panel; nothing on the page
// is read or changed.
;(() => {
  if (window.top !== window) return

  const PANEL_URL = chrome.runtime.getURL('popup.html')
  const PANEL_WIDTH = 360
  const GAP = 10
  const EDGE = 12

  let host = null
  let wrap = null
  let fab = null
  let sizeToggle = null
  let minified = false
  let timeEl = null
  let panel = null
  let frame = null
  let current = null
  let position = { right: 24, bottom: 24 }
  let ticker = null
  let urlWatcher = null
  let lastUrl = location.href
  let contentHeight = 560

  const STYLE = `
    :host { all: initial; }
    /* One pill: the button that opens the panel, then the chevron that shrinks or grows it. */
    .wrap {
      position: fixed;
      z-index: 2147483646;
      display: inline-flex;
      align-items: stretch;
      height: 48px;
      overflow: hidden;
      border: 2px solid #f5b301;
      border-radius: 999px;
      background: #32373f;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
    }
    .fab, .size {
      margin: 0;
      border: 0;
      background: transparent;
      color: #f5f6f8;
    }
    .fab {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 8px 0 8px;
      cursor: grab;
      touch-action: none;
      user-select: none;
      font: 600 13px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .fab.has-task { padding-right: 10px; }
    .fab.dragging { cursor: grabbing; }
    .fab img { width: 28px; height: 28px; display: block; pointer-events: none; }
    .time { display: none; align-items: center; gap: 6px; }
    .fab.has-task .time { display: inline-flex; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #98a0ad; }
    .fab.running .dot { background: #22c55e; box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25); }
    .size {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      padding: 0 2px 0 0;
      border-left: 1px solid rgba(255, 255, 255, 0.16);
      color: #98a0ad;
      cursor: pointer;
    }
    .size:hover { color: #f5b301; background: rgba(255, 255, 255, 0.06); }
    .size svg { width: 14px; height: 14px; display: block; }
    .fab:focus-visible, .size:focus-visible { outline: 2px solid #f5b301; outline-offset: -3px; }
    .wrap.mini { height: 26px; border-width: 1.5px; }
    .wrap.mini .fab { gap: 6px; padding: 0 5px; font-size: 12px; }
    .wrap.mini .fab.has-task { padding: 0 7px 0 9px; }
    .wrap.mini .fab img { width: 16px; height: 16px; }
    .wrap.mini .fab.has-task img { display: none; }
    .wrap.mini .dot { width: 7px; height: 7px; }
    .wrap.mini .size { width: 18px; }
    .wrap.mini .size svg { width: 12px; height: 12px; }
    .panel {
      position: fixed;
      z-index: 2147483647;
      width: ${PANEL_WIDTH}px;
      max-width: calc(100vw - ${EDGE * 2}px);
      overflow: hidden;
      border-radius: 14px;
      background: #12141a;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
    }
    .panel[hidden] { display: none; }
    @media (prefers-color-scheme: light) { .panel { background: #f6f7f8; } }
    iframe { display: block; width: 100%; height: 100%; border: 0; }
  `

  // Same format as the popup and the tracker: 75 -> '1:15', 3725 -> '1:02:05'.
  function formatTimer(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = String(seconds % 60).padStart(2, '0')
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
  }

  function timerSeconds(row) {
    const banked = row.timer_elapsed_seconds ?? 0
    if (!row.timer_started_at) return banked
    return banked + Math.max(0, Math.floor((Date.now() - new Date(row.timer_started_at).getTime()) / 1000))
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max))
  }

  // --- the button ------------------------------------------------------------------------------

  function renderFab() {
    if (!fab) return
    const row = current?.row
    const inProgress = row && row.status === 'in_progress'
    const running = Boolean(inProgress && row.timer_started_at)
    fab.classList.toggle('has-task', Boolean(inProgress))
    fab.classList.toggle('running', running)
    timeEl.lastChild.textContent = inProgress ? formatTimer(timerSeconds(row)) : ''
    fab.title = running ? 'Grey Owls Tracker: timer running' : inProgress ? 'Grey Owls Tracker: timer paused' : 'Grey Owls Tracker'
    clearInterval(ticker)
    ticker = running ? setInterval(renderFab, 1000) : null
    placeFab()
  }

  function placeFab() {
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    position = {
      right: clamp(position.right, EDGE, window.innerWidth - rect.width - EDGE),
      bottom: clamp(position.bottom, EDGE, window.innerHeight - rect.height - EDGE),
    }
    wrap.style.right = `${position.right}px`
    wrap.style.bottom = `${position.bottom}px`
    placePanel()
  }

  function renderSize() {
    if (!wrap) return
    wrap.classList.toggle('mini', minified)
    // › shrinks it to the timer, ‹ brings the owl back.
    sizeToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${minified ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}"/></svg>`
    sizeToggle.title = minified ? 'Show the owl' : 'Just the timer'
    sizeToggle.setAttribute('aria-label', sizeToggle.title)
    placeFab()
  }

  // A drag moves it; a click without moving opens or closes the panel.
  function enableDrag() {
    let start = null
    fab.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      start = { x: event.clientX, y: event.clientY, right: position.right, bottom: position.bottom, moved: false }
      fab.setPointerCapture(event.pointerId)
    })
    fab.addEventListener('pointermove', (event) => {
      if (!start) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (!start.moved && Math.hypot(dx, dy) < 5) return
      start.moved = true
      fab.classList.add('dragging')
      position = { right: start.right - dx, bottom: start.bottom - dy }
      placeFab()
    })
    fab.addEventListener('pointerup', () => {
      if (!start) return
      const moved = start.moved
      start = null
      fab.classList.remove('dragging')
      if (moved) chrome.storage.local.set({ floatingPosition: position })
      else togglePanel()
    })
    fab.addEventListener('pointercancel', () => {
      start = null
      fab.classList.remove('dragging')
    })
    fab.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        togglePanel()
      }
    })
  }

  // --- the panel -------------------------------------------------------------------------------

  // Above the button when it's in the lower half of the window, below it otherwise; right edges lined up.
  function placePanel() {
    if (!panel || panel.hidden) return
    const fabRect = wrap.getBoundingClientRect()
    const width = Math.min(PANEL_WIDTH, window.innerWidth - EDGE * 2)
    const below = fabRect.top + fabRect.height / 2 < window.innerHeight / 2
    const room = below ? window.innerHeight - fabRect.bottom - GAP - EDGE : fabRect.top - GAP - EDGE
    const height = Math.max(200, Math.min(contentHeight, room))
    const left = clamp(fabRect.right - width, EDGE, window.innerWidth - width - EDGE)
    const top = below ? fabRect.bottom + GAP : Math.max(EDGE, fabRect.top - GAP - height)
    Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, height: `${height}px` })
  }

  function openPanel() {
    if (!panel.hidden) return
    lastUrl = location.href
    frame = document.createElement('iframe')
    frame.title = 'Grey Owls Tracker'
    frame.src = `${PANEL_URL}?embedded=1&page=${encodeURIComponent(location.href)}`
    panel.replaceChildren(frame)
    panel.hidden = false
    fab.setAttribute('aria-expanded', 'true')
    placePanel()
    // Remotasks changes task without reloading the page, so the panel is told about a new address.
    urlWatcher = setInterval(() => {
      if (location.href === lastUrl) return
      lastUrl = location.href
      frame?.contentWindow?.postMessage({ type: 'gotracker:page', url: lastUrl }, new URL(PANEL_URL).origin)
    }, 1000)
  }

  // The iframe goes too, so a closed panel doesn't keep polling.
  function closePanel() {
    if (!panel || panel.hidden) return
    panel.hidden = true
    panel.replaceChildren()
    frame = null
    clearInterval(urlWatcher)
    fab.setAttribute('aria-expanded', 'false')
  }

  function togglePanel() {
    if (panel.hidden) openPanel()
    else closePanel()
  }

  window.addEventListener('message', (event) => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== new URL(PANEL_URL).origin) return
    const data = event.data
    if (data?.type === 'gotracker:close') closePanel()
    if (data?.type === 'gotracker:size' && Number.isFinite(data.height)) {
      contentHeight = Math.ceil(data.height)
      placePanel()
    }
  })

  // Closes on Escape, or a click anywhere on the page outside it.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanel()
  })
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (host && !event.composedPath().includes(host)) closePanel()
    },
    true,
  )
  window.addEventListener('resize', placeFab)

  // --- on and off ------------------------------------------------------------------------------

  function mount() {
    if (host) return
    host = document.createElement('div')
    host.id = 'grey-owls-tracker-root'
    const root = host.attachShadow({ mode: 'closed' })
    root.innerHTML = `
      <style>${STYLE}</style>
      <div class="wrap">
        <button class="fab" type="button" aria-label="Grey Owls Tracker" aria-expanded="false">
          <img src="${chrome.runtime.getURL('mark-inverse.svg')}" alt="" />
          <span class="time"><span class="dot"></span><span></span></span>
        </button>
        <button class="size" type="button"></button>
      </div>
      <div class="panel" hidden></div>
    `
    wrap = root.querySelector('.wrap')
    fab = root.querySelector('.fab')
    sizeToggle = root.querySelector('.size')
    const toggleSize = () => {
      minified = !minified
      chrome.storage.local.set({ floatingMinified: minified })
      renderSize()
    }
    // Pointer and key events, not click: Remotasks' editor swallows clicks page-wide before they
    // get here (the button that opens the panel works the same way, in enableDrag).
    let pressed = false
    sizeToggle.addEventListener('pointerdown', (event) => {
      pressed = event.button === 0
    })
    sizeToggle.addEventListener('pointerleave', () => {
      pressed = false
    })
    sizeToggle.addEventListener('pointerup', () => {
      if (pressed) toggleSize()
      pressed = false
    })
    sizeToggle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggleSize()
      }
    })
    timeEl = root.querySelector('.time')
    panel = root.querySelector('.panel')
    enableDrag()
    document.documentElement.append(host)
    renderFab()
    renderSize()
  }

  function unmount() {
    if (!host) return
    closePanel()
    clearInterval(ticker)
    host.remove()
    host = wrap = fab = sizeToggle = timeEl = panel = null
  }

  chrome.storage.local.get(['floatingButton', 'floatingPosition', 'floatingMinified', 'current']).then((data) => {
    if (data.floatingPosition) position = data.floatingPosition
    minified = data.floatingMinified === true
    current = data.current ?? null
    if (data.floatingButton !== false) mount()
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if ('current' in changes) {
      current = changes.current.newValue ?? null
      renderFab()
    }
    if ('floatingButton' in changes) {
      if (changes.floatingButton.newValue === false) unmount()
      else mount()
    }
  })
})()
