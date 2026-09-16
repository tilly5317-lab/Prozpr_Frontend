#!/usr/bin/env bash
# Install the SPA cache-header snippet into the live nginx site. Idempotent:
# safe to run on every deploy, does nothing once the include is in place.
#
#     sudo bash deploy/install-nginx-cache.sh
#
# SAFETY: the running config is backed up first, and `nginx -t` decides. If the
# edited config does not validate, the backup is restored and nginx is NEVER
# reloaded — a bad edit cannot take the site down, it just leaves the old
# behaviour in place and exits non-zero.
set -euo pipefail

SNIPPET_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nginx-spa-cache.conf"
SNIPPET_DEST="/etc/nginx/snippets/prozpr-spa-cache.conf"
INCLUDE_LINE="    include ${SNIPPET_DEST};"
DOCROOT="/var/www/html"

if [ ! -f "$SNIPPET_SRC" ]; then
  echo "error: snippet not found at $SNIPPET_SRC" >&2
  exit 1
fi

mkdir -p /etc/nginx/snippets
install -m 644 "$SNIPPET_SRC" "$SNIPPET_DEST"
echo "installed $SNIPPET_DEST"

# The site that actually serves the SPA — found by its docroot rather than by a
# guessed filename, since the file may be prozpr, default, or anything else.
SITE="$(grep -rl "root ${DOCROOT}" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -1 || true)"
if [ -z "$SITE" ]; then
  echo "error: no enabled site has 'root ${DOCROOT}'. Add this line inside the" >&2
  echo "       correct server block by hand:  ${INCLUDE_LINE}" >&2
  exit 1
fi
echo "serving site: $SITE"

if grep -qF "$SNIPPET_DEST" "$SITE"; then
  echo "include already present — nothing to change"
  exit 0
fi

BACKUP="${SITE}.bak-$(date +%Y%m%d%H%M%S)"
cp -p "$SITE" "$BACKUP"
echo "backed up to $BACKUP"

# Insert immediately after the docroot line, which is inside the server block by
# definition — no brace matching, no guessing where the block starts.
awk -v inc="$INCLUDE_LINE" -v root="root ${DOCROOT}" '
  { print }
  !done && index($0, root) { print inc; done = 1 }
' "$BACKUP" > "$SITE"

if ! nginx -t; then
  cp -p "$BACKUP" "$SITE"
  echo "error: nginx -t failed; config restored from backup, nginx NOT reloaded" >&2
  exit 1
fi

systemctl reload nginx
echo "nginx reloaded — index.html now revalidates, /assets/ cached immutably"
