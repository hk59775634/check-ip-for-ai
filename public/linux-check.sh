#!/usr/bin/env bash
# AI IP multi-route check - discover egress IPs then run platform test
# Usage: curl https://aicheck.ai101.eu.org/linux-check.sh | bash

AICHECK_URL="${AICHECK_URL:-https://aicheck.ai101.eu.org}"

trace_ip() {
  curl -fsS -m 8 "$1" 2>/dev/null | grep -m1 '^ip=' | cut -d= -f2- || true
}

IPS=$(
  {
    trace_ip 'https://4.ipcheck.ing/cdn-cgi/trace'
    trace_ip 'https://6.ipcheck.ing/cdn-cgi/trace'
    for i in 1 2 3 4 5 6 7 8; do
      trace_ip "https://ptest-${i}.ipcheck.ing/cdn-cgi/trace"
    done
  } | grep -v '^[[:space:]]*$' | sort -u | awk 'BEGIN{f=1} {if(!f)printf ","; printf "%s",$0; f=0}'
)

if [ -z "$IPS" ]; then
  echo "No egress IP found." >&2
  exit 1
fi

curl -fsS -A curl "${AICHECK_URL}/?ips=${IPS}"
