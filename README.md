# xkeys-server

The xkeys-server is a stand alone NodeJS application, wrapping [SuperFlyTV's library](https://github.com/SuperFlyTV/xkeys) to interact with [X-keys](https://xkeys.com/) devices. Other applications wishing to access X-keys devices may do so directly or via the xkeys-server. Access via the xkeys-server aims to reduce contention when multiple applications may simultaneously wish to control these devices. A typical use-case is when multiple Node-RED nodes interact with attached X-keys devices. 

Communication between applications and xkeys-server uses the MQTT protocol. An MQTT broker, typically [mosquitto](https://mosquitto.org), will run on the host machine. All applications wanting access via xkeys-server, as well as the xkey-server itself, act as MQTT clients of this local broker.

## Installation

These instructions are for installaton on Raspberry Pi but may be sufficiently generic to apply, with minimal change, to other Linux-based systems.

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

Upgrading to the latest version of _xkeys\_server_ firstly involves downloading it from the development repository:
```
sudo su - xkeys
cd xkeys-server
git pull
npm install
exit
```
Now restart to the new version (this can take a while on a Raspberry Pi):
```
sudo systemctl restart xkeys-server
```
Check that it's running:
```
ps -ef |grep xkeys-server
```
