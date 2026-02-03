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

## Install

**One-liner:**
```bash
curl -fsSL https://raw.githubusercontent.com/tim0120/bird/main/install.sh | bash
```

**Or manually:**
```bash
git clone https://github.com/tim0120/bird.git ~/Developer/projects/bird
cd ~/Developer/projects/bird
pnpm install && pnpm run build
brew install pngpaste catimg  # macOS
```

## Setup (zsh)

Add to `~/.zshrc`:

```bash
# bird - clipboard image tweeting
tweet() {
  local BIRD="node $HOME/Developer/projects/bird/dist/cli.js"
  if [[ "$1" == "--img" ]]; then
    shift
    pngpaste /tmp/clip.png 2>/dev/null
    catimg -w 100 /tmp/clip.png
    read "?Tweet this? [y/N] "
    [[ "$REPLY" =~ ^[Yy]$ ]] && $BIRD tweet "$@" --media /tmp/clip.png
  else
    $BIRD tweet "$@"
  fi
}
```

Then: `source ~/.zshrc`

### Cookie Auth

bird uses browser cookies. Pick your browser:

```bash
# Safari (default)
$BIRD tweet "hello"

# Chrome
$BIRD --cookie-source chrome tweet "hello"

# Firefox (with profile)
$BIRD --cookie-source firefox --firefox-profile "default-release" tweet "hello"
```

### Multiple Accounts

Create aliases for different browsers/profiles:

```bash
alias tweet-main='node ~/Developer/projects/bird/dist/cli.js --cookie-source safari tweet'
alias tweet-alt='node ~/Developer/projects/bird/dist/cli.js --cookie-source firefox --firefox-profile "work" tweet'
```

## Logging

This fork adds file-based logging to debug Twitter's bot detection (errors 226, 344).

```bash
# macOS
tail -f ~/Library/Logs/bird-fork.log

# Linux
tail -f ~/.local/share/bird-fork/bird.log
```

## Upstream

For full docs, see [steipete/bird](https://github.com/steipete/bird).
