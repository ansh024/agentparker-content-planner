/**
 * Helpers for Vercel serverless functions.
 * Converts Node.js IncomingMessage to Web-like Request interface
 * so the rest of the API can use fetch-style patterns.
 */

export function toWebRequest(nodeReq) {
  const url = nodeReq.headers.host
    ? `https://${nodeReq.headers.host}${nodeReq.url}`
    : nodeReq.url;

  return {
    headers: {
      get: (name) => {
        const key = name.toLowerCase();
        return nodeReq.headers[key] || null;
      },
    },
    url,
    method: nodeReq.method,
    json: () => parseBody(nodeReq),
    __nodeReq: nodeReq,
  };
}

function parseBody(nodeReq) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    nodeReq.on("data", (chunk) => chunks.push(chunk));
    nodeReq.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        resolve({});
      }
    });
    nodeReq.on("error", reject);
  });
}

export function nodeRes(body, status = 200) {
  return {
    status,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(status === 204 ? {} : {}),
    },
  };
}
