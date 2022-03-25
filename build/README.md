# Packaging the xkeys-server

### Step 1 - create an AppImage

Creating an AppImage enables all the xkeys-server scripts
(including node_modules) to be collected into a single executable
capable of running from any location in the file system.

The AppImages are created using the stand alone AppImage scripts provided:
`armhf.AppImage`, `x86_64.AppImage`, etc. however it not generally
necessary to run them by themselves. Rather, they are invoked by scripts
in the next level of directories - _deb_, _rpm_, etc.


### Step 2 - create an installable .deb, .rpm, etc. package.

Each deb, rpm, etc. directory contains a respective _make-deb_, _make-rpm_,
_make-whatever_ script to generate the installable package for that platform.
These scripts use platform tools which are expected to already be installed.

#### RPM
To install the prerequisite packages for RPM base distros, run the commands
```
	sudo dnf groupinstall 'Development Tools'
	sudo dnf install -y rpmdevtools rpmlint
```

Enable third party repositories for the distribution being used e.g. Centos, will require the EPEL repository to be enabled for the download of, in particular, nodejs:
```
	sudo dnf install epel-release
```

Now install additional software required to build the package:
```
	sudo dnf install nodejs libuv libudev-devel
```
In all cases, we need to download the appropriate _appimagetool_, make it executable and move it to somewhere in our PATH. For the x86_64 version:
```
	wget https://github.com/AppImage/AppImageKit/releases/download/13/appimagetool-x86_64.AppImage
	chmod a+x appimagetool-x86_64.AppImage
	sudo mv appimagetool-x86_64.AppImage /usr/bin/
```
Clone the xkeys-server repository and cd to the _build/rpm_ directory of the _packaging_ branch and run the _make-rpm_ script:
```
	git clone https://gitlab.com/chris.willing/xkeys-server
	cd xkeys-server
	git checkout packaging
	cd build/rpm
	./make-rpm 0.9.1 x86_64
```
Note that the final _./make-rpm_ script requires the _xkeys-server_ version and architecture supplied as arguments.

All going well, the location of the resulting .rpm package will be reported. Most probably it will be `~/rpmbuild/RPMS/x86_64/xkeys-server-0.9.1-1.x86_64.rpm` from where it may be installed and tested or uploaded to a web server for distribution. Test locally with:
```
	sudo dnf install ~/rpmbuild/RPMS/x86_64/xkeys-server-0.9.1-1.x86_64.rpm
```
Check that _xkeys-server_ is running with `systemctl status xkeys-server`.
If the _xkeys-server_ appears to be running but is not discoverable by clients on other machines in the local network, it may be due to a firewall. See the **Usage** section below for a possible fix.

#### DEB
Install prerequisite development packages with:
```
	sudo apt install build-essential git
```
No third party repos are required provided _apt_ is  configured for both _main_ and _contrib_ branches. Install other packages required for packaging _xkeys-server_:
```
	sudo apt install nodejs npm libuv1-dev libudev-dev
```
In all cases, we need to download the appropriate appimagetool, make it executable and move it to somewhere in out PATH. For the x86_64 version:
```
	wget https://github.com/AppImage/AppImageKit/releases/download/13/appimagetool-x86_64.AppImage
	chmod a+x appimagetool-x86_64.AppImage
	sudo mv appimagetool-x86_64.AppImage /usr/bin/
```
Clone the xkeys-server repository and cd to the _build/deb_ directory of the _packaging_ branch and run the _make-deb_ script:
```
	git clone https://gitlab.com/chris.willing/xkeys-server
	cd xkeys-server
	git checkout packaging
	cd build/deb
	./make-deb 0.9.1 x86_64
```
Note that the final _./make-deb_ script requires the _xkeys-server_ version and architecture supplied as arguments.

All going well, the location of the resulting .deb package will be reported. Most probably it will be where ever the _make-deb_ script was run, from where it may be installed and tested or uploaded to a web server for distribution. Test locally with:
```
	sudo apt install ./xkeys-server-0.9.1-1.x86_64.rpm
```
Check that _xkeys-server_ is running with `systemctl status xkeys-server`.


## Usage

Some systems may run a firewall rejecting most traffic.
Centos and other systems running a default _firewalld_ configuration
can be cajoled into accepting xkeys-server traffic with the commands:
```
	sudo firewall-cmd --zone=public --add-port=48895/udp
	sudo firewall-cmd --runtime-to-permanent
```
