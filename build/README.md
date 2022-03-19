### Packaging the xkeys-server

# Step 1 - create an AppImage

Creating an AppImage enables all the xkeys-server scripts
(including node_modules) to be collected into a single executable
capable of running from any location in the file system.

The AppImages are created using the AppImage scripts provided:
	armhf.AppImage, x86_64.AppImage, etc.
e.g. running the x86_64.AppImage script will produce an
xkeys-server-x86_64.AppImage executable in this directory.

# Step 2 - create an installable .deb, .rpm, etc. package.


