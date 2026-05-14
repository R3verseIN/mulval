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
ENV MULVALROOT=/opt/mulval
RUN sed -i 's/fa >0/fa != NULL/g' src/attack_graph/attack_graph.cpp && \
    sed -i 's/g++ /g++ -std=c++11 -fpermissive -fcommon /g' src/attack_graph/Makefile && \
    sed -i 's/gcc /gcc -fcommon /g' src/attack_graph/Makefile && \
    sed -i 's/mv graphit.tab.h y.tab.cpp.h/cp graphit.tab.h y.tab.cpp.h/g' src/attack_graph/Makefile && \
    mkdir -p bin/adapter bin/metrics && \
    make

# --- Stage 3: Frontend Builder ---
FROM oven/bun:latest AS frontend-builder
WORKDIR /app
COPY dashboard/frontend/package.json dashboard/frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY dashboard/frontend .
RUN bun run build

# --- Stage 4: Final Runtime ---
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies (Ubuntu 22.04 has Python 3.10 by default)
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    && add-apt-repository universe \
    && apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python2 \
    openjdk-11-jre-headless \
    graphviz \
    ghostscript \
    texlive-font-utils \
    curl ca-certificates \
    gcc g++ make \
    && rm -rf /var/lib/apt/lists/*

# Map python to python2 for legacy scripts
RUN ln -s /usr/bin/python2 /usr/bin/python

# Install backend dependencies directly into system python
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY dashboard/backend/pyproject.toml dashboard/backend/uv.lock ./
RUN uv pip install --system --no-cache -r pyproject.toml

# Environment Setup
WORKDIR /opt/mulval
ENV MULVALROOT=/opt/mulval
ENV PATH="${PATH}:/opt/mulval/bin:/opt/mulval/utils:/opt/XSB/bin"

# 1. Copy XSB
COPY --from=xsb-builder /opt/XSB /opt/XSB

# 2. Copy MulVAL Essentials
COPY --from=mulval-builder /opt/mulval/bin ./bin
COPY --from=mulval-builder /opt/mulval/lib ./lib
COPY --from=mulval-builder /opt/mulval/kb ./kb
COPY --from=mulval-builder /opt/mulval/utils ./utils
COPY --from=mulval-builder /opt/mulval/testcases ./testcases
COPY --from=mulval-builder /opt/mulval/src/analyzer ./src/analyzer

# 3. Copy Backend & Frontend
COPY dashboard/backend ./dashboard/backend
COPY --from=frontend-builder /app/out ./dashboard/frontend/out

# Final Setup
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /output
WORKDIR /output

EXPOSE 8080
ENTRYPOINT ["entrypoint.sh"]
