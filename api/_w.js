/**
 * Adapter: converts Vercel Node.js (req, res) to Web-style Request/Response.
 *
 * Vercel's Node.js runtime passes IncomingMessage + ServerResponse,
 * not the Web fetch API. Use `w(req, res)` to get a Web-compatible req/res.
 *
 * Usage in every API handler:
 *   import { w } from '../_w.js';
 *   export default async function handler(nodeReq, nodeRes) {
 *     const { req, res } = w(nodeReq, nodeRes);
 *     // Now use req.headers.get(), await req.json(), res.status(200).json(...)
 *     return res.json({ ok: true });
 *   }
 */

export function w(nodeReq, nodeRes) {
  let bodyPromise = null;

  const req = {
    method: nodeReq.method,
    url: nodeReq.url,
    headers: {
      get(name) {
        const key = name.toLowerCase();
        return nodeReq.headers[key] || null;
      },
      ...nodeReq.headers,
    },
    async json() {
      if (bodyPromise) return bodyPromise;
      bodyPromise = new Promise((resolve) => {
        if (!["POST", "PUT", "PATCH"].includes(nodeReq.method)) return resolve({});
        let body = "";
        nodeReq.on("data", (chunk) => (body += chunk));
        nodeReq.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch { resolve({}); }
        });
      });
      return bodyPromise;
    },
  };

  const res = {
    send(body, status = 200) {
      nodeRes.writeHead(status, { "Content-Type": "application/json" });
      nodeRes.end(JSON.stringify(body));
    },
    json(body, status = 200) {
      this.send(body, status);
    },
    empty(status = 204) {
      nodeRes.writeHead(status);
      nodeRes.end();
    },
    setCors() {
      nodeRes.setHeader("Access-Control-Allow-Origin", "*");
      nodeRes.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      nodeRes.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    },
  };

  return { req, res };
}
