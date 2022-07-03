FROM rockylinux:8.5
MAINTAINER Christoph Willing chris.willing@linux.com

RUN yum makecache && yum upgrade -y && yum groupinstall "Development Tools" -y
RUN yum install -y \
	pkg-config file curl wget git python3 \
	systemd-devel libuv fuse-devel libusbx-devel
RUN curl -fsSL https://rpm.nodesource.com/setup_16.x | bash -
RUN apt install nodejs
RUN node --version

WORKDIR /

