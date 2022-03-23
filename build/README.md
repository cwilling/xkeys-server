# Packaging the xkeys-server

### Step 1 - create an AppImage

Creating an AppImage enables all the xkeys-server scripts
(including node_modules) to be collected into a single executable
capable of running from any location in the file system.

The AppImages are created using the AppImage scripts provided:
`armhf.AppImage`, `x86_64.AppImage`, etc.

Since the resulting AppImage may differ depending on the platform it was
created on, it's probably best to run the script from the deb or the rpm
directory immediately prior to generating the installable .deb or .rpm
package. e.g. running the `x86_64.AppImage` script from the deb directory:
```
../x86_64.AppImage
```
will produce an _xkeys-server-x86\_64.AppImage_ executable in this directory,
where the make-* scripts of Step 2 will expect to find it.

### Step 2 - create an installable .deb, .rpm, etc. package.

Each deb, rpm, etc. directory contains a respective _make-deb_, _make-rpm_,
_make-whatever_ script to generate the installable package for that platform.
These scripts use platform tools which are expected to already be installed.

To install these packages, run the commands
```
	sudo dnf groupinstall 'Development Tools'
	sudo dnf install -y rpmdevtools rpmlint
```

For Centos, the EPEL repository will also need to be enabled for the download of,
in particular, nodejs:
```
	sudo dnf install epel-release
	sudo dnf install nodejs libuv libudev-devel
```
In all cases, we need to download the appropriate _appimagetool_, make it executable and move it to somewhere in out PATH. For the x86_64 version:
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
If the _xkeys-server_ appears to be running but is not discoverable by clients on other machines in the local network, it may be due to a firewall. Centos machines are provisioned with an active firewall whose default rule rejects all incoming traffic (including _xkets-server_ discovery messages). The quick fix (consider carefully whether appropriate in your circumstances) is to open the _xkeys-server_ port to UDP traffic:
```
	sudo firewall-cmd --zone=public --add-port=48895/udp
	sudo firewall-cmd --runtime-to-permanent
```




## Usage

Some systems may run a firewall rejecting most traffic.
Centos systems running a default _firewalld_ configuration
can be cajoled into accepting xkeys-server traffic with the commands:
```
	sudo firewall-cmd --zone=public --add-port=48895/udp
	sudo firewall-cmd --runtime-to-permanent
```
