FROM python:3.12-slim
RUN groupadd -g 2000 sandbox && useradd -u 2000 -r -g sandbox sandbox
RUN pip install --no-cache-dir pip --upgrade
WORKDIR /sandbox
USER sandbox
