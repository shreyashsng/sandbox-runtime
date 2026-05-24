FROM python:3.12-slim
RUN groupadd -r sandbox && useradd -r -g sandbox sandbox
RUN pip install --no-cache-dir pip --upgrade
WORKDIR /sandbox
USER sandbox
