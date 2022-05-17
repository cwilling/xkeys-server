# Packaging for macOS

This is the directory from which installable packages for macOS are created. It is assumed that the necessary dependencies for _xkeys-server_ have already been installed (with `npm install` in the ../../xkeys-server directory).

To create a package, run the _make-macos_ script here on a macOS machine i.e.
```
    ./make-macos
```
This will create a new target directory with a number of subdirectories. The installable package will be found in _target/pkg-signed_ e.g.
```
    target/pkg-signed/xkeys-server-macos-installer-0.9.4-x86_64.pkg
``` 
The package may be distributed by any desired means for end users to install in the usual manner. However, a signed and _Apple notarized_ package is required for recent macOS systems which employ _Gatekeeper_ technology to prevent downloaded packages being installed unless they have been signed and notarized in the Apple approved manner.

## Signing requirements

While it is not intended to provide detailed information about Apple's signing procedures, a brief summary of relevant requirements is as follows:

- obtain a paid Apple Developer ID
- install a "Developer ID Application" certificate
- install a "Developer ID Installer" certificate
- check Keychain app that these certificates display no error
- certificate errors may be due to missing or out of date intermediate certificates
- obtain an application specific password
- install XCode - it's command line tools are required for Apple notarization

## Packaging strategy

The aim is to install the _xkeys-server_ and have it run as a daemon with as little need for user intervention as possible.

The _xkey-server_ files are installed into the _/Library/xkeys-server/VERSION_ directory on the target machine. Additionally, a _launchd_ property list file is installed as _/Library/LaunchDaemons/com.xkeys-server.daemon.plist_ in preparation for execution of _xkeys-server_ as a daemon. If installation is successful, the _postinstall_ script will start daemon operation by executing `launchctl load /Library/LaunchDaemons/com.xkeys-server.daemon.plist`. The daemon can be stopped from a terminal with: `launchctl unload /Library/LaunchDaemons/com.xkeys-server.daemon.plist`

The installer package created by running _make-macos_ will be found in _target/pkg-signed/xkeys-server-macos-installer-VERSION.pkg_. While this installer can be used on the local machine, it will fail if downloaded via a browser on other machines. To make such installation possible, the initial installer package must be subjected to Apple notarization. To avoid entering sensitive passwords at the command line during the notarization process, it is highly recommended to obtain an application specific password from appleid.apple.com; that process should provide a password that looks something like _abcfd-ghijk-lmnop-qrstu_. Add the application specific password that was generated to the local Keychain with:
```
    xcrun altool --store-password-in-keychain-item XALTOOL -u YOUR_APPLE_ID -p APP_SPECIFIC_PASSWORD
```
where XALTOOL is an arbitrary label (use whatever you like) to use later when the app specific password needs to be accessed, APPLE_ID will be your Apple id - something like chris.willing@example.com - and APP_SPECIFIC_PASSWORD is the app specific password previously generated at appleid.apple.com.

Apple notarization requires submission of the signed package (created above with _make-macos_) for Apple to run automated tests which determine it's suitablility for installation. Run the command:
```
    xcrun altool --notarize-app --primary-bundle-id com.xkeys-server.daemon -u APPLE_ID -p @keychain:XALTOOL -f target/pkg-signed/xkeys-server-macos-installer-VERSION.pkg
```
(note use of _@keychain:XALTOOL_ for the password field to avoid entering password for your Apple ID).
The command may take 10-20 seconds to complete but will eventually return a _RequestUUID_ - something like `RequestUUID = 11b84517c-e9ad-454b-8c07-e47a9ac19bb8`. The RequestUUID is merely a submission acknowledgment, _not_ an indication of notarization completion. When Apple completes the notarization process, success or failure will be advised by email. Alternatively, notarization progress can be queried with:
```
    xcrun altool --notarization-info 11b84517c-e9ad-454b-8c07-e47a9ac19bb8
```
(using the previously supplied RequestUUID).
In the event of failure, a url will be supplied at which the reasons for rejection will be found. In the event of success, the "approval" should be stapled to the package before dissemination with:
```
    xcrun stapler staple target/pkg-signed/Xkeys-Server-macos-installer-VERSION.pkg
```
which should return with `"The staple and validate action worked!"`. The package can now be made available for downloading.


## Uninstall

An end user _xkeys-server_ installation may be completely removed by using the terminal command: `sudo bash /Library/xkeys-server/0.9.4/uninstall.sh` which will stop the running _xkeys-server_ daemon, unregister the package from the _pkgutil_ database and remove _xkeys-server_ related files from the _/Library_ and _/Library/LaunchDaemons_ directories.

## Acknowledgements

This installer creation mechanism is based on [Kosala Herath's work](https://github.com/KosalaHerath/macos-installer-builder) and his [associated explanatory article](https://medium.com/swlh/the-easiest-way-to-build-macos-installer-for-your-application-34a11dd08744).
