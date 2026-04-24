const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 4173);
const FLOCI_ORIGIN = process.env.FLOCI_ORIGIN || 'http://localhost:4566';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function proxyToFloci(req, res) {
  const upstreamUrl = new URL(FLOCI_ORIGIN);
  const incomingUrl = new URL(req.url, `http://${req.headers.host}`);
  const proxiedPath = incomingUrl.pathname.replace(/^\/floci/, '') || '/';

  const options = {
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    method: req.method,
    path: `${proxiedPath}${incomingUrl.search}`,
    headers: {
      ...req.headers,
      host: upstreamUrl.host,
      origin: upstreamUrl.origin,
      referer: upstreamUrl.origin,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Upstream error: ${err.message}`);
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, flociOrigin: FLOCI_ORIGIN }));
    return;
  }

  if (url.pathname.startsWith('/floci')) {
    proxyToFloci(req, res);
    return;
  }

  let filePath = path.join(__dirname, url.pathname);
  if (url.pathname === '/' || url.pathname === '') {
    filePath = path.join(__dirname, 'index.html');
  }

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      sendFile(path.join(filePath, 'index.html'), res);
      return;
    }

    sendFile(filePath, res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`floci-ui listening on http://localhost:${PORT}`);
  console.log(`proxying /floci -> ${FLOCI_ORIGIN}`);
});
