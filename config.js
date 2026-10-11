// Root override for src/config.js. src/config.js loads this automatically when present
// (`if (fs.existsSync(.../config.js)) Object.assign(module.exports, require('../config'))`).
//
// These settings make Rammerhead work behind a TLS-terminating reverse proxy such as
// Render, where the app is reached over plain HTTP on an internal port but the public
// origin is HTTPS on 443.
//
// Local runs are unaffected: with no PORT env var, crossDomainPort and multithreading
// stay at their defaults. The getServerInfo/getIP overrides are request-derived and
// correct in both cases.

// Render always sets a positive numeric PORT. Requiring a valid number avoids flipping
// into hosted mode when PORT is unset, empty, or "0".
const hosted = Number(process.env.PORT) > 0;

const overrides = {
    // Render routes external traffic to 0.0.0.0:$PORT (PORT defaults to 10000).
    bindingAddress: '0.0.0.0',
    port: Number(process.env.PORT) || 8080,

    // Rewrite proxied URLs to the host and protocol the client actually used, so links
    // point at the public origin instead of localhost.
    getServerInfo: (req) => {
        const hostHeader = req.headers.host || 'localhost';
        const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
        const protocol = forwardedProto ? forwardedProto + ':' : req.socket.encrypted ? 'https:' : 'http:';
        const [hostname, hostPort] = hostHeader.split(':');
        const port = hostPort ? Number(hostPort) : protocol === 'https:' ? 443 : 80;
        return { hostname, port, protocol };
    },

    // Real client IP when sitting behind a load balancer / reverse proxy.
    getIP: (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress
};

if (hosted) {
    // Render exposes a single HTTP port, so run in Hammerhead's single-port mode.
    // Tradeoff: cross-origin requests are not perfectly simulated.
    overrides.crossDomainPort = null;
    // One process, so we don't fork per-CPU and exhaust a small instance's memory.
    overrides.enableWorkers = false;
}

module.exports = overrides;
