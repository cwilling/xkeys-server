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
