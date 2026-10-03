FROM openpolicyagent/opa:1.4.2-static
COPY docs/production-reference/authorization.rego /policies/authorization.rego
EXPOSE 8181
ENTRYPOINT ["/opa"]
CMD ["run", "--server", "--addr=0.0.0.0:8181", "/policies"]
