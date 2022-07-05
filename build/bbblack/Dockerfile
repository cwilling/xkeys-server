FROM arm32v7/debian:buster-slim
MAINTAINER Christoph Willing chris.willing@linux.com

RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y \
		build-essential git pkg-config file curl wget python3 \
		libuv1-dev libudev-dev libfuse-dev libusb-1.0-0-dev
RUN curl -kfsSL https://deb.nodesource.com/setup_16.x >setup_16.x
RUN sed -i -e 's/curl -sLf/curl -ksLf/' -e 's/curl -s /curl -ks /' setup_16.x
RUN bash ./setup_16.x && apt-get install -y nodejs && node --version

WORKDIR /

