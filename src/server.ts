import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const PUBLIC_URL = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PORT = Number(process.env.PORT ?? 3000);
const MAX_BYTES = 10 * 1024 * 1024;

const NAME = /^[A-Za-z0-9_.-]+$/;
const FILE = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/;
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

// Trust the bytes, not the client's claimed type.
export function sniff(b: Buffer): string | null {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a") return "gif";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

const validName = (s: string) => NAME.test(s) && s !== "." && s !== "..";

// ponytail: GitHub is asked on every upload; cache per token+repo if the 5000/h rate limit ever bites.
async function canonicalRepoIfPush(token: string, repo: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "polaroid" },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { full_name: string; permissions?: { push?: boolean } };
  return body.permissions?.push ? body.full_name : null;
}

async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string> = {}) {
  res.writeHead(status, { "x-content-type-options": "nosniff", "content-type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

async function upload(req: IncomingMessage, res: ServerResponse, url: URL) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return send(res, 401, "missing bearer token");

  const parts = (url.searchParams.get("repo") ?? "").split("/");
  if (parts.length !== 2 || !parts.every(validName)) return send(res, 400, "repo must be owner/name");

  const body = await readBody(req);
  if (!body) return send(res, 413, `max ${MAX_BYTES} bytes`);
  const ext = sniff(body);
  if (!ext) return send(res, 415, "only png, jpg, gif, webp");

  const repo = await canonicalRepoIfPush(token, parts.join("/"));
  if (!repo) return send(res, 403, "token lacks push access to repo");

  const file = `${randomBytes(16).toString("hex")}.${ext}`;
  const dir = join(DATA_DIR, repo);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), body);
  send(res, 201, JSON.stringify({ url: `${PUBLIC_URL}/${repo}/${file}` }), { "content-type": "application/json" });
}

async function serve(res: ServerResponse, path: string) {
  const [owner, repo, file, ...rest] = path.slice(1).split("/");
  if (rest.length || !owner || !repo || !file || !validName(owner) || !validName(repo) || !FILE.test(file)) {
    return send(res, 404, "not found");
  }
  try {
    const data = await readFile(join(DATA_DIR, owner, repo, file));
    send(res, 200, data, {
      "content-type": TYPES[file.split(".")[1]],
      "cache-control": "public, max-age=31536000, immutable",
    });
  } catch {
    send(res, 404, "not found");
  }
}

if (import.meta.main) {
  createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const handler =
      req.method === "POST" && url.pathname === "/upload" ? upload(req, res, url)
      : req.method === "GET" ? serve(res, url.pathname)
      : Promise.resolve(send(res, 405, "method not allowed"));
    handler.catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, "internal error");
    });
  }).listen(PORT, () => console.log(`polaroid listening on :${PORT}, serving ${PUBLIC_URL}`));
}
