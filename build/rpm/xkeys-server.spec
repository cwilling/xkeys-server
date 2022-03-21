Name:           xkeys-server
Version:        0.9.1
Release:        1
Summary:        Server for Xkeys devices

License:        MIT
URL:            https://gitlab.com/chris.willing/xkeys-server
Source0:        %{name}-%{version}.tar.gz

Requires:       nodejs,fuse-libs,mosquitto

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

# Start running as a service
#
chmod a+x /opt/xkeys-server/xkeys-server-%{_arch}.AppImage
systemctl daemon-reload
systemctl enable xkeys-server
systemctl start xkeys-server

fi

%changelog
* Sun Mar 20 2022 Christoph Willing
- 
