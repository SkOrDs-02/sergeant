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
FROM grafana/alloy:v1.18.1@sha256:0f4434c92b3e6cdac38bb129b344e1790c246f7b6e2eaffcc16a5fa363240e33

COPY config.alloy /etc/alloy/config.alloy

EXPOSE 12345

ENTRYPOINT ["/bin/alloy"]
CMD ["run", "--server.http.listen-addr=0.0.0.0:12345", "/etc/alloy/config.alloy"]
