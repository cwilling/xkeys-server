## Installing _xkeys-server_ on the BeagleBone Black using the dedicated installer

[BeagleBone Black](https://beagleboard.org/black) is a low-cost, community-supported development platform for developers and hobbyists. Using the dedicated installer is the recommended way to install _xkeys-server_ on the BeagleBone Black. It is tested with boards booted from the official Debian boot image and the unofficial Ubuntu boot image. The steps suggested here assume that command line access via ssh is available to the board and will be used to execute the various commands.

When installing on a new board or a newly reimaged board, it's important that the system software and ca-certificates are up to date:
```
    sudo apt update
    sudo apt upgrade -y
    update-ca-certificates --fresh
```
This may take some time - depending on how much needs to be updated.

Now download and install _xkeys-server_. Version 0.9.11 is used in this example but use the latest available version from the [_xkeys-server_ releases](https://gitlab.com/chris.willing/xkeys-server/-/releases) list:
```
    wget --content-disposition https://gitlab.com/chris.willing/xkeys-server/-/package_files/44833002/download
    sudo apt install ./xkeys-server-bbb-0.9.11_armhf.deb
```

Check that the installation process has started the _xkeys-server_ by using the _ps_ command; the result should look something like:
```
    debian@beaglebone:~$ ps -ef|grep xkeys
    root       607     1 10 10:36 ?        00:00:35 /usr/bin/xkeys-server
    debian    1269  1090  0 10:42 pts/0    00:00:00 grep xkeys
    debian@beaglebone:~$
```

The disk space consumed by _xkeys-server_, along with any additional dependencies, is around 100MB. On a fresh systems without additional software installed, the disk space used increases from 2.1GB to 2.2GB, out of the available 3.5GB on the eMMC device.




## Installing _xkeys-server_ on the BeagleBone Black from the development GIT repository

Since the availability of a dedicated [installer for the Beaglebone Black](https://gitlab.com/chris.willing/xkeys-server/-/releases), this following section is largely redundant. It remains here as an example of how to install and run _xkeys-server_ on an otherwise unsupported system.

The instructions here are specific to the unofficial Ubuntu version ([from latest available directory here](https://rcn-ee.com/rootfs/ubuntu-armhf/)), although other similar ports e.g. the official Debian installation, should be similar. The Ubuntu release for the Beaglebone is currently 20.04 and the version of NodeJS is too old for _xkeys_server_ so the third-party [NodeSource PPA](https://github.com/nodesource/distributions) will be used to install a more recent version.

Although not mandatory, experience has shown that setting the TERM variable in the user environment can be beneficial. Using _vi_ or _nano_, edit the _.profile_ file (in the home directory) and add the line `TERM=xterm` or `TERM=xterm-color` somewhere in that file. Now log out and log in again for the setting to take effect.

Since the onboard memory of these boards is extemely limited, it is essential to boot using an addon SD card - 16G should be the minimum size. Once the Ubuntu port has been installed, it is assumed these instructions will be implemented via ssh as the default user _ubuntu_. To fully utilise the available space of the SD card being used, it is important to [expand the filesystem partition](https://elinux.org/Beagleboard:Expanding_File_System_Partition_On_A_microSD) of the initial installer. After rebooting following filesystem expansion, confirm the newly available disk space with the command `df -kh` (and check the result's Size entry for /dev/mmcblk0p1). 

Before installing anything new, ensure that all existing software is up to date with the following commands:
```
    sudo apt update
    sudo apt upgrade
```


**Enable NodeSource PPA**

Find and run the [PPA enabling command here](https://github.com/nodesource/distributions#debinstall) (feel free to read the documentation there too). At the time of writing, version 14.x is the minimum required to run _xkeys-server_ with full functionality. The command will be something like (depending on the version chosen):
```
    curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
```
Now install the NodeJS version that was enabled:
```
    sudo apt install -y nodejs
```


**Preparation for _xkeys-server_**

The installation of _xkeys_server_ requires building of some components so install the necessary tools with:
```
    sudo apt install -y build-essential libudev-dev libusb-1.0-0-dev pkg-config
```
At runtime, _xeys-server_ will require the user to have access to USB devices. Enable this by creating the file _/etc/udev/rules.d/50-xkeys.rules_ with the following content:
```
    SUBSYSTEM=="input", GROUP="input", MODE="0666"
    SUBSYSTEM=="usb", ATTRS{idVendor}=="05f3", MODE:="0666", GROUP="plugdev"
    KERNEL=="hidraw*", ATTRS{idVendor}=="05f3", MODE="0666", GROUP="plugdev"

```
and (after save & quit) enable immediate access with:
```
    sudo udevadm control --reload-rules && sudo udevadm trigger
```

**Install _xkeys_server_**

In the _ubuntu_ user's home directory, use _git_ to download the _xkeys-server_ code from the repository:
```
    git clone https://gitlab.com/chris.willing/xkeys-server
```
Now set it up with:
```
    cd xkeys-server
    npm install
```

**Run _xkeys-server_**

There are several ways to now run the xkeys-server. To run _xkeys-server_ immediately, use the command (while still in the _xkeys-server_ directory):
```
    ./scripts/xkeys-server.js
```
It may be stopped by typing Ctrl-C in the same terminal. The advantage of running _xkeys-server_ in this way is that there is some progress feedback in the terminal e.g. notification about devices being plugged or removed. This is a good method to initially check that everything is working as expected. A disadvantage is that it requires the user to remain logged in while the _xkeys-server_ is running.

Another way to run the _xkeys-server_ which doesn't require the user to remain logged in, and also starts _xkeys-server_ automatically on reboot, is to use a systemd service script. This is the recommend method for long term usage. To do so, install this [xkeys-server.service](xkeys-server.service) file to the _/etc/systemd/system/_ directory and enable it with the commands:
```
    sudo cp xkeys-server.service /etc/systemd/system/
    sudo systemctl enable xkeys-server
    sudo systemctl start xkeys-server
```
When first trying this method, a number of checks are available to confirm that _xkeys-server_ is running as expected.
- check systemd status:
```
    systemctl status xkeys-server
```
- continuously monitor system journal output:
```
    journalctl -f
```
- check existence of _xkeys-server_ process:
```
    ps -ef |grep xkeys
```
