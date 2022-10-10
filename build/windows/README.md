# Packaging _xkeys-server_ for Windows

#### Step 1 - build the _xkeys-server_ executable

These instructions to build the _xkeys-server_ for Windows use comand line instructions executed in Windows Powershell. The build machine in which they are executed is expected to have _Visual Studio_, _git_  and _NodeJS_ installed (however these are not needed on end user machines). These applications may be installed from the command line with:
```
    winget install --id Microsoft.VisualStudio.2022.Community --source winget
    winget install --id Git.Git --source winget
    winget install --id OpenJS.NodeJS.LTS --source winget
```
Since version 0.9.15, which includes service discovery via DNS-SD, the [Bonjour SDK for Windows](https://developer.apple.com/download/all/?q=Bonjour%20SDK%20for%20Windows) is now required to be installed (requires reboot after installation).

With all these installed, clone the _xkeys-server_ repository with the command:
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
    npx pkg -t node16-win-x64 --out-path application ../..
```
The executable _xkeys-server.exe_ will be found in the application directory from where it can be added to a Windows installer for distribution.

#### Step 2 - create the installer

Many sites may already have established workflows for generating application installers. The method outlined here uses the open source [Nullsoft Scriptable Install System (NSIS)](https://nsis.sourceforge.io) which may be installed with:
```
    winget install NSIS.NSIS --source winget
```
Compile the _xkeys-server-installer.nsi_ file in this directory from a command prompt with:
```
    makensis .\xkeys-server-installer.nsi
```
Alternatively, the NSIS gui can be used to load and compile the _xkeys-server-installer.nsi_ file.

The resulting installer _xkeys-server-installer.exe_ can be distributed for end users to install _xkeys-server_ in a familiar way. On installation using this installer, _xkeys-server_ is started immediately and is configured to run automatically if the system is rebooted.


#### Notes on Bonjour

We include Bonjour.msi & Bonjour64.msi in the Windows installer on the basis of:
    https://developer.apple.com/licensing-trademarks/bonjour/

which contains the sentence (note point 2):
```
This page contains agreements allowing you to:
    - Use the Bonjour logo with your application (on macOS and non-Windows platforms).
    - Redistribute the Bonjour for Windows installer as part of your Windows application.
    - Download and use the Bonjour for Windows SDK to develop Bonjour-enabled applications on Windows.
    - Download and run the Bonjour Conformance Test.
```

Bonjour.msi & Bonjour64.msi were obtained by extraction from BonjourPSSetup.exe,
obtained from:
    https://support.apple.com/kb/dl999?locale=en_US
