FROM node:26-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.21.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG GIT_BRANCH=""
ARG GIT_COMMIT=""
RUN if [ -n "${GIT_BRANCH}" ] && [ -n "${GIT_COMMIT}" ]; then \
    mkdir -p "$(dirname ".git/refs/heads/${GIT_BRANCH}")" .git/objects/info .git/objects/pack \
    && printf "[core]\nrepositoryformatversion = 0\nfilemode = false\nbare = false\nlogallrefupdates = true\n" > .git/config \
    && printf "ref: refs/heads/%s" "${GIT_BRANCH}" > .git/HEAD \
    && printf "%s" "${GIT_COMMIT}" > ".git/refs/heads/${GIT_BRANCH}"; \
  fi \
  && pnpm build:production

FROM nginx:1.29-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
