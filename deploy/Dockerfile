# One image for the keeper and the chat relay, the alternative to the systemd
# units (deploy/compose.yaml runs it). No build step: Node strips the
# TypeScript types at run time. Build from the repository root:
#   docker build -f deploy/Dockerfile -t ladle-ops .
FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /srv/ladle
RUN corepack enable

# every workspace manifest, so the frozen lockfile matches; only the keeper,
# the relay and the SDK they import are installed
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY sdk/package.json sdk/
COPY keeper/package.json keeper/
COPY chat/package.json chat/
COPY app/package.json app/
COPY sim/package.json sim/
COPY indexer/package.json indexer/
COPY tests/package.json tests/
RUN pnpm install --frozen-lockfile --prod --filter "@pulled/keeper..." --filter "@ladle/chat..."

COPY sdk/src sdk/src
COPY keeper/src keeper/src
COPY chat/src chat/src

# the host's ladle user (it can read /etc/ladle/keeper.json); see compose.yaml
USER node
CMD ["node", "--experimental-strip-types", "--no-warnings", "keeper/src/index.ts"]
