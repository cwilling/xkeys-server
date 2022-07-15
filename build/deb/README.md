# Packaging for _apt_ based package managers

This is the directory from which installable _.deb_ packages are created for Linux distros using _apt_ based package managers. To create a package, run the make-deb script here on an approriate machine. On successful completion, the resulting package's location is reported. It can be installed with (insert correct version):
```
	sudo apt install ./xkeys-server-0.9.14_amd64.deb
```

As part of the installation, an _xkeys_ user is created and used as the owner of the running _xkeys-server_. If some other behaviour is preferred, change the relevant section of the _postinst_ file and run _make-raspi_ again to create a new package.

Please note that packages created here are **not** suitable for the Raspberry Pi. Please see the _raspi_ directory instead.
