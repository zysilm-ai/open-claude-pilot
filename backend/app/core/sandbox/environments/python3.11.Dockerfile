FROM python:3.11-slim

# Set working directory
WORKDIR /workspace

# Install common utilities
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Install common Python packages
RUN pip install --no-cache-dir \
    requests \
    numpy \
    pandas \
    matplotlib \
    scikit-learn \
    pytest \
    ipython

# Create workspace structure
RUN mkdir -p /workspace/project_files \
    /workspace/agent_workspace \
    /workspace/out

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV WORKSPACE=/workspace

# Default command
CMD ["/bin/bash"]
