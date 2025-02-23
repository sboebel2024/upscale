# Stage 1: Build the SvelteKit app
FROM node:18 AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available) and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the project files
COPY . .

ARG BACKEND_URL
ENV BACKEND_URL=${BACKEND_URL}

RUN npm run build

# NEW: List the contents of /app after the build for debugging
RUN ls -al /app && ls -al /app/build && ls -al /app/.svelte-kit

# Stage 2: Serve the app with Nginx
FROM nginx:alpine

# Remove default Nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy built SvelteKit output from builder
COPY --from=builder /app/build /usr/share/nginx/html

# Expose port 80 for HTTP traffic
EXPOSE 80

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"]
