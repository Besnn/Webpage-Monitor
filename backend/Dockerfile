# ---------------------------------------------------------------------------
# Backend — Django + Gunicorn + Playwright (Chromium)
# ---------------------------------------------------------------------------
FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2, Playwright Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc curl \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright's Chromium browser
RUN playwright install chromium

# Copy source (the .dockerignore excludes .env)
COPY . .
RUN rm -f .env

EXPOSE 8000

CMD ["gunicorn", "WebpageMonitorBackend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120"]
