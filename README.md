# xkeys-server

The _xkeys-server_ is a ***cross platform***, stand alone ***NodeJS*** application, wrapping [SuperFlyTV's library (SFTV)](https://github.com/SuperFlyTV/xkeys) to interact with [***X-keys devices***](https://xkeys.com/). User applications wishing to access X-keys devices could easily do so directly by using the NodeJS library. The advantage of accessing X-keys devices via the _xkeys-server_ is the reduction (elimination?) of contention between multiple client applications which may simultaneously wish to control these devices.

Communication between applications and the _xkeys-server_ may be via UDP or MQTT protocol. Client applicatons using UDP are restricted to the local network and may use a simple discovery mechanism to automagically connect to a local _xkeys-server_. UDP clients use the soon to be released **Dynamic Control Data (DCD)** protocol, allowing them to access other manufacturer's devices which also implement the DCD protocol.

MQTT clients will typically use an MQTT broker e.g. [mosquitto](https://mosquitto.org) running on the host machine, although any MQTT broker across the world could be used. A typical MQTT use-case is when multiple _Node-RED_ nodes interact with attached X-keys devices. Examples may be found in the [node-red-contrib-xkeys](https://gitlab.com/chris.willing/node-red-contrib-xkeys) project. 

Being a NodeJS application, _xkeys-server_ is able to be run on ***Linux*** (including Raspberry Pi), ***MacOS*** (x86_64 or arm64) or ***Windows*** machines. Client applications may run on any system capable of UDP networking.

## Installation

_Xkeys-server_ package installers for end users will be available for Linux, MacOS & Windows.

In the meantime, command line capable users (or potential developers) could run the following commands to implement a basic setup on any of the supported platforms (assuming _NodeJS_ and _git_ are already installed):
```
    git clone https://gitlab.com/chris.willing/xkeys-server
    cd xkeys-server
    npm install
    ./scripts/xkeys-server.js
```

Alternatively, here is a more elaborate setup which runs _xkeys_server_ as a daemon application that survives machine reboots.
Intended for the Raspberry Pi, these instructions are sufficiently generic to apply, with minimal change, to other Linux-based systems.

First ensure that the mosquitto MQTT broker is installed and running:
```
sudo apt install mosquitto
```
Now start the service and enable automatic restart on system reboot:
```
sudo systemctl start mosquitto.service
sudo systemctl enable mosquitto.service
```
Add an _xkeys_ user under which to to run _xkey-server_
```
sudo adduser --home /var/lib/xkeys xkeys
```
When installing the _xkeys-server_, the SuperFlyTV library will have to be rebuilt for the Raspberry Pi's machine architecture, which requires some development tools & library:
```
sudo apt install -y build-essential
sudo apt install libudev-dev
```
Now download the _xkeys-server_ into _xkeys_ home directory and install its dependencies:
```
sudo su - xkeys
git clone https://gitlab.com/chris.willing/xkeys-server.git
cd xkeys-server
npm install
exit
```


Before running the _xkeys-server_ for the first time, adjustments to access permissions for X-keys devices are needed. Save the following to `/etc/udev/rules.d/50-xkeys.rules` and reload the rules with `sudo udevadm control --reload-rules && sudo udevadm trigger`
```
SUBSYSTEM=="input", GROUP="input", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="05f3", MODE:="0666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="05f3", MODE="0666", GROUP="plugdev"
```


Finally, setup _xkeys-server_ to start now, as well as to automatically restart on system reboot:
```
sudo cp /var/lib/xkeys/xkeys-server/xkeys-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable xkeys-server
sudo systemctl start xkeys-server
```
Check that it's running:
```
ps -ef |grep xkeys-server
```


## Upgrading

First, stop the running version. This can take a while on a Raspberry Pi so just wait until the command prompt returns:
```
sudo systemctl stop xkeys-server
```

The actual upgrading to the latest version now requires downloading it from the development repository and then installing it:
```
sudo su - xkeys
cd xkeys-server
git pull
npm install
exit
```
Now start the new version:
```
sudo systemctl start xkeys-server
```
Check that it's running:
```
ps -ef |grep xkeys-server
```
