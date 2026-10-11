# rammerhead

> proxy based on testcafe-hammerhead (password is `sharkie4life`)

Demo link: https://demo-opensource.rammerhead.org

Polished closed-source-for-now browser version: https://browser.rammerhead.org (more links by awesome community members in the discord server at the end of readme)


## Supporting me and contributing

Server infrastructure costs money and developing this project consumes a lot of my time, so I would appreciate it greatly if you become a Patreon member: https://www.patreon.com/rammerhead


## Who is this package for

Package is for those who want a fully-configurable proxy that works on many sites

## Effectiveness of proxy

This proxy supports proxying
- basically everything except google logins

## Features of proxy

The proxy allows users to create a "session". When they access their session, their localStorage and cookies will be synced with rammerhead. This allows for accurately mocking cookied requests and conveniently save their logins even if they switch devices. This also enables users to configure a custom HTTP proxy server for rammerhead to connect to for the session.

## Using the proxy endpoint

The interactive demo UI has been removed. The root path is now a query-param entry point:

```
GET /?url=<target>&password=<password>
```

- `url` — the site to proxy. A full URL or a bare domain (`example.com/`); `https://` is assumed when no scheme is given.
- `password` — required when `password` is set in [src/config.js](src/config.js); it must match that value.

On success the endpoint creates a **new, isolated session** (URL shuffling enabled, not locked to your IP) and responds with a **302 redirect** to `/<sessionId>/<targetUrl>`, so the link can be shared and used from any device.

Errors are JSON with a real HTTP status:

| Status | Body | Cause |
| ------ | ---- | ----- |
| 401 | `{"error":"bad password"}` | missing or wrong `password` |
| 400 | `{"error":"must specify url"}` | no `url` parameter |
| 400 | `{"error":"invalid url"}` | `url` is not a valid http/https URL |

Example:

```bash
curl -i "http://127.0.0.1:8080/?url=example.com&password=sharkie4life"
```

> Note: putting the password in the query string means it can appear in server access logs and browser history. Change `config.password` or front the server with an auth layer if that matters.

## Installing and running

Rammerhead recommends you to have at least **node v16** to be installed. Once you installed nodejs, clone the repo, then run `npm install` and `npm run build`.

After, configure your settings in [src/config.js](src/config.js). If you wish to consistently pull updates from this repo without the hassle of merging, create `config.js` in the root folder so they override the configs in `src/`.

Finally run the following to start rammerhead: `node src/server.js`

## Deploying to Render

This repo includes a [render.yaml](render.yaml) Blueprint and a root [config.js](config.js) tuned for Render.

**Dashboard steps:**

1. Push the repo to GitHub/GitLab.
2. Render → **New +** → **Blueprint** and select the repo (or **Web Service** and configure it by hand).
3. Confirm: Runtime **Node**, Plan **Free**, Build Command `npm install && npm run build`, Start Command `npm start`, Health Check Path `/needpassword`.
4. Deploy. The public URL is `https://<name>.onrender.com`; append your params: `https://<name>.onrender.com/?url=example.com&password=sharkie4life`.

**Why the config override exists** ([config.js](config.js), loaded by [src/config.js](src/config.js) when present):

- Binds `0.0.0.0` and reads `PORT` (Render's default is `10000`).
- Runs in single-port mode (`crossDomainPort: null`) because Render exposes one HTTP port. Cross-origin requests are not perfectly simulated.
- Rewrites proxied URLs to the public host/protocol from the request (`X-Forwarded-Proto` / `Host`) instead of `localhost`.
- Uses `X-Forwarded-For` for the client IP and runs a single process to fit small instances.

The override only changes the port/worker settings when `PORT` is a positive number (Render always sets one), so local `node src/server.js` keeps its two-port, multi-process behavior. Node is pinned to 22.17.1 via [.node-version](.node-version).

**Free-tier caveats:**

- Free services **spin down after 15 minutes** of inactivity and take ~1 minute to wake, so the first request after idle is slow.
- The filesystem is **ephemeral**: `sessions/` and `cache-js/` are wiped on every deploy, restart, or spin-down, so saved logins do not survive. Persistent Disks require a paid plan.
- The session password in [src/config.js](src/config.js) is public in the repo. Anyone who finds it can create sessions on your deploy; change it before exposing the service.

## Discord server

For any user-help non-issue related questions, especially pertaining to Rammerhead Browser, please ask them here: [Rammerhead Support Server](https://discord.gg/VNT4E7gN5Y).
