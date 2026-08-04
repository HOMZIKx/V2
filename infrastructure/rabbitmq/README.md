# RabbitMQ local development

`rabbitmq.conf` makes quorum queues the default type for queues declared
without an explicit type. It does not declare business exchanges, queues,
bindings, retry policies, dead-letter queues, or streams.

When the Compose stack is running, the management UI is available only on the
local machine at <http://localhost:15672>. Use the development-only credentials
configured in `infrastructure/docker/docker-compose.yml`.
