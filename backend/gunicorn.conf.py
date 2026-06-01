import os

# Gunicorn Production Configuration
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"

# Workers & Threads optimized for Railway Free/Starter Tier (Memory Safe)
workers = 1
threads = 2
worker_class = "gthread"

# Stable timeout for sync-heavy uploads (e.g. medical image attachments or massive offline queues)
timeout = 120

# Graceful restart handling to prevent active request drops
graceful_timeout = 30
keepalive = 2

# Limit memory leaks by restarting workers after a set number of requests
max_requests = 1000
max_requests_jitter = 50

# Worker temp directory optimization to prevent blocking in docker/Railway containers
# /dev/shm uses shared memory in RAM which is faster and safer in docker
worker_tmp_dir = "/dev/shm"

# Logging configuration
accesslog = "-"
errorlog = "-"
loglevel = "info"
