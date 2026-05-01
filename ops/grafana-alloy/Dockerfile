# Grafana Alloy — Sergeant Phase 2 metrics scraper.
# Deployed as a standalone Railway service that scrapes n8n + apps/server
# and ships everything to Grafana Cloud Prometheus.
#
# Build context is `ops/grafana-alloy/`.

FROM grafana/alloy:v1.4.2

COPY config.alloy /etc/alloy/config.alloy

EXPOSE 12345

ENTRYPOINT ["/bin/alloy"]
CMD ["run", "--server.http.listen-addr=0.0.0.0:12345", "/etc/alloy/config.alloy"]
