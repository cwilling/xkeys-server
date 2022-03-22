# Packaging the xkeys-server

### Step 1 - create an AppImage

Creating an AppImage enables all the xkeys-server scripts
(including node_modules) to be collected into a single executable
capable of running from any location in the file system.

The AppImages are created using the AppImage scripts provided:
`armhf.AppImage`, `x86_64.AppImage`, etc.

Since the resulting AppImage may differ depending on the platform it was
created on, it's probably best to run the script from the deb or the rpm
directory immediately prior to generating the installable .deb or .rpm
package. e.g. running the `x86_64.AppImage` script from the deb directory:
```
../x86_64.AppImage
```
will produce an _xkeys-server-x86\_64.AppImage_ executable in this directory,
where the make-* scripts of Step 2 will expect to find it.

### Step 2 - create an installable .deb, .rpm, etc. package.

Each deb, rpm, etc. directory contains a respective _make-deb_, _make-rpm_,
_make-whatever_ script to generate the installable package for that platform.
These scripts use platform tools which are expected to already be installed.

To install build tools for _make-rpm_, run the command
```
	sudo dnf install -y rpmdevtools rpmlint
```

