import multiprocessing
import os

# Gunicorn Production Configuration
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"

# Workers & Threads Optimization
# Formula: (2 * CPUs) + 1 for workers.
# Since Railway may run on varying CPU allocations, we default to 4 workers or let multiprocessing decide.
workers = int(os.getenv("WEB_CONCURRENCY", multiprocessing.cpu_count() * 2 + 1))
threads = int(os.getenv("PYTHON_THREADS", "4"))

# Stable timeout for sync-heavy uploads (e.g. medical image attachments or massive offline queues)
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))

# Graceful restart handling to prevent active request drops
graceful_timeout = 30
keepalive = 2

# Logging configuration
accesslog = "-"
errorlog = "-"
loglevel = "info"
