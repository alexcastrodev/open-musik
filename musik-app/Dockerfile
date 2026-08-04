# syntax=docker/dockerfile:1

ARG RUBY_VERSION=3.4.6
ARG NODE_VERSION=22

FROM docker.io/library/ruby:$RUBY_VERSION-slim

WORKDIR /rails

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      build-essential \
      curl \
      ffmpeg \
      git \
      libpq-dev \
      libvips \
      libyaml-dev \
      pkg-config \
      python3 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Deno: yt-dlp's default JS runtime for YouTube extraction (required since the
# 2025 deprecation of JS-runtime-less extraction). Single static binary.
RUN curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-$(uname -m)-unknown-linux-gnu.zip -o /tmp/deno.zip && \
    apt-get update -qq && apt-get install --no-install-recommends -y unzip && \
    unzip /tmp/deno.zip -d /usr/local/bin && \
    chmod a+rx /usr/local/bin/deno && \
    rm /tmp/deno.zip && \
    apt-get purge -y unzip && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install --no-install-recommends -y nodejs && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

ENV RAILS_ENV="development" \
    BUNDLE_PATH="/usr/local/bundle"

COPY Gemfile Gemfile.lock ./
RUN bundle install

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN bundle exec bootsnap precompile -j 1 --gemfile app/ lib/

EXPOSE 3000

CMD ["./bin/rails", "server", "-b", "0.0.0.0"]
