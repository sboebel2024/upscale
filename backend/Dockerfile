# backend/Dockerfile

# Use an official Node.js runtime as a base image
FROM node:18

RUN apt-get update && \
    apt-get install -y wget build-essential libssl-dev zlib1g-dev \
    libbz2-dev libreadline-dev libsqlite3-dev curl libncursesw5-dev \
    xz-utils tk-dev libxml2-dev libxmlsec1-dev libffi-dev liblzma-dev \
    python3-venv python3-distutils && \
    wget https://www.python.org/ftp/python/3.12.1/Python-3.12.1.tgz && \
    tar xvf Python-3.12.1.tgz && \
    cd Python-3.12.1 && \
    ./configure --enable-optimizations && \
    make -j$(nproc) && \
    make altinstall && \
    ln -s /usr/local/bin/python3.12 /usr/bin/python3.12 && \
    python3.12 --version


RUN apt-get update && \
    apt-get install -y \
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    libxrender1 \
    libsm6 \
    libxext6 \
    libx11-6

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

RUN npm install -g ts-node typescript

# Copy the rest of the application
COPY . .

RUN python3.12 -m venv /app/cadEnv
ENV PATH="/app/cadEnv/bin:$PATH"

COPY requirements.txt .
RUN /app/cadEnv/bin/pip install --upgrade pip && /app/cadEnv/bin/pip install -r requirements.txt

# Expose the backend port (adjust if necessary)
EXPOSE 3000

# Command to run the backend server
CMD ["npx", "ts-node", "src/server.ts"]
