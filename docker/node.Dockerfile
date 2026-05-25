FROM node:20-alpine
RUN addgroup -g 2000 -S sandbox && adduser -u 2000 -S sandbox -G sandbox
WORKDIR /sandbox
USER sandbox
