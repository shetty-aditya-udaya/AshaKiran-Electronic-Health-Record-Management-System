# Stage 1: Base Image
FROM python:3.11-slim as base

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies if required (keep cache clean)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Add any essential system utilities if needed \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Create a secure non-root user and group
RUN groupadd -g 10001 flaskgroup && \
    useradd -u 10001 -g flaskgroup -s /bin/bash -m flaskuser

# Safely create all production write paths and grant permissions to flaskuser
RUN mkdir -p /app/instance /app/logs /app/uploads /app/uploads/profile_pics /app/uploads/documents /app/temp /app/reports /app/exports && \
    chown -R flaskuser:flaskgroup /app

# Switch to the secure non-root user
USER flaskuser

# Expose Gunicorn port
EXPOSE 5000

# Healthcheck leveraging Python's built-in urllib (keeps image slim and secure)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"

# Run Flask backend via Gunicorn
CMD ["gunicorn", "-c", "gunicorn.conf.py", "run:app"]
