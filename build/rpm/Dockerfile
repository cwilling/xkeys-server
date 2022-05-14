FROM rockylinux:8.5
MAINTAINER Christoph Willing chris.willing@linux.com

RUN yum makecache && yum upgrade -y && yum groupinstall "Development Tools" -y
RUN yum install -y \
	pkg-config file wget git python3 \
	nodejs systemd-devel libuv fuse-devel libusbx-devel

WORKDIR /

