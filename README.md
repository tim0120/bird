# bird (fork) 🐦

A fork of [steipete/bird](https://github.com/steipete/bird) with **logging** and **clipboard image tweeting**.

> See the [upstream repo](https://github.com/steipete/bird) for full documentation, install instructions, and API reference.

## What This Fork Adds

### 1. File-Based Logging

Logs tweet attempts, endpoint selection, errors, and fallback behavior to help debug Twitter's bot detection (error 226) and permissions blocks (error 344).

**Log locations:**
- macOS: `~/Library/Logs/bird-fork.log`
- Linux: `~/.local/share/bird-fork/bird.log`

```bash
# Watch logs in real-time
tail -f ~/Library/Logs/bird-fork.log
```

**Example log output:**
```
[2026-02-03T02:56:39.908Z] [INFO] createTweet started {"textPreview":"hello world","mediaCount":1,"isReply":false}
[2026-02-03T02:56:40.416Z] [DEBUG] Attempting primary GraphQL endpoint {"url":"https://x.com/i/api/graphql/.../CreateTweet"}
[2026-02-03T02:56:40.490Z] [DEBUG] Primary endpoint response {"status":200,"ok":true}
[2026-02-03T02:56:40.492Z] [WARN] GraphQL returned errors {"errors":[...],"errorCodes":[344]}
```

### 2. Quick Image Tweeting (zsh aliases)

Tweet with clipboard image preview in terminal:

```bash
# Add to ~/.zshrc

# Helper to get latest image from Maccy clipboard manager
maccy-img() {
  sqlite3 "$HOME/Library/Containers/org.p0deje.Maccy/Data/Library/Application Support/Maccy/Storage.sqlite" \
    "SELECT writefile('/tmp/clip.png', hic.ZVALUE) FROM ZHISTORYITEM hi JOIN ZHISTORYITEMCONTENT hic ON hic.ZITEM = hi.Z_PK WHERE hic.ZTYPE = 'public.png' ORDER BY hi.ZLASTCOPIEDAT DESC LIMIT 1" >/dev/null
}

# Tweet with optional --img flag for clipboard image
tweet() {
  if [[ "$1" == "--img" ]]; then
    shift
    pngpaste /tmp/clip.png 2>/dev/null || maccy-img
    catimg -w 100 /tmp/clip.png  # preview image in terminal
    read "?Tweet this? [y/N] "
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
      node ~/Developer/projects/bird-fork/dist/cli.js \
        --cookie-source firefox --firefox-profile "zen-profile" \
        tweet "$@" --media /tmp/clip.png
    fi
  else
    node ~/Developer/projects/bird-fork/dist/cli.js \
      --cookie-source firefox --firefox-profile "zen-profile" \
      tweet "$@"
  fi
}
```

**Usage:**
```bash
tweet "hello world"              # text only
tweet --img "check this out"     # with clipboard image (shows preview first)
```

**Dependencies:**
- `pngpaste` (`brew install pngpaste`)
- `catimg` (`brew install catimg`)
- [Maccy](https://maccy.app/) clipboard manager (optional, for fallback)

## Install (from source)

```bash
git clone https://github.com/tim0120/bird.git
cd bird
pnpm install
pnpm run build
```

Then update your aliases to point to `~/path/to/bird/dist/cli.js`.

## Why Fork?

The upstream `bird` is great, but I wanted:
1. **Logging** - Twitter's bot detection is aggressive and opaque; logs help debug what's happening
2. **Clipboard workflow** - Copy image → `tweet --img "caption"` → see preview → post

## Upstream

For full docs, see [steipete/bird](https://github.com/steipete/bird).
