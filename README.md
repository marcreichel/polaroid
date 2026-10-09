<p align="center"><img src=".github/header.svg" alt="polaroid: image hosting for agents" width="100%"></p>

Lets agents put images in GitHub issues, comments and PRs, which the GitHub API can't upload.

**Images are public to anyone holding the URL.** The URLs are unguessable (128-bit random), but a leaked link exposes the image. Only uploading is gated: the uploader's GitHub token must have push access to the target repo.

## Server

```sh
docker build -t polaroid .
docker run -d -v polaroid:/data -e PUBLIC_URL=https://img.example.com -p 3000:3000 polaroid
```

Put it behind HTTPS (GitHub's camo image proxy needs it). Back up the `/data` volume.

| Env | Default |
|---|---|
| `PUBLIC_URL` | `http://localhost:3000` |
| `DATA_DIR` | `/data` |
| `PORT` | `3000` |

API: `POST /upload?repo=owner/name` with `Authorization: Bearer <github token>` and the raw image as the body. Accepts png, jpg, gif and webp (detected from the bytes), max 10 MB. Returns `{"url": ...}`. `GET /<owner>/<repo>/<id>.<ext>` serves the image.

## MCP client (local, stdio)

```json
{
  "mcpServers": {
    "polaroid": {
      "command": "npx",
      "args": ["-y", "@marcreichel/polaroid"],
      "env": { "POLAROID_URL": "https://img.example.com" }
    }
  }
}
```

The token comes from `GITHUB_TOKEN`, falling back to `gh auth token`. Tool: `upload_image(repo, path, alt?)` returns Markdown ready to paste.
