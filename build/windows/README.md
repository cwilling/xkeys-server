# Packaging _xkeys-server_ for Windows

These instructions to package _xkeys-server_ for Windows use comand line instructions executed in Windows Powershell. The build machine in which they are executed is expected to have _git_  and _NodeJS_ installed (however these are not needed on end user machines). These applications may be installed with:
```
    winget install --id Git.Git --source winget
    winget install --id OpenJS.NodeJS.LTS --source winget
```
With these installed, clone this repository with the command:
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
    npm pkg -t node16-win-x64 --out-path application ..
```
The executable _xkeys-server.exe_ will be found in the application directory from where it can be added to a Windows installer for distribution.
