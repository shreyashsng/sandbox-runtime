FROM node:20-alpine
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox
WORKDIR /sandbox
USER sandbox
