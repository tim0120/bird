# bird (fork) 🐦

A fork of [steipete/bird](https://github.com/steipete/bird) for **clipboard image tweeting** from the terminal.

> See the [upstream repo](https://github.com/steipete/bird) for full documentation and API reference.

## Quick Image Tweeting

Copy an image → tweet it with a caption → see a preview first:

```bash
tweet --img "check this out"
```

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
▄▄▄▄▄  (image preview)  ▄▄▄▄▄
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
Tweet this? [y/N] y
✅ Tweet posted successfully!
🔗 https://x.com/i/status/123456789
```

### Setup (zsh)

Add to `~/.zshrc`:

```bash
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
    catimg -w 100 /tmp/clip.png  # preview in terminal
    read "?Tweet this? [y/N] "
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
      node ~/Developer/projects/bird/dist/cli.js \
        --cookie-source firefox --firefox-profile "zen-profile" \
        tweet "$@" --media /tmp/clip.png
    fi
  else
    node ~/Developer/projects/bird/dist/cli.js \
      --cookie-source firefox --firefox-profile "zen-profile" \
      tweet "$@"
  fi
}
```

**Usage:**
```bash
tweet "hello world"              # text only
tweet --img "check this out"     # clipboard image + preview
```

**Dependencies:**
- `pngpaste` (`brew install pngpaste`)
- `catimg` (`brew install catimg`)
- [Maccy](https://maccy.app/) clipboard manager (optional fallback)

## Install

```bash
git clone https://github.com/tim0120/bird.git
cd bird
pnpm install
pnpm run build
```

Then update your `~/.zshrc` to point to `~/path/to/bird/dist/cli.js`.

## Logging

This fork also adds file-based logging to help debug Twitter's bot detection.

**Log locations:**
- macOS: `~/Library/Logs/bird-fork.log`
- Linux: `~/.local/share/bird-fork/bird.log`

```bash
tail -f ~/Library/Logs/bird-fork.log
```

## Upstream

For full docs, see [steipete/bird](https://github.com/steipete/bird).
