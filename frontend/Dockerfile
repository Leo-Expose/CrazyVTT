# Development Dockerfile
# For production, use Dockerfile.prod (multi-stage, serves via backend static middleware)
FROM node:26-alpine

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci

COPY . .

# The dev server reads source and dependencies; it does not need ownership of
# the whole dependency tree. Keep image builds fast and grant ownership only to
# the directory used for generated output.
RUN mkdir -p /app/dist && chown -R appuser:appgroup /app/dist

USER appuser

EXPOSE 3000

CMD ["npm", "run", "dev"]
