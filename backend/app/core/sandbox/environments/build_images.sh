#!/bin/bash

# Build all environment images

echo "Building Python 3.11 environment..."
docker build -t opencodex-env-python3.11:latest -f python3.11.Dockerfile .

echo "Building Python 3.12 environment..."
docker build -t opencodex-env-python3.12:latest -f python3.12.Dockerfile .

echo "Building Node.js 20 environment..."
docker build -t opencodex-env-node20:latest -f node20.Dockerfile .

echo "All environment images built successfully!"
docker images | grep opencodex-env
