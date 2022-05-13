FROM arm64v8/debian:bullseye-slim
MAINTAINER Christoph Willing chris.willing@linux.com

RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y \
		build-essential git pkg-config file \
		nodejs npm libuv1-dev libudev-dev libfuse-dev libusb-1.0-0-dev

WORKDIR /

