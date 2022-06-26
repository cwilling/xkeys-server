## Installing _xkeys-server_ on the BeagleBone Black

[BeagleBone Black](https://beagleboard.org/black) is a low-cost, community-supported development platform for developers and hobbyists. The instructions here are specific to the unofficial Ubuntu version ([from latest available directory here](https://rcn-ee.com/rootfs/ubuntu-armhf/)), although other similar ports e.g. the official Debian installation, should be similar. The Ubuntu release for the Beaglebone is currently 20.04 and the version of NodeJS is too old for _xkeys_server_ so the [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm) will be used to install a more recent version.

Although not mandatory, experience has shown that setting the TERM variable in the user environment can be beneficial. Using _vi_ or _nano_, edit the _.profile_ file (in the home directory) and add the line `TERM=xterm` or `TERM=xterm-color` somewhere in that file. Now log out and log in again for the setting to take effect.

Since the onboard memory of these boards is extemely limited, it is essential to boot using an addon SD card - 16G should be sufficient. Once the Ubuntu port has been installed, it is assumed these instructions will be implemented via ssh as the default user _ubuntu_. To fully utilise the available space of the SD card being used, it is important to [expand the filesystem partition](https://elinux.org/Beagleboard:Expanding_File_System_Partition_On_A_microSD) of the initial installer.

Before installing anything new, ensure that all existing software is up to date with the following commands:
```
    sudo apt update
    sudo apt upgrade
```


**Install Node Version Manager (nvm)**

Find and run the [installation command here](https://github.com/nvm-sh/nvm#installing-and-updating) (feel free to read the documentation there too). The installation command will be something like (depending on the current version):
```
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
```
Now log out and log back in to make the _nvm_ commands available.

Install a usable NodeJS version, run the command:
```
    nvm install v14.19.3
```
To check the result, run `nvm list`, which should return something like:
```
    ubuntu@ubuntu:~$ nvm list
    ->     v14.19.3
    default -> v14.19.3
    iojs -> N/A (default)
    unstable -> N/A (default)
    node -> stable (-> v14.19.3) (default)
    stable -> 14.19 (-> v14.19.3) (default)
    lts/* -> lts/gallium (-> N/A)
    lts/argon -> v4.9.1 (-> N/A)
    lts/boron -> v6.17.1 (-> N/A)
    lts/carbon -> v8.17.0 (-> N/A)
    lts/dubnium -> v10.24.1 (-> N/A)
    lts/erbium -> v12.22.12 (-> N/A)
    lts/fermium -> v14.19.3
    lts/gallium -> v16.15.1 (-> N/A)
    ubuntu@ubuntu:~$
```
If curious, run `nvm list-remote` to see an exhaustive list of all available NodeJS versions.

**Preparation for _xeys-server_**

The installation of _xkey_server_ requires building of some components so install the necessary tools with:
```
    sudo apt install -y build-essential libudev-dev
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

**Run _xkey-server_**

THere are several ways to now run the xkeys-server. To run _xkeys-server_ immediately, use the command (while still in the _xkeys-server_ directory):
```
    ./scripts/xkeys-server
```
It may be stopped by typing Ctrl-C in the same terminal. The advantage of running _xkeys-server_ in this way is that there is some progress feedback in the terminal e.g. notification about devices being plugged or removed. A disadvantage is that it requires the user to remain logged in while the _xkeys-server_ is running.

Another way to run the _xkeys-server_ which doesn't require the user to remain logged in, and also starts automatically on reboot, is to use a systemd service script. To do so, install this [xkeys-server.service](xkeys-server.service) file to the _/etc/systemd/system/_ directory and enable it with the commands:
```
    sudo cp xkeys-server.service /etc/systemd/system/
    sudo systemctl enable xkeys-server
    sudo systemctl start xkeys-server
```
