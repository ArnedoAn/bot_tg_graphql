#!/bin/bash
# caddy-manager.sh - Manage Caddy reverse proxy forwardings
# Deploy to server and set executable: chmod +x caddy-manager.sh

CADDYFILE="${CADDYFILE_PATH:-/etc/caddy/Caddyfile}"

usage() {
  echo "Usage: $0 --list"
  echo "       $0 --add --domain <domain> --port <port> --description <description> [--fallback]"
  exit 1
}

list_forwardings() {
  if [ ! -f "$CADDYFILE" ]; then
    echo "ERROR: Caddyfile not found at $CADDYFILE"
    exit 1
  fi

  local description=""
  local domain=""
  local found=0

  while IFS= read -r line; do
    # Capture comment lines as description (# ...)
    if [[ "$line" =~ ^#[[:space:]]+(.*) ]]; then
      description="${BASH_REMATCH[1]}"
      continue
    fi

    # Detect block opening: domain.com { or domain.com{
    if [[ "$line" =~ ^([a-zA-Z0-9._:-]+)[[:space:]]*\{ ]]; then
      domain="${BASH_REMATCH[1]}"
      continue
    fi

    # Detect reverse_proxy directive inside block
    if [[ "$line" =~ reverse_proxy[[:space:]]+[^:]*:([0-9]+) ]]; then
      local port="${BASH_REMATCH[1]}"
      if [ -n "$domain" ]; then
        if [ -n "$description" ]; then
          echo "${domain} -> :${port}  # ${description}"
        else
          echo "${domain} -> :${port}"
        fi
        found=1
      fi
      domain=""
      description=""
      continue
    fi

    # Reset on closing brace
    if [[ "$line" =~ ^\} ]]; then
      domain=""
      description=""
      continue
    fi
  done < "$CADDYFILE"

  if [ "$found" -eq 0 ]; then
    echo "No forwardings found in $CADDYFILE"
  fi
}

add_forwarding() {
  local domain="$1"
  local port="$2"
  local description="$3"
  local with_fallback="$4"

  if [ -z "$domain" ] || [ -z "$port" ]; then
    echo "ERROR: --domain and --port are required"
    exit 1
  fi

  # Validate port is numeric
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    echo "ERROR: Port must be a number"
    exit 1
  fi

  # Validate domain (basic check)
  if ! [[ "$domain" =~ ^[a-zA-Z0-9._:-]+$ ]]; then
    echo "ERROR: Invalid domain format"
    exit 1
  fi

  if [ ! -f "$CADDYFILE" ]; then
    echo "ERROR: Caddyfile not found at $CADDYFILE"
    exit 1
  fi

  # Check for duplicate domain
  if grep -qP "^${domain}[[:space:]*{]" "$CADDYFILE" 2>/dev/null || grep -q "^${domain} {" "$CADDYFILE" || grep -q "^${domain}{" "$CADDYFILE"; then
    echo "ERROR: Domain '${domain}' already exists in Caddyfile"
    exit 1
  fi

  # Backup Caddyfile before modifying
  cp "$CADDYFILE" "${CADDYFILE}.bak"

  # Build config block — with fallback imports when requested
  if [ "$with_fallback" = "1" ]; then
    if [ -n "$description" ]; then
      cat >> "$CADDYFILE" <<EOF

# ${description}
${domain} {
    import error_static_assets
    reverse_proxy localhost:${port} {
        import fallback_proxy_5xx
    }
    import fallback_connect_errors
}
EOF
    else
      cat >> "$CADDYFILE" <<EOF

${domain} {
    import error_static_assets
    reverse_proxy localhost:${port} {
        import fallback_proxy_5xx
    }
    import fallback_connect_errors
}
EOF
    fi
  else
    if [ -n "$description" ]; then
      cat >> "$CADDYFILE" <<EOF

# ${description}
${domain} {
    reverse_proxy localhost:${port}
}
EOF
    else
      cat >> "$CADDYFILE" <<EOF

${domain} {
    reverse_proxy localhost:${port}
}
EOF
    fi
  fi

  # Validate new config
  local validate_output
  validate_output=$(caddy validate --config "$CADDYFILE" 2>&1)
  local validate_code=$?

  if [ $validate_code -ne 0 ]; then
    # Rollback on validation failure
    cp "${CADDYFILE}.bak" "$CADDYFILE"
    echo "ERROR: Caddy validation failed. Rollback applied."
    echo "$validate_output"
    exit 1
  fi

  # Reload Caddy
  local reload_output
  reload_output=$(caddy reload --config "$CADDYFILE" 2>&1)
  local reload_code=$?

  if [ $reload_code -ne 0 ]; then
    echo "WARNING: Caddy reload failed (config was saved)"
    echo "$reload_output"
    exit 1
  fi

  echo "SUCCESS: Forwarding '${domain} -> :${port}' added and Caddy reloaded"
}

# Parse main argument
if [ $# -eq 0 ]; then
  usage
fi

COMMAND="$1"
shift

case "$COMMAND" in
  --list)
    list_forwardings
    ;;
  --add)
    DOMAIN=""
    PORT=""
    DESCRIPTION=""
    FALLBACK="0"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --domain)      DOMAIN="$2";      shift 2 ;;
        --port)        PORT="$2";        shift 2 ;;
        --description) DESCRIPTION="$2"; shift 2 ;;
        --fallback)    FALLBACK="1";     shift ;;
        *) shift ;;
      esac
    done
    add_forwarding "$DOMAIN" "$PORT" "$DESCRIPTION" "$FALLBACK"
    ;;
  *)
    usage
    ;;
esac
