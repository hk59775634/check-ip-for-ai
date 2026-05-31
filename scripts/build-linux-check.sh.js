const fs = require('fs');
const path = require('path');
const { PLATFORMS, serializeRegionRule } = require('../src/platforms');

const GH_PAGES_URL = 'https://hk59775634.github.io/check-ip-for-ai';
const outPath = path.join(__dirname, '..', 'public', 'linux-check.sh');

const platformLines = PLATFORMS.map((p) => {
  const rule = serializeRegionRule(p.regionRule);
  const name = p.name.replace(/\|/g, '/');
  let ruleType = 'always';
  let ruleCodes = '';
  if (rule.type === 'allowlist') {
    ruleType = 'allowlist';
    ruleCodes = rule.codes.join(',');
  } else if (rule.type === 'blocklist') {
    ruleType = 'blocklist';
    ruleCodes = rule.codes.join(',');
  }
  return `${p.id}|${name}|${p.checkUrl}|${ruleType}|${ruleCodes}`;
}).join('\n');

const script = `#!/usr/bin/env bash
# AI IP Connectivity Checker - standalone local curl probe (Linux/macOS)
# Usage: curl -fsSL ${GH_PAGES_URL}/linux-check.sh | bash

set -euo pipefail

readonly UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
readonly PROBE_TIMEOUT=10
readonly IP_TIMEOUT=8

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

# --- ANSI ---
if [ -t 1 ]; then
  C_RESET=$'\\033[0m' C_GREEN=$'\\033[32m' C_RED=$'\\033[31m' C_YELLOW=$'\\033[33m'
  C_CYAN=$'\\033[36m' C_DIM=$'\\033[2m' C_BOLD=$'\\033[1m'
else
  C_RESET='' C_GREEN='' C_RED='' C_YELLOW='' C_CYAN='' C_DIM='' C_BOLD=''
fi

# --- platform list: id|name|checkUrl|ruleType|ruleCodes ---
PLATFORM_DATA="$(cat <<'EOF'
${platformLines}
EOF
)"

declare -a DISCOVERED_IPS=()
declare -A IP_COUNTRY IP_CC IP_ASN IP_ISP IP_ROUTE

trace_ip() {
  curl -fsS -m "$IP_TIMEOUT" -A "$UA" "$1" 2>/dev/null | grep -m1 '^ip=' | cut -d= -f2- || true
}

trace_country() {
  curl -fsS -m "$IP_TIMEOUT" -A "$UA" "$1" 2>/dev/null | grep -m1 '^loc=' | cut -d= -f2- || true
}

add_ip() {
  local ip="$1" cc="$2" route="$3"
  [[ -z "$ip" ]] && return
  if [[ -z "\${IP_COUNTRY[$ip]:-}" ]]; then
    DISCOVERED_IPS+=("$ip")
    IP_CC[$ip]="$(printf '%s' "$cc" | tr '[:lower:]' '[:upper:]')"
    IP_ROUTE[$ip]="$route"
  fi
}

discover_ips() {
  local ip cc
  ip=$(trace_ip 'https://4.ipcheck.ing/cdn-cgi/trace'); cc=$(trace_country 'https://4.ipcheck.ing/cdn-cgi/trace'); add_ip "$ip" "$cc" 'IPv4'
  ip=$(trace_ip 'https://6.ipcheck.ing/cdn-cgi/trace'); cc=$(trace_country 'https://6.ipcheck.ing/cdn-cgi/trace'); add_ip "$ip" "$cc" 'IPv6'
  ip=$(trace_ip 'https://64.ipcheck.ing/cdn-cgi/trace'); cc=$(trace_country 'https://64.ipcheck.ing/cdn-cgi/trace'); add_ip "$ip" "$cc" 'Dual'
  ip=$(trace_ip 'https://1.0.0.1/cdn-cgi/trace'); cc=$(trace_country 'https://1.0.0.1/cdn-cgi/trace'); add_ip "$ip" "$cc" 'CF-v4'
  ip=$(trace_ip 'https://[2606:4700:4700::1111]/cdn-cgi/trace'); cc=$(trace_country 'https://[2606:4700:4700::1111]/cdn-cgi/trace'); add_ip "$ip" "$cc" 'CF-v6'

  local j t
  j=$(curl -fsS -m "$IP_TIMEOUT" -A "$UA" 'https://myip.ipip.net/json' 2>/dev/null || true)
  if [[ -n "$j" ]]; then
    ip=$(printf '%s' "$j" | sed -n 's/.*"ip"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -1)
    cc=$(printf '%s' "$j" | sed -n 's/.*"country_code"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -1)
    add_ip "$ip" "$cc" 'China'
  fi

  j=$(curl -fsS -m "$IP_TIMEOUT" -A "$UA" 'https://ipinfo.io/json' 2>/dev/null || true)
  if [[ -n "$j" ]]; then
    ip=$(printf '%s' "$j" | sed -n 's/.*"ip"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -1)
    cc=$(printf '%s' "$j" | sed -n 's/.*"country"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -1)
    add_ip "$ip" "$cc" 'Global'
  fi

  local i
  for i in 1 2 3 4 5 6 7 8; do
    t=$(curl -fsS -m "$IP_TIMEOUT" -A "$UA" "https://ptest-\${i}.ipcheck.ing/cdn-cgi/trace" 2>/dev/null || true)
    if [[ -n "$t" ]]; then
      ip=$(printf '%s' "$t" | grep -m1 '^ip=' | cut -d= -f2-)
      cc=$(printf '%s' "$t" | grep -m1 '^loc=' | cut -d= -f2-)
      add_ip "$ip" "$cc" "Proxy-\${i}"
    fi
  done
}

json_field() {
  printf '%s' "$1" | sed -n "s/.*\\"\$2\\"[[:space:]]*:[[:space:]]*\\"\\([^\\"]*\\)\\".*/\\1/p" | head -1
}

enrich_ip() {
  local ip="$1"
  local j country cc asn isp as_raw
  j=$(curl -fsS -m "$IP_TIMEOUT" -A "$UA" "https://ip-api.com/json/\${ip}?fields=status,country,countryCode,isp,as,query" 2>/dev/null || true)
  if [[ -n "$j" ]] && [[ "$(json_field "$j" status)" == "success" ]]; then
    country=$(json_field "$j" country)
    cc=$(json_field "$j" countryCode)
    isp=$(json_field "$j" isp)
    as_raw=$(json_field "$j" as)
    asn=$(printf '%s' "$as_raw" | sed -n 's/^AS\\([0-9]*\\).*/AS\\1/p')
    IP_COUNTRY[$ip]="$country"
    IP_CC[$ip]="$(printf '%s' "$cc" | tr '[:lower:]' '[:upper:]')"
    IP_ISP[$ip]="$isp"
    IP_ASN[$ip]="$asn"
    return
  fi
  IP_COUNTRY[$ip]="Unknown"
  IP_ISP[$ip]="Unknown"
  IP_ASN[$ip]=""
  [[ -z "\${IP_CC[$ip]:-}" ]] && IP_CC[$ip]="XX"
}

region_ok() {
  local rule_type="$1" rule_codes="$2" cc="$3"
  cc="$(printf '%s' "$cc" | tr '[:lower:]' '[:upper:]')"
  case "$rule_type" in
    always) return 0 ;;
    allowlist)
      IFS=',' read -r -a codes <<< "$rule_codes"
      for c in "\${codes[@]}"; do
        [[ "$c" == "$cc" ]] && return 0
      done
      return 1
      ;;
    blocklist)
      IFS=',' read -r -a codes <<< "$rule_codes"
      for c in "\${codes[@]}"; do
        [[ "$c" == "$cc" ]] && return 1
      done
      return 0
      ;;
  esac
  return 0
}

probe_url() {
  local url="$1" code
  code=$(curl -sS -m "$PROBE_TIMEOUT" -o /dev/null -w '%{http_code}' -A "$UA" -L "$url" 2>/dev/null || echo "000")
  case "$code" in
    451) echo blocked ;;
    200|301|302|307|308|401|405|403|429) echo ok ;;
    *) echo unknown ;;
  esac
}

evaluate_platform() {
  local rule_type="$1" rule_codes="$2" probe="$3"
  local ip cc supported=() r
  local -a reasons=()

  for ip in "\${DISCOVERED_IPS[@]}"; do
    cc="\${IP_CC[$ip]:-XX}"
    if ! region_ok "$rule_type" "$rule_codes" "$cc"; then
      reasons+=("region")
      continue
    fi
    case "$probe" in
      ok) supported+=("$ip") ;;
      blocked) reasons+=("network") ;;
      *) reasons+=("unknown") ;;
    esac
  done

  if (( \${#supported[@]} > 0 )); then
    local joined="" s
    for s in "\${supported[@]}"; do
      [[ -n "$joined" ]] && joined+=", "
      joined+="$s"
    done
    printf '%s|%s' ok "$joined"
    return
  fi

  local all_unknown=1
  for r in "\${reasons[@]}"; do
    [[ "$r" != "unknown" ]] && all_unknown=0
  done
  if (( all_unknown )); then
    printf 'unknown|unknown'
    return
  fi

  for r in "\${reasons[@]}"; do
    [[ "$r" == "network" ]] && { printf 'blocked|network'; return; }
  done
  for r in "\${reasons[@]}"; do
    [[ "$r" == "region" ]] && { printf 'blocked|region'; return; }
  done
  printf 'unknown|unknown'
}

print_ip_section() {
  local ip tag meta
  echo
  echo -e "\${C_BOLD}Your IP\${DISCOVERED_IPS[@]:+s}:\${C_RESET}"
  for ip in "\${DISCOVERED_IPS[@]}"; do
    tag="\${IP_ROUTE[$ip]:-IP}"
    meta="\${IP_ASN[$ip]:-}"
    [[ -n "\${IP_ISP[$ip]:-}" ]] && meta="\${meta:+$meta · }\${IP_ISP[$ip]}"
    meta="\${meta:-N/A}"
    echo -e "  \${C_CYAN}\${ip}\${C_RESET}  \${C_DIM}\${tag} \${meta} | \${IP_COUNTRY[$ip]:-Unknown} (\${IP_CC[$ip]:-XX})\${C_RESET}"
  done
  if (("\${#DISCOVERED_IPS[@]}" > 1)); then
    echo -e "\${C_DIM}Split tunnel: \${#DISCOVERED_IPS[@]} unique egress IP(s) detected\${C_RESET}"
  fi
  echo
}

print_status() {
  local status="$1" ips="$2"
  case "$status" in
    ok)
      if [[ -n "$ips" ]]; then
        echo -e "\${C_GREEN}Supported\${C_RESET} (\${ips})"
      else
        echo -e "\${C_GREEN}Supported\${C_RESET}"
      fi
      ;;
    blocked) echo -e "\${C_RED}Blocked\${C_RESET}" ;;
    *) echo -e "\${C_YELLOW}Unknown\${C_RESET}" ;;
  esac
}

# --- main ---
echo -e "\${C_BOLD}\${C_CYAN}AI IP Connectivity Checker\${C_RESET}"
echo -e "\${C_DIM}Local curl probe · no backend required\${C_RESET}"
echo '----------------------------------------'

discover_ips
if (("\${#DISCOVERED_IPS[@]}" == 0)); then
  echo "No egress IP found." >&2
  exit 1
fi

for ip in "\${DISCOVERED_IPS[@]}"; do
  enrich_ip "$ip"
done

print_ip_section

idx=0
while IFS='|' read -r pid pname purl rule_type rule_codes; do
  [[ -z "$pid" ]] && continue
  idx=$((idx + 1))
  probe=$(probe_url "$purl")
  result=$(evaluate_platform "$rule_type" "$rule_codes" "$probe")
  status="\${result%%|*}"
  extra="\${result#*|}"
  num=$(printf '%02d' "$idx")
  icon='??'
  case "$status" in
    ok) icon="OK" ;;
    blocked) icon="XX" ;;
  esac
  case "$status" in
    ok) icolor="$C_GREEN" ;;
    blocked) icolor="$C_RED" ;;
    *) icolor="$C_YELLOW" ;;
  esac
  printf '%s [' "$num"
  echo -en "\${icolor}\${icon}\${C_RESET}"
  printf '] %-16s ' "$pname"
  print_status "$status" "$extra"
done <<< "$PLATFORM_DATA"

echo
echo -e "\${C_DIM}Done. Checked \${idx} platforms across \${#DISCOVERED_IPS[@]} IP(s).\${C_RESET}"
`;

fs.writeFileSync(outPath, script.replace(/\r\n/g, '\n'), 'utf8');
console.log(`Generated ${outPath} (${PLATFORMS.length} platforms)`);
