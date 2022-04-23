# Packaging _xkeys-server_ for Windows

### Build _xkeys-server_

These instructions to build the _xkeys-server_ for Windows use comand line instructions executed in Windows Powershell. The build machine in which they are executed is expected to have _git_  and _NodeJS_ installed (however these are not needed on end user machines). These applications may be installed from the command line with:
```
    winget install --id Git.Git --source winget
    winget install --id OpenJS.NodeJS.LTS --source winget
```
With these installed, clone the _xkeys-server_ repository with the command:
```
    git clone https://gitlab.com/chris.willing/xkeys-server
```
Now enter the resulting _xkeys-server_ directory and install all the NodeJS modules required by _xkeys-server_:
```
    cd xkeys-server
    npm install
```
Now enter the build/windows directory and generate the xkeys-server executable:
```
    cd build/windows
    npm pkg -t node16-win-x64 --out-path application ../..
```
The executable _xkeys-server.exe_ will be found in the application directory from where it can be added to a Windows installer for distribution.

### Create the installer

Many sites may already have established workflows for generating application installers. The method outlined here uses the open source [Nullsoft Scriptable Install System (NSIS)](https://nsis.sourceforge.io) which may be installed with:
```
    winget install NSIS.NSIS --source winget
```
Run the _NSIS_ executable and load & compile the _xkeys-server-installer.nsi_ file in this directory. The resulting installer _xkeys-server-installer.exe_ can be distributed for end users to install _xkeys-server_ in a familiar way. On installation using this installer, _xkeys-server_ is started immediately and is configured to run automatically if the system is rebooted.

