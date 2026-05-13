# --- Stage 1: XSB Builder ---
FROM ubuntu:20.04 AS xsb-builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make wget tar ca-certificates libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
COPY XSB-5.0.tar.gz .
RUN tar -xzf XSB-5.0.tar.gz && \
    cd XSB/build && ./configure && ./makexsb

# --- Stage 2: MulVAL Builder ---
FROM ubuntu:20.04 AS mulval-builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make flex bison openjdk-11-jdk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/mulval
COPY . .

# Set MULVALROOT so legacy Makefiles find the /lib directory
ENV MULVALROOT=/opt/mulval

# Applying non-invasive legacy patches via sed
RUN sed -i 's/fa >0/fa != NULL/g' src/attack_graph/attack_graph.cpp && \
    sed -i 's/g++ /g++ -std=c++11 -fpermissive -fcommon /g' src/attack_graph/Makefile && \
    sed -i 's/gcc /gcc -fcommon /g' src/attack_graph/Makefile && \
    sed -i 's/mv graphit.tab.h y.tab.cpp.h/cp graphit.tab.h y.tab.cpp.h/g' src/attack_graph/Makefile && \
    mkdir -p bin/adapter bin/metrics && \
    make

# --- Stage 3: Frontend Builder ---
FROM oven/bun:latest AS frontend-builder
WORKDIR /app
# Copy only lock and package first for better caching
COPY dashboard/frontend/package.json dashboard/frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY dashboard/frontend .
RUN bun run build

# --- Stage 4: Final Runtime ---
FROM ubuntu:20.04
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    python2 \
    openjdk-11-jre-headless \
    graphviz \
    ghostscript \
    texlive-font-utils \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Map python to python2 for legacy scripts
RUN ln -s /usr/bin/python2 /usr/bin/python

# Install uv for the dashboard backend
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Copy built components
COPY --from=xsb-builder /opt/XSB /opt/XSB
COPY --from=mulval-builder /opt/mulval /opt/mulval
COPY --from=frontend-builder /app/out /opt/mulval/dashboard/frontend/out

# Set Environment Variables
ENV MULVALROOT=/opt/mulval
ENV PATH="${PATH}:/opt/XSB/bin:${MULVALROOT}/bin:${MULVALROOT}/utils"

# Sync backend dependencies
WORKDIR /opt/mulval/dashboard/backend
RUN uv sync

# Setup entrypoint and output
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && \
    mkdir -p /output /opt/mulval/testcases/web
WORKDIR /output

EXPOSE 8080
ENTRYPOINT ["entrypoint.sh"]
