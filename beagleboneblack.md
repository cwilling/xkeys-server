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
If curious, run `nvm list-remote` to see an exhaustive list of all available NodeJS versions. To check the result, run `nvm list`.
