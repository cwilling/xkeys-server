# Building and packaging xkeys-server

Our aim is to produce installable packages for the major platforms, so that _xkeys-server_ is able to run as a daemon with as little user intervention as possible.

Each of the _deb_, _rpm_, _macos_ and _win_ subdirectories contains a respective _make-deb_, _make-rpm_, etc. shell script which does the necessary work. It is expected that each of these scripts is run on the correct platform e.g. _make-macos_ is expected to be executed in a MacOS system.
