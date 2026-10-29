# Egress proxy for the agent: CONNECT to port 443 of the hosts in /etc/tinyproxy/allowlist only.
FROM alpine:3.22
RUN apk add --no-cache tinyproxy
COPY tinyproxy.conf /etc/tinyproxy/tinyproxy.conf
USER tinyproxy
EXPOSE 8888
CMD ["tinyproxy", "-d", "-c", "/etc/tinyproxy/tinyproxy.conf"]
