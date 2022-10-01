FROM rockylinux:8.5
MAINTAINER Christoph Willing chris.willing@linux.com

RUN dnf install https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm -y
RUN dnf config-manager --enable epel
RUN dnf config-manager --set-enabled powertools
RUN yum makecache && yum upgrade -y && yum groupinstall "Development Tools" -y
RUN yum install -y \
	pkg-config file curl wget git python3 \
	systemd-devel libuv fuse-devel libusbx-devel \
	avahi-compat-libdns_sd-devel
RUN curl -fsSL https://rpm.nodesource.com/setup_16.x | bash -
RUN yum install -y nodejs
RUN node --version

WORKDIR /

