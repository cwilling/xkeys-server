# Packaging the xkeys-server for Raspberry Pi
The usual way to generate an installable xkeys-server package
for the Raspberry Pi is to run the _make-raspi_ script.

It differs slightly from the normal .deb packager in that it
uses an AppImage to consolidate the various NodeJS scripts
for _xkeys-server_ (as well as it's dependent packages) into a single
executable.

First, install prerequisite development packages with:
```
	sudo apt install build-essential git
```
No third party repos are required provided _apt_ is  configured for both _main_ and _contrib_ branches. Install other packages required for packaging _xkeys-server_ with:
```
	sudo apt install nodejs npm libuv1-dev libudev-dev libfuse-dev
```

After running _make-raspi_, the location of the resulting .deb package will be reported (probably here). 
