/**
 * Vercel serverless helpers — adapts Node.js IncomingMessage/ServerResponse
 * to the pattern our handlers expect.
 */

export function h(req, res) {
  return {
    getHeader(name) { return req.headers[name.toLowerCase()] || null; },
    async getBody() {
      return new Promise((resolve) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => resolve(body ? JSON.parse(body) : {}));
      });
    },
    json(data, status = 200) {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    },
    empty(status = 204) {
      res.statusCode = status;
      res.end();
    },
  };
}
