const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 5000);
const root = path.resolve(__dirname, "..");
const activityLogFile = path.join(root, "activity-log.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function readActivityLog() {
  try {
    if (!fs.existsSync(activityLogFile)) {
      fs.writeFileSync(activityLogFile, "[]");
    }

    const raw = fs.readFileSync(activityLogFile, "utf8");
    const logs = JSON.parse(raw);

    return Array.isArray(logs) ? logs : [];
  } catch (error) {
    return [];
  }
}

function writeActivityLog(logs) {
  fs.writeFileSync(activityLogFile, JSON.stringify(logs, null, 2));
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function collectRequestBody(req, callback) {
  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();

    if (body.length > 1000000) {
      req.destroy();
    }
  });

  req.on("end", () => {
    callback(body);
  });
}

function handleActivityApi(req, res, requestUrl) {
  if (req.method === "GET" && requestUrl.pathname === "/api/activity") {
    const logs = readActivityLog();

    sendJson(res, 200, {
      success: true,
      logs: logs.slice(-500).reverse()
    });

    return true;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/activity") {
    collectRequestBody(req, body => {
      try {
        const data = JSON.parse(body || "{}");
        const logs = readActivityLog();

        const record = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          time: new Date().toISOString(),
          adminId: String(data.adminId || "unknown"),
          adminName: String(data.adminName || "Unknown Admin"),
          action: String(data.action || "unknown_action"),
          details: String(data.details || ""),
          page: String(data.page || ""),
          userAgent: String(req.headers["user-agent"] || "")
        };

        logs.push(record);

        while (logs.length > 2000) {
          logs.shift();
        }

        writeActivityLog(logs);

        sendJson(res, 200, {
          success: true,
          record
        });
      } catch (error) {
        sendJson(res, 400, {
          success: false,
          error: "Invalid activity log data"
        });
      }
    });

    return true;
  }

  return false;
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (handleActivityApi(req, res, requestUrl)) {
    return;
  }

  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("Forbidden");
    return;
  }

  if (decodedPath === "/") {
    filePath = path.join(root, "index.html");
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();

    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": process.env.NODE_ENV === "production" ? "public, max-age=300" : "no-store"
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Static site serving on http://0.0.0.0:${port}`);
});
