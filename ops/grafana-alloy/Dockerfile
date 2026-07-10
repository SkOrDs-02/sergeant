# Grafana Alloy — Sergeant Phase 2 metrics scraper.
# Deployed as a standalone Railway service that scrapes n8n + apps/server
# and ships everything to Grafana Cloud Prometheus.
#
# Build context is `ops/grafana-alloy/`.

# AI-NOTE: To update this digest, run:
#   TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:grafana/alloy:pull" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
#   curl -sI -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.oci.image.index.v1+json" \
#     "https://registry-1.docker.io/v2/grafana/alloy/manifests/v<NEW_VERSION>" | grep docker-content-digest
#   Then update both the version tag and the @sha256:... digest below.
FROM grafana/alloy:v1.17.0@sha256:41c41849989b7e054ccbadc17938ee1e5592fe26bfbc56ef3ffc109c0b0b2739

COPY config.alloy /etc/alloy/config.alloy

EXPOSE 12345

ENTRYPOINT ["/bin/alloy"]
CMD ["run", "--server.http.listen-addr=0.0.0.0:12345", "/etc/alloy/config.alloy"]
