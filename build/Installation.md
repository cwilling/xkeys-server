# Installation

These are the end user instructions for the installation of _xkeys-server_

For Linux systems, both _.deb_ and _.rpm_ installation packages are available for _x86\_64_ architectures. There is also a _.deb_ installation package for the _armhf_ architecture (RaspiOS).

For Debian, Ubuntu, Mint and other distros using _.deb_ installation packages, locate and download the installation package e.g. 
```
    sudo apt install xkeys-server-0.9.1_amd64.deb
```
For RedHat, Fedora, Centos and other _.rpm_ based distros, locate and install the appropriate installation package e.g.
```
    sudo dnf install xkeys-server-0.9.1_x86_64.rpm
```
To meet all the package prerequisites, additional package repositories may need to be enabled. For instance, the EPEL repository is required to be enabled for Centos systems. If not already enabled, it may be enabled with:
```
    sudo dnf install epel-release
```
