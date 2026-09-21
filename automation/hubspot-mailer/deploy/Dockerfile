# =============================================================================
#  Container
#
#      docker build -t hubspot-mailer -f deploy/Dockerfile .
#      docker run -d --name hubspot-mailer \
#        --env-file /etc/hubspot-mailer/hubspot-mailer.env \
#        -v hubspot-mailer-data:/var/lib/hubspot-mailer \
#        -p 127.0.0.1:8080:8080 \
#        --restart unless-stopped \
#        hubspot-mailer
#
#  Der Datenträger ist nicht optional. Ohne ihn faengt das Ledger bei jedem
#  Neustart des Containers bei null an — und damit koennte eine Mail, die
#  schon raus ist, ein zweites Mal verschickt werden.
# =============================================================================

FROM node:22-alpine

# Keine Abhaengigkeiten, also auch kein npm install.
WORKDIR /opt/hubspot-mailer

RUN addgroup -S mailer && adduser -S -G mailer mailer \
    && mkdir -p /var/lib/hubspot-mailer \
    && chown -R mailer:mailer /var/lib/hubspot-mailer

COPY --chown=mailer:mailer package.json server.js ./
COPY --chown=mailer:mailer src/ ./src/
COPY --chown=mailer:mailer scripts/ ./scripts/
COPY --chown=mailer:mailer templates/ ./templates/
COPY --chown=mailer:mailer sequences/ ./sequences/

USER mailer

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    STORE_FILE=/var/lib/hubspot-mailer/ledger.jsonl

VOLUME ["/var/lib/hubspot-mailer"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Damit SIGTERM beim Node-Prozess ankommt und angenommene Arbeit noch
# fertig wird, statt mitten im Versand abgeschnitten zu werden.
STOPSIGNAL SIGTERM

CMD ["node", "server.js"]
