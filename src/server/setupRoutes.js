const generateId = require('../util/generateId');
const URLPath = require('../util/URLPath');
const httpResponse = require('../util/httpResponse');
const config = require('../config');
const StrShuffler = require('../util/StrShuffler');
const RammerheadSession = require('../classes/RammerheadSession');

/**
 *
 * @param {import('../classes/RammerheadProxy')} proxyServer
 * @param {import('../classes/RammerheadSessionAbstractStore')} sessionStore
 * @param {import('../classes/RammerheadLogging')} logger
 */
module.exports = function setupRoutes(proxyServer, sessionStore, logger) {
    const isNotAuthorized = (req, res) => {
        if (!config.password) return;
        const { pwd } = new URLPath(req.url).getParams();
        if (config.password !== pwd) {
            httpResponse.accessForbidden(logger, req, res, config.getIP(req), 'bad password');
            return true;
        }
        return false;
    };
    if (process.env.DEVELOPMENT) {
        proxyServer.GET('/garbageCollect', (req, res) => {
            global.gc();
            res.end('Ok');
        });
    }
    // query-param entry point: /?url=<target>&password=<pwd>
    // validates, creates a fresh session, and redirects into the proxy
    proxyServer.GET('/', (req, res) => {
        const { url, password } = new URLPath(req.url).getParams();

        if (config.password && password !== config.password) {
            return httpResponse.json(logger, req, res, config.getIP(req), 'bad password', 401);
        }
        if (!url) {
            return httpResponse.json(logger, req, res, config.getIP(req), 'must specify url', 400);
        }

        // accept bare domains like example.com by defaulting the scheme to https
        const withScheme = /^https?:\/\//i.test(url) ? url : 'https://' + url;
        let target;
        try {
            target = new URL(withScheme);
        } catch (e) {
            return httpResponse.json(logger, req, res, config.getIP(req), 'invalid url', 400);
        }
        if ((target.protocol !== 'http:' && target.protocol !== 'https:') || !target.hostname) {
            return httpResponse.json(logger, req, res, config.getIP(req), 'invalid url', 400);
        }

        const id = generateId();
        // fresh session, URL shuffling enabled by default. restrictIP is intentionally
        // left unset so the resulting link is not locked to the requester's IP.
        const session = new RammerheadSession();
        sessionStore.addSerializedSession(id, session.serializeSession());

        res.writeHead(302, { location: `/${id}/${target.href}` });
        res.end();
    });
    proxyServer.GET('/needpassword', (req, res) => {
        res.end(config.password ? 'true' : 'false');
    });
    proxyServer.GET('/newsession', (req, res) => {
        if (isNotAuthorized(req, res)) return;

        const id = generateId();
        const session = new RammerheadSession();
        session.data.restrictIP = config.getIP(req);

        // workaround for saving the modified session to disk
        sessionStore.addSerializedSession(id, session.serializeSession());
        res.end(id);
    });
    proxyServer.GET('/editsession', (req, res) => {
        if (isNotAuthorized(req, res)) return;

        let { id, httpProxy, enableShuffling } = new URLPath(req.url).getParams();

        if (!id || !sessionStore.has(id)) {
            return httpResponse.badRequest(logger, req, res, config.getIP(req), 'not found');
        }

        const session = sessionStore.get(id);

        if (httpProxy) {
            if (httpProxy.startsWith('http://')) {
                httpProxy = httpProxy.slice(7);
            }
            session.setExternalProxySettings(httpProxy);
        } else {
            session.externalProxySettings = null;
        }
        if (enableShuffling === '1' && !session.shuffleDict) {
            session.shuffleDict = StrShuffler.generateDictionary();
        }
        if (enableShuffling === '0') {
            session.shuffleDict = null;
        }

        res.end('Success');
    });
    proxyServer.GET('/deletesession', (req, res) => {
        if (isNotAuthorized(req, res)) return;

        const { id } = new URLPath(req.url).getParams();

        if (!id || !sessionStore.has(id)) {
            res.end('not found');
            return;
        }

        sessionStore.delete(id);
        res.end('Success');
    });
    proxyServer.GET('/sessionexists', (req, res) => {
        const id = new URLPath(req.url).get('id');
        if (!id) {
            httpResponse.badRequest(logger, req, res, config.getIP(req), 'Must specify id parameter');
        } else {
            res.end(sessionStore.has(id) ? 'exists' : 'not found');
        }
    });
    proxyServer.GET('/mainport', (req, res) => {
        const serverInfo = config.getServerInfo(req);
        res.end((serverInfo.port || '').toString());
    });
};
