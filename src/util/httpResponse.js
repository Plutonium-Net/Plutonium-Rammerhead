/**
 * @typedef {'badRequest'|'accessForbidden'|'json'} httpResponseTypes
 */

/**
 * @type {{[key in httpResponseTypes]: (logger: import('../classes/RammerheadLogging'), req: import('http').IncomingMessage, res: import('http').ServerResponse, ip: string, msg: string, statusCode?: number) => void}}
 */
module.exports = {
    badRequest: (logger, req, res, ip, msg) => {
        logger.error(`(httpResponse.badRequest) ${ip} ${req.url} ${msg}`);
        res.writeHead(400);
        res.end(msg);
    },
    accessForbidden: (logger, req, res, ip, msg) => {
        logger.error(`(httpResponse.badRequest) ${ip} ${req.url} ${msg}`);
        res.writeHead(403);
        res.end(msg);
    },
    // send a machine-readable error, e.g. for the query-param proxy endpoint
    json: (logger, req, res, ip, msg, statusCode = 400) => {
        logger.error(`(httpResponse.json) ${ip} ${req.url} [${statusCode}] ${msg}`);
        res.writeHead(statusCode, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
    }
};
