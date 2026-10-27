FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DB_FILE=/app/data/app.db

WORKDIR /app/src/api-py

COPY src/api-py/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt

COPY src/api-py/ ./
COPY src/database/migrations/ /app/src/database/migrations/
COPY src/database/seed/ /app/src/database/seed/

RUN mkdir -p /app/data \
    && adduser --system --group --uid 10001 --home /app appuser \
    && chown -R appuser:appuser /app

USER 10001

EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
