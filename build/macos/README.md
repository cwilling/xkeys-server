# Packaging for macOS

This is the directory from which installable packages for macOS are created. It is assumed that the necessary dependencies for _xkeys-server_ have already been installed (with `npm install` in the ../../xkeys-server directory).

To create a package, run the _make-macos_ script here on a macOS machine i.e.
```
    ./make-macos
```
This will create a new target directory with a number of subdirectories. The installable package will be found in _target/pkg-signed_ e.g.
```
    target/pkg-signed/xkeys-server-macos-installer-x86-1.0.0.pkg
``` 
The package may be distributed by any desired means for end users to install in the usual manner. A signed package is required for recent MacOS systems which employ a _Gatekeeper_ to prevent downloaded packages being installed unless they have been signed in the Apple approved manner.

## Signing requirements

While it is not intended to provide detailed information about Apple's signing requirements, a brief summary of them is as follows:

- a paid Apple Developer ID is required
-

## Packaging strategy

The aim is to install the _xkeys-server_ and have it run as a daemon with as little need for user intervention as possible.

The _xkey-server_ files are installed into the _/Library/xkeys-server/VERSION_ directory on the target machine. Additionally, a _launchd_ property list file is installed as _/Library/LaunchDaemons/com.xkeys-server.daemon.plist_ in preparation for execution of _xkeys-server_ as a daemon. If installation is successful, the _postinstall_ script will start daemon operation with `launchctl load /Library/LaunchDaemons/com.xkeys-server.daemon.plist`. The daemon can be stopped from a terminal with: `launchctl unload /Library/LaunchDaemons/com.xkeys-server.daemon.plist`

## Uninstall

An end user _xkeys-server_ installation may be completely removed by using the terminal command: `/Library/xkeys-server/VERSION/uninstall.sh` which will stop the running _xkeys-server_ daemon, unregister the package from the _pkgutil_ database and remove _xkeys-server_ related files from the _/Library_ and _/Library/LaunchDaemons_ directories.

## Acknowledgements

This installer creation mechanism is based on [Kosala Herath's work](https://github.com/KosalaHerath/macos-installer-builder) and his [associated explanatory article](https://medium.com/swlh/the-easiest-way-to-build-macos-installer-for-your-application-34a11dd08744).
