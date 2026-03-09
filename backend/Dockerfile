FROM node:20-bookworm-slim

WORKDIR /app

# Install Python runtime for recommender.py execution
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

# Install Node dependencies first for better layer caching
COPY package*.json ./
RUN npm install

# Install Python dependencies used by recommender.py
COPY src/recommender/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir -r /tmp/requirements.txt

# Copy backend source
COPY . .

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["npm", "start"]
