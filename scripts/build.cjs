const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const entries = [".nojekyll", "index.html", "assets", "css", "data", "docs", "js", "vendor"];
const runtimeEntries = ["index.html", "css", "data", "docs", "js", "vendor"];

function copyEntry(source, destination) {
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      copyEntry(path.join(source, child), path.join(destination, child));
    }
    return;
  }

  fs.copyFileSync(source, destination);
}

function removeEntry(target) {
  if (!fs.existsSync(target)) return;
  if (fs.statSync(target).isDirectory()) {
    for (const child of fs.readdirSync(target)) {
      removeEntry(path.join(target, child));
    }
    fs.rmdirSync(target);
    return;
  }

  fs.unlinkSync(target);
}

removeEntry(output);
fs.mkdirSync(output, { recursive: true });

for (const entry of entries) {
  copyEntry(path.join(root, entry), path.join(output, entry));
}

copyEntry(path.join(root, ".openai"), path.join(output, ".openai"));

const workerAssets = [];
function collectWorkerAssets(target, requestPath = "") {
  if (fs.statSync(target).isDirectory()) {
    for (const child of fs.readdirSync(target)) {
      collectWorkerAssets(path.join(target, child), `${requestPath}/${child}`);
    }
    return;
  }

  workerAssets.push([requestPath, fs.readFileSync(target, "utf8")]);
}

for (const entry of runtimeEntries) {
  collectWorkerAssets(path.join(root, entry), `/${entry}`);
}

const workerSource = `const assets = new Map(${JSON.stringify(workerAssets)});
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (pathname === "/") pathname = "/index.html";
    const body = assets.get(pathname);
    if (body === undefined) return new Response("Not found", { status: 404 });
    const extension = pathname.slice(pathname.lastIndexOf("."));
    const headers = {
      "content-type": contentTypes[extension] || "text/plain; charset=utf-8",
      "cache-control": extension === ".html" ? "no-cache" : "public, max-age=3600",
      "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "nosniff"
    };
    return new Response(request.method === "HEAD" ? null : body, { headers });
  }
};
`;

fs.mkdirSync(path.join(output, "server"), { recursive: true });
fs.writeFileSync(path.join(output, "server", "index.js"), workerSource);

console.log(`Built ${entries.length} static entries in dist/`);
