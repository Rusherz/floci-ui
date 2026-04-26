const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 4173);
const FLOCI_ORIGIN = process.env.FLOCI_ORIGIN || "http://localhost:4566";
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function send(res, statusCode, contentType, body) {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

function sendJson(res, statusCode, payload) {
  send(res, statusCode, "application/json; charset=utf-8", JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  send(res, statusCode, "text/plain; charset=utf-8", text);
}

function isPathInsideRoot(filePath) {
  const rootWithSep = `${ROOT_DIR}${path.sep}`;
  return filePath === ROOT_DIR || filePath.startsWith(rootWithSep);
}

function resolveStaticPath(urlPathname) {
  if (urlPathname === "/" || urlPathname === "") {
    return path.join(ROOT_DIR, "index.html");
  }

  let relative = "";
  try {
    relative = decodeURIComponent(urlPathname).replace(/^\/+/, "");
  } catch {
    return null;
  }

  const absolute = path.resolve(ROOT_DIR, relative);

  if (!isPathInsideRoot(absolute)) {
    return null;
  }

  return absolute;
}

function sendFile(filePath, res) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const extension = path.extname(filePath);
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    send(res, 200, contentType, data);
  });
}

function serveStatic(reqUrl, res) {
  const filePath = resolveStaticPath(reqUrl.pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (!error && stat.isDirectory()) {
      sendFile(path.join(filePath, "index.html"), res);
      return;
    }

    sendFile(filePath, res);
  });
}

function proxyToFloci(req, res, reqUrl) {
  const upstreamUrl = new URL(FLOCI_ORIGIN);
  const proxiedPath = reqUrl.pathname.replace(/^\/floci/, "") || "/";

  const options = {
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    method: req.method,
    path: `${proxiedPath}${reqUrl.search}`,
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

  proxyReq.on("error", (error) => {
    sendText(res, 502, `Upstream error: ${error.message}`);
  });

  req.pipe(proxyReq);
}

function createRequestHandler() {
  return (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);

    if (reqUrl.pathname === "/healthz") {
      sendJson(res, 200, { ok: true, flociOrigin: FLOCI_ORIGIN });
      return;
    }

    if (reqUrl.pathname.startsWith("/floci")) {
      proxyToFloci(req, res, reqUrl);
      return;
    }

    serveStatic(reqUrl, res);
  };
}

const server = http.createServer(createRequestHandler());

server.listen(PORT, HOST, () => {
  console.log(`floci-ui listening on http://localhost:${PORT}`);
  console.log(`proxying /floci -> ${FLOCI_ORIGIN}`);
});
