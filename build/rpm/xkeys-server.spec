Name:           xkeys-server
Version:        0.9.1
Release:        1
Summary:        Server for Xkeys devices

License:        MIT
URL:            https://gitlab.com/chris.willing/xkeys-server
Source0:        %{name}-%{version}.tar.gz

Requires:       nodejs,fuse-libs,mosquitto

# Don't allow compression of the AppImage file
%define __compress /bin/true
%define __strip /bin/true

%description
xkeys-server for Xkeys devices

%prep
%autosetup

%install
rm -rf $RPM_BUILD_ROOT
mkdir -p $RPM_BUILD_ROOT/%{_sysconfdir}/systemd/system
mkdir -p $RPM_BUILD_ROOT/lib/udev/rules.d
mkdir -p $RPM_BUILD_ROOT/opt/xkeys-server
cp -p xkeys-server.service $RPM_BUILD_ROOT/etc/systemd/system/
cp -p 50-xkeys.rules $RPM_BUILD_ROOT/lib/udev/rules.d/
cp -p xkeys-server-%{_arch}.AppImage $RPM_BUILD_ROOT/opt/xkeys-server/


%files
/%{_sysconfdir}/systemd/system/xkeys-server.service
/lib/udev/rules.d/50-xkeys.rules
/opt/xkeys-server/xkeys-server-%{_arch}.AppImage

%post
if [ $1 == 1 ]; then
# Set device permissions
#
udevadm control --reload-rules
udevadm trigger

# Start running mosquitto as a service
#
systemctl start mosquitto
systemctl enable mosquitto
systemctl daemon-reload

# Start running xkeys-server as a service
#
chmod a+x /opt/xkeys-server/xkeys-server-%{_arch}.AppImage
systemctl start xkeys-server
systemctl enable xkeys-server
systemctl daemon-reload

fi

%preun
if [ $1 == 0 ]; then
systemctl stop xkeys-server
systemctl disable xkeys-server
systemctl daemon-reload
fi

%postun
if [ $1 == 0 ]; then
udevadm control --reload-rules
udevadm trigger
fi

%changelog
* Sun Mar 20 2022 Christoph Willing
- 
