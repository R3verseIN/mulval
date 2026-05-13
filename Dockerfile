FROM ubuntu:20.04

# Avoid interactive prompts during apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
# We use Ubuntu 20.04 because it still has official support for Python 2
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    make \
    flex \
    bison \
    autoconf \
    graphviz \
    python2 \
    openjdk-11-jdk \
    texlive-font-utils \
    wget \
    tar \
    && rm -rf /var/lib/apt/lists/*

# Map python to python2 to support original scripts as-is
RUN ln -s /usr/bin/python2 /usr/bin/python

# Set up XSB
WORKDIR /opt
COPY XSB-5.0.tar.gz .
RUN tar -xzf XSB-5.0.tar.gz && \
    rm XSB-5.0.tar.gz && \
    cd XSB/build && \
    ./configure && \
    ./makexsb

ENV PATH="${PATH}:/opt/XSB/bin"

# Set up MulVAL
WORKDIR /opt/mulval
COPY . .

# Set environment variables
ENV MULVALROOT=/opt/mulval
ENV PATH="${PATH}:${MULVALROOT}/bin:${MULVALROOT}/utils"

# Patch code and Makefile for legacy compatibility inside the container
# 1. Fix pointer comparison (hard error in most GCC versions)
# 2. Add C++11 and permissive/common flags for legacy C++
# 3. Fix bison header move issue in Makefile
RUN sed -i 's/fa >0/fa != NULL/g' src/attack_graph/attack_graph.cpp && \
    sed -i 's/g++ /g++ -std=c++11 -fpermissive -fcommon /g' src/attack_graph/Makefile && \
    sed -i 's/gcc /gcc -fcommon /g' src/attack_graph/Makefile && \
    sed -i 's/mv graphit.tab.h y.tab.cpp.h/cp graphit.tab.h y.tab.cpp.h/g' src/attack_graph/Makefile && \
    mkdir -p bin/adapter bin/metrics && \
    make

# Prepare entrypoint and output
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir /output
WORKDIR /output

ENTRYPOINT ["entrypoint.sh"]
