#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const POLAROID_URL = process.env.POLAROID_URL?.replace(/\/$/, "");

function githubToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
}

const server = new McpServer({ name: "polaroid", version: "0.1.0" });

server.registerTool(
  "upload_image",
  {
    description:
      "Upload a local image (png, jpg, gif, webp; max 10 MB) and get Markdown to embed in a GitHub issue, comment or PR. " +
      "The URL is unguessable but public: anyone holding the link can view it.",
    inputSchema: {
      repo: z.string().describe("Target repository as owner/name; your GitHub token needs push access to it"),
      path: z.string().describe("Absolute path to the image file"),
      alt: z.string().optional().describe("Alt text"),
    },
  },
  async ({ repo, path, alt }) => {
    if (!POLAROID_URL) throw new Error("POLAROID_URL is not set");
    const res = await fetch(`${POLAROID_URL}/upload?repo=${encodeURIComponent(repo)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${githubToken()}`, "content-type": "application/octet-stream" },
      body: await readFile(path),
    });
    if (!res.ok) throw new Error(`upload failed (${res.status}): ${await res.text()}`);
    const { url } = (await res.json()) as { url: string };
    return { content: [{ type: "text", text: `![${alt ?? ""}](${url})` }] };
  },
);

await server.connect(new StdioServerTransport());
