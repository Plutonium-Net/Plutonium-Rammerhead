const fs = require('fs');
const cluster = require('cluster');
const config = require('../config');
const { version } = require('../../package.json');

/**
 * The root search screen: brand splash on public/background.png.
 *
 * Three stacked cards — title with the target field, detailed status,
 * description — above the brand wordmark that is baked into the background.
 * The status card is filled from one same-origin request to /healthz, so the
 * page never claims "up" before it has asked.
 *
 * Background, logo and favicon are static files in ../../public, served by the
 * [assets] counterpart of the proxy (see config.publicDir) rather than inlined
 * here (the background alone is 414 KB, which has no place in a page string).
 */

const escapeHTML = (str) =>
    String(str).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

/**
 * @param {string} host - hostname the page was requested on, shown as the eyebrow
 * @returns {string} the search screen markup
 */
const landingPage = (host) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Plutonium Rammerhead</title>
<meta name="description" content="Session-based web proxy for Plutonium Network, built on testcafe-hammerhead." />
<meta name="theme-color" content="#050508" />
<meta property="og:title" content="Plutonium Rammerhead" />
<meta property="og:description" content="Session-based web proxy for Plutonium Network." />
<meta property="og:image" content="/background.png" />
<link rel="icon" type="image/png" href="/favicon.png" />
<link rel="apple-touch-icon" href="/favicon.png" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --text:   #f5f5f7;
    --muted:  #9b9ba4;
    --accent: #e8175d;
    --ok:     #3ecf8e;
    --warn:   #f5a524;
    --err:    #f2555a;
    --card:   rgba(6, 6, 10, 0.72);
    --line:   rgba(255, 255, 255, 0.10);
    --mono:   ui-monospace, "SF Mono", "Fira Code", Menlo, monospace;
  }

  html { background: #000; }

  body {
    min-height: 100%;
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* Fixed so the artwork stays put while short screens scroll; bottom-anchored
     so the brand wordmark always sits on the bottom edge, never half-cropped.
     Untinted: the image is drawn exactly as supplied. */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -2;
    background: #000 url("/background.png") center bottom / cover no-repeat;
  }

  .stage {
    min-height: 100svh;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: clamp(7px, 1vh, 11px);
    /* background.png is 2:1 and its Plutonium wordmark fills the lower third;
       its first lit pixel is at 34.8% of the image height. Under cover the
       image is max(50vw, 100svh) tall, so that band is reserved: the cards sit
       above the brand instead of on top of it. */
    padding:
      clamp(24px, 5vh, 72px)
      clamp(18px, 2vw, 28px)
      calc(max(50vw, 100svh) * 0.348 + 4px)
      clamp(18px, 2vw, 28px);
  }

  .card {
    width: min(100%, 1160px);
    padding: clamp(11px, 2vh, 22px);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 22px;
    backdrop-filter: blur(22px) saturate(130%);
    -webkit-backdrop-filter: blur(22px) saturate(130%);
    box-shadow:
      0 30px 80px -32px rgba(0, 0, 0, 0.95),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  /* ---- 1. title and target field ---------------------------------------- */

  .card__head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(14px, 1.8vw, 26px);
  }
  .card__mark {
    flex: none;
    width: clamp(34px, 4.6vh, 56px);
    height: auto;
    filter: drop-shadow(0 0 20px rgba(232, 23, 93, 0.3));
  }
  .card__eyebrow {
    font-family: var(--mono);
    font-size: clamp(0.68rem, 1.55vh, 0.9rem);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(232, 23, 93, 0.95);
    margin-bottom: clamp(1px, 0.5vh, 5px);
  }
  .card__title {
    font-size: clamp(1.35rem, 4.5vh, 3rem);
    font-weight: 650;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  .search {
    display: flex;
    align-items: stretch;
    gap: clamp(8px, 1vw, 12px);
    margin-top: clamp(8px, 1.4vh, 14px);
    padding-top: clamp(8px, 1.3vh, 14px);
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .search__input {
    flex: 1 1 220px;
    min-width: 0;
    height: clamp(36px, 5vh, 48px);
    padding: 0 clamp(12px, 1.4vw, 18px);
    font: inherit;
    font-size: clamp(0.85rem, 1.9vh, 1rem);
    color: var(--text);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--line);
    border-radius: 12px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .search__input::placeholder { color: rgba(255, 255, 255, 0.32); }
  .search__input:hover { border-color: rgba(255, 255, 255, 0.18); }
  .search__input:focus {
    outline: none;
    border-color: rgba(232, 23, 93, 0.75);
    box-shadow: 0 0 0 3px rgba(232, 23, 93, 0.16);
  }
  .search__input--pwd { flex: 0 1 190px; }

  .search__btn {
    flex: none;
    height: clamp(36px, 5vh, 48px);
    padding: 0 clamp(16px, 2vw, 26px);
    font: inherit;
    font-size: clamp(0.85rem, 1.9vh, 1rem);
    font-weight: 600;
    color: #fff;
    background: var(--accent);
    border: 0;
    border-radius: 12px;
    cursor: pointer;
    transition: filter 0.15s ease;
  }
  .search__btn:hover { filter: brightness(1.1); }
  .search__btn:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.6);
    outline-offset: 2px;
  }

  /* ---- 2. status -------------------------------------------------------- */

  .status__head {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .status__dot {
    width: clamp(7px, 1.1vh, 9px);
    height: clamp(7px, 1.1vh, 9px);
    flex: none;
    border-radius: 50%;
    background: var(--warn);
    box-shadow: 0 0 0 5px rgba(245, 165, 36, 0.14);
  }
  .status__state {
    font-size: clamp(0.95rem, 2.2vh, 1.3rem);
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .status__latency {
    font-family: var(--mono);
    font-size: 0.76rem;
    color: var(--muted);
  }
  .status__latency:empty { display: none; }
  .status__link {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 0.74rem;
    color: rgba(255, 255, 255, 0.34);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .status__link:hover,
  .status__link:focus-visible { color: var(--accent); }

  .status[data-state="ok"] .status__dot {
    background: var(--ok);
    box-shadow: 0 0 0 5px rgba(62, 207, 142, 0.16);
    animation: pulse 2.6s ease-in-out infinite;
  }
  .status[data-state="error"] .status__dot {
    background: var(--err);
    box-shadow: 0 0 0 5px rgba(242, 85, 90, 0.16);
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 5px rgba(62, 207, 142, 0.16); }
    50%      { box-shadow: 0 0 0 8px rgba(62, 207, 142, 0.05); }
  }
  @media (prefers-reduced-motion: reduce) {
    .status[data-state="ok"] .status__dot { animation: none; }
  }

  .checks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(4px, 0.9vh, 8px) 26px;
    margin-top: clamp(8px, 1.8vh, 14px);
    padding-top: clamp(8px, 1.6vh, 13px);
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    list-style: none;
  }
  .checks[hidden] { display: none; }
  .checks li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: clamp(0.74rem, 1.7vh, 0.86rem);
  }
  .checks__name { color: rgba(245, 245, 247, 0.74); }
  .checks__val {
    font-family: var(--mono);
    font-size: 0.74rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .checks li[data-ok="true"] .checks__val  { color: rgba(62, 207, 142, 0.92); }
  .checks li[data-ok="false"] .checks__val { color: rgba(242, 85, 90, 0.95); }

  .status__foot {
    margin-top: clamp(7px, 1.4vh, 11px);
    font-family: var(--mono);
    font-size: clamp(0.62rem, 1.3vh, 0.7rem);
    color: rgba(255, 255, 255, 0.3);
  }

  /* ---- 3. description --------------------------------------------------- */

  .card__desc {
    max-width: 62ch;
    margin-inline: auto;
    text-align: center;
    color: var(--muted);
    font-size: clamp(0.8rem, 1.85vh, 1rem);
    line-height: 1.7;
  }
  .card__desc strong { color: rgba(245, 245, 247, 0.88); font-weight: 550; }

  /* Short, wide windows (a 768p laptop minus browser chrome): cover would blow
     the artwork up to nearly half the height, so scale the image by height
     instead and reserve the correspondingly smaller band. */
  @media (max-height: 700px) {
    .backdrop {
      background-size: auto 72%;
      background-position: left bottom;
    }
    .stage { padding-bottom: calc(72vh * 0.348 + 8px); }
  }

  /* Portrait phones: cover would blow the wordmark up to a third of the screen
     and crop it, so size the image by width instead and reserve 17.4vw. */
  @media (max-width: 700px) {
    .backdrop {
      background-size: 100% auto;
      background-position: left bottom;
    }
    .stage { padding-bottom: calc(50vw * 0.348 + 8px); }
    /* vh-driven type would run enormous on a tall phone, so scale by width. */
    .card__title { font-size: clamp(1.5rem, 7.4vw, 2.3rem); }
    .card__eyebrow { font-size: clamp(0.62rem, 2.7vw, 0.8rem); letter-spacing: 0.1em; }
    .search { flex-wrap: wrap; }
    .search__input,
    .search__input--pwd { flex: 1 1 100%; }
    .search__btn { flex: 1 1 100%; }
  }

  /* Every size above is vh-driven, so the stack shrinks with the window and
     keeps clear of the artwork band without a stack of breakpoints. Wide
     screens get a single row of checks. */
  @media (min-width: 860px) {
    .checks { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 520px) {
    .checks { grid-template-columns: minmax(0, 1fr); }
  }
</style>
</head>
<body>
<div class="backdrop" aria-hidden="true"></div>

<main class="stage">
  <section class="card card--title">
    <div class="card__head">
      <img class="card__mark" src="/logo.png" alt="" width="58" height="58" />
      <div>
        <p class="card__eyebrow">${escapeHTML(host)}</p>
        <h1 class="card__title">Plutonium Rammerhead</h1>
      </div>
    </div>
    <form class="search" action="/" method="get" role="search">
      <input
        class="search__input"
        type="text"
        name="url"
        placeholder="example.com"
        aria-label="Site to open"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        required
      />${
          config.password
              ? `
      <input
        class="search__input search__input--pwd"
        type="password"
        name="password"
        placeholder="Password"
        aria-label="Password"
        autocomplete="current-password"
        required
      />`
              : ''
      }
      <button class="search__btn" type="submit">Open</button>
    </form>
  </section>

  <section class="card status" data-state="checking" role="status" aria-live="polite">
    <div class="status__head">
      <span class="status__dot" aria-hidden="true"></span>
      <span class="status__state">Checking status</span>
      <span class="status__latency"></span>
      <a class="status__link" href="/healthz">/healthz</a>
    </div>
    <ul class="checks" hidden></ul>
    <p class="status__foot">Contacting the proxy…</p>
  </section>
  <noscript><style>.status { display: none; }</style></noscript>

  <section class="card card--desc">
    <p class="card__desc">
    <strong>Rammerhead</strong> is a session-based web proxy built on testcafe-hammerhead. Every address opens in a
    fresh, isolated session whose cookies and localStorage follow the link, so it keeps your logins on any device.
    </p>
  </section>
</main>

<script>
  (function () {
    var card    = document.querySelector('.status');
    var state   = card.querySelector('.status__state');
    var latency = card.querySelector('.status__latency');
    var list    = card.querySelector('.checks');
    var foot    = card.querySelector('.status__foot');
    var started = Date.now();

    function text(str) {
      return String(str).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function settle(mode, label, ms, body) {
      card.dataset.state = mode;
      state.textContent  = label;
      latency.textContent = ms ? Math.max(1, Math.round(ms)) + ' ms' : '';

      if (body && Array.isArray(body.components) && body.components.length) {
        list.innerHTML = body.components.map(function (c) {
          return '<li data-ok="' + (c.ok ? 'true' : 'false') + '">' +
                   '<span class="checks__name">' + text(c.name) + '</span>' +
                   '<span class="checks__val">' + text(c.value || (c.ok ? 'ok' : 'down')) + '</span>' +
                 '</li>';
        }).join('');
        list.hidden = false;
      }

      var at = new Date();
      foot.textContent = (body && body.version ? 'v' + body.version + ' · ' : '') +
        'Checked ' + at.toISOString().slice(11, 19) + ' UTC · GET /healthz';
    }

    fetch('/healthz', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) {
        var ms = Date.now() - started;
        return res.json().catch(function () { return null; }).then(function (body) {
          if (!body) return settle('error', 'No response', ms, null);
          settle(body.status === 'ok' ? 'ok' : 'error',
                 body.status === 'ok' ? 'Operational' : 'Degraded', ms, body);
        });
      })
      .catch(function () {
        card.dataset.state = 'error';
        state.textContent  = 'Unreachable';
        latency.textContent = '';
        foot.textContent = 'No response from /healthz';
      });
  })();
</script>
</body>
</html>`;

/**
 * Everything the status card reports, asked of the process that is answering
 * the request rather than assumed at render time.
 *
 * @returns {object} health payload: status, version, uptime, per-subsystem checks
 */
const healthReport = () => {
    const components = [];

    let sessionsWritable = false;
    try {
        fs.accessSync(config.fileCacheSessionConfig.saveDirectory, fs.constants.R_OK | fs.constants.W_OK);
        sessionsWritable = true;
    } catch (e) {
        sessionsWritable = false;
    }

    components.push({
        name: 'session store',
        ok: sessionsWritable,
        value: sessionsWritable ? 'writable' : 'unavailable'
    });
    components.push({
        name: 'js cache',
        ok: Boolean(config.jsCache),
        value: config.jsCache ? 'enabled' : 'off'
    });
    components.push({
        name: 'worker',
        ok: true,
        value: cluster.isWorker ? '#' + cluster.worker.id : 'single'
    });

    return {
        status: components.every((component) => component.ok) ? 'ok' : 'error',
        version,
        uptime: Math.round(process.uptime()),
        components
    };
};

module.exports = { landingPage, healthReport };
