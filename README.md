# xkeys-server

The _xkeys-server_ is a ***cross platform***, stand alone ***NodeJS*** application, using [SuperFlyTV's library (SFTV)](https://github.com/SuperFlyTV/xkeys) to interact with [***X-keys devices***](https://xkeys.com/). Since version 0.9.7, [***Elgato Streamdeck devices***](https://www.elgato.com/en/stream-deck) are also supported, using [Julusian's library for Elgato devices](https://www.npmjs.com/package/@elgato-stream-deck/node). User applications wishing to access X-keys or Streamdeck devices could easily do so directly by using the appropriate SFTV or Julusian NodeJS library. The advantage of accessing these devices via the _xkeys-server_ is the reduction (elimination?) of contention between multiple client applications which may simultaneously wish to control these devices.

Communication between applications and the _xkeys-server_ may be via UDP or MQTT protocol. Client applicatons using UDP are restricted to the local network and may use a simple discovery mechanism to automagically connect to a local _xkeys-server_. UDP clients use the publicly available (soon to be released) **Dynamic Control Data (DCD)** protocol, allowing them to access any other manufacturers' devices which are acccessible (either directly or through some library) via the DCD protocol.

MQTT clients will typically use an MQTT broker e.g. [mosquitto](https://mosquitto.org) running on the host machine, although any MQTT broker across the world could be used. A typical MQTT use-case is when multiple _Node-RED_ nodes interact with attached X-keys devices. Examples may be found in the [node-red-contrib-xkeys](https://gitlab.com/chris.willing/node-red-contrib-xkeys) project. 

Since communication is via established networking protocols, clients may be written in any desired progamming language - not restricted to NodeJS/Javascript/Typescript when using the SFTV or Julusian libraries directly.

Being a NodeJS application, _xkeys-server_ is able to be run on ***Linux*** (including Raspberry Pi), ***MacOS*** (x86_64 or arm64) or ***Windows*** machines. Client applications may run on any system capable of UDP and/or MQTT.

## Installation

_Xkeys-server_ package installers for end users will be available for Linux, Raspberry Pi, MacOS & Windows. Prerelease installers are available for testing at the [Releases page](https://gitlab.com/chris.willing/xkeys-server/-/releases/0.9.7).

## Development

Rather than running a prebuilt installer package, developers should fork this repository and run the following commands to implement a basic setup on any of the supported platforms (assuming _NodeJS_ and _git_ are already installed):
```
    cd xkeys-server
    npm install
    ./scripts/xkeys-server.js
```

When running the _xkeys-server_ in this way, some dependencies of the SuperFlyTV & Julusian librarie may have to be rebuilt for the host machine architecture when the `npm install` command is run. This requires some development tools & library to be installed:
```
sudo apt install -y build-essential nodejs npm git libudev-dev
```

Before running the _xkeys-server_ for the first time, adjustments to access permissions for X-keys devices are needed. Save the following to `/etc/udev/rules.d/50-xkeys.rules` and reload the rules with `sudo udevadm control --reload-rules && sudo udevadm trigger`
```
SUBSYSTEM=="input", GROUP="input", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="05f3", MODE:="0666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="05f3", MODE="0666", GROUP="plugdev"
```
A similar file is required for Elgato Streamdeck devices. In this case, save the following to `/etc/udev/rules.d/50-elgato.rules`; then reload the rules with `sudo udevadm control --reload-rules && sudo udevadm trigger`
```
SUBSYSTEM=="input", GROUP="input", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0060", MODE:="666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0063", MODE:="666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006c", MODE:="666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006d", MODE:="666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0080", MODE:="666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0086", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0060", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0063", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006c", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006d", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0080", MODE:="666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0086", MODE:="666", GROUP="plugdev"
```



## Upgrading

When upgrading any of the supplied end user _xkeys-server_ installers, previous installations are automatically uninstalled first.

If changing from a development to an end user installation, ensure that any arrangements to run as a daemon are first fully undone e.g.
```
    sudo systemctl stop xkeys-server
    sudo systemctl disable xkeys-server
```

## Acknowledgments
Many thanks to [P.I. Engineering](https://xkeys.com/) for the donation of several devices for development and testing.

Thanks also to the authors and contributers of the [SuperFly TV](https://github.com/SuperFlyTV/xkeys) and [Julusian](https://github.com/Julusian/node-elgato-stream-deck) libraries.

## License
MIT
