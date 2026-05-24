FROM alpine:3.21

ARG PB_VERSION=0.37.3

RUN apk add --no-cache \
    unzip \
    ca-certificates

# Download and install PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && \
    chmod +x /pb/pocketbase && \
    rm /tmp/pb.zip

# Expose port
EXPOSE 8090

# Data persistence
VOLUME /pb/pb_data

# Start PocketBase with explicit hooks directory and dev mode
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--hooksDir=/pb/pb_hooks", "--dev"]
