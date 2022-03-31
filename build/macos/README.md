# Packaging for macOS

This is the directory from which installable packages for macOS are created. To create a package, run the _make-macos_ script here on a macOS machine, passing the script the desired package version number e.g.
```
    make-macos 1.0.0
```
This will create a new target directory with a number of subdirectories. The installable package will be found in _target/pkg_ e.g.
```
    target/pkg/xkeys-server-macos-installer-x86-1.0.0.pkg
``` 
The package may be distributed by any desired means for end users to install in the usual manner.

## Packaging strategy

The aim is to install the _xkeys-server_ and have it run as a daemon with as little need for user intervention as possible. Since the _xkeys-server_ will eventually have to run in a NodeJS environment, the installer's readme stage advises the user of the need to install NodeJS before proceeding. The end user machine architecture is unknown when the package is being created so no dependencies under _node_modules_ are shipped in the package. Instead, _keys-server_ is instantiated by _npm_ in conjunction with a _start_ command in the _package.json_ file so that running _`npm start`_ will actually execute _`npm install`_ (to install the _node_modules_ heirarchy) before running the _xkeys-server.js_ script itself.

The _xkey-server_ files are installed into the _/Library/xkeys-server/VERSION_ directory on the target machine. Additionally, a _launchd_ property list file is installed as _/Library/LaunchDaemons/com.xkeys-server.daemon.plist_ in preparation for execution of _xkeys-server_ as a daemon. However the _preinstall_ script will abort the installation if no suitable NodeJS installation is detected. If installation is successful, the _postinstall_ script will start daemon operation with `launchctl load /Library/LaunchDaemons/com.xkeys-server.daemon.plist`. The daemon can be stopped from a terminal with: `launchctl unload /Library/LaunchDaemons/com.xkeys-server.daemon.plist`

## Uninstall

An end user _xkeys-server_ installation may be completely removed by using the terminal command: `/Library/xkeys-server/1.0.0/uninstall.sh` which will stop the running _xkeys-server_ daemon, unregister the package from the _pkgutil_ database and remove _xkeys-server_ related files from the _/Library_ and _/Library/LaunchDaemons_ directories.

## Acknowledgements

This installer creation mechanism is based on [Kosala Herath's work](https://github.com/KosalaHerath/macos-installer-builder) and his [associated explanatory article](https://medium.com/swlh/the-easiest-way-to-build-macos-installer-for-your-application-34a11dd08744).
