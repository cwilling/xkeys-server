FROM arm64v8/debian:bullseye-slim
MAINTAINER Christoph Willing chris.willing@linux.com
LABEL description="Just a Test"

RUN apt-get update && apt-get upgrade -y

WORKDIR /

