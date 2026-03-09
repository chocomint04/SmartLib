FROM node:20-bookworm-slim

WORKDIR /app

# Install Python runtime for recommender.py execution
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
  && rm -rf /var/lib/apt/lists/*

# Use a virtualenv to avoid Debian/PEP668 "externally-managed-environment" errors.
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

# Install Node dependencies first for better layer caching
COPY package*.json ./
RUN npm install

# Install Python dependencies used by recommender.py
COPY src/recommender/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy backend source
COPY . .

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["npm", "start"]
